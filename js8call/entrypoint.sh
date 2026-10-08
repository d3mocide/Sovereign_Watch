#!/usr/bin/env bash
# Critical child failure must stop PID 1 so Docker can restart the service.
set -euo pipefail
log() { echo "[entrypoint] $(date -u '+%H:%M:%S') $*"; }
pids=()
cleanup() {
    trap - EXIT SIGTERM SIGINT
    for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
    wait 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' SIGTERM SIGINT
mkdir -p "$XDG_RUNTIME_DIR" "$PULSE_RUNTIME_PATH" /root/.config
chmod 700 "$XDG_RUNTIME_DIR"
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
# A container has no persistent GUI settings; initialize the named rig each start.
python - <<'PYCONFIG'
import configparser
import os
config = configparser.ConfigParser()
config.optionxform = str
config.read('/app/js8call.ini')
config['Configuration']['MyGrid'] = os.getenv('MY_GRID', 'CN85')
with open('/root/.config/JS8Call - KiwiSDR-Virtual.ini', 'w') as output:
    config.write(output)
PYCONFIG
cp /app/js8call.ini /root/.config/JS8Call.ini
dbus-daemon --session --fork --print-address=1 --print-pid=1 > /tmp/dbus_info
export DBUS_SESSION_BUS_ADDRESS="$(head -n 1 /tmp/dbus_info)"
pids+=("$(tail -n 1 /tmp/dbus_info)")
rm /tmp/dbus_info
Xvfb :99 -screen 0 1280x1024x24 -ac -nolisten tcp &
XVFB_PID=$!; pids+=("$XVFB_PID")
for i in $(seq 1 30); do
    xdpyinfo -display :99 >/dev/null 2>&1 && break
    sleep 0.2
done
xdpyinfo -display :99 >/dev/null 2>&1 || { log 'Display failed'; exit 1; }
openbox >/dev/null 2>&1 &
pids+=("$!")
# Do not connect to PULSE_SERVER until the daemon has created the socket.
PULSE_SERVER= pulseaudio --daemonize=no --exit-idle-time=-1 --realtime=false --high-priority=false --log-level=warn &
PA_PID=$!; pids+=("$PA_PID")
for i in $(seq 1 30); do
    pactl info >/dev/null 2>&1 && break
    sleep 0.2
done
pactl info >/dev/null || { log 'PulseAudio failed'; exit 1; }
# Qt 6 hides sink monitor devices. Expose a regular capture source instead.
if ! pactl list short sources | awk '{print $2}' | grep -qx JS8_RX; then
    pactl load-module module-remap-source master=KIWI_RX.monitor source_name=JS8_RX source_properties=device.description=KiwiSDR_Input
fi
pactl set-default-source JS8_RX
pactl set-default-sink JS8_TX
python /app/server.py &
SERVER_PID=$!; pids+=("$SERVER_PID")
js8call --rig-name=KiwiSDR-Virtual &
JS8CALL_PID=$!; pids+=("$JS8CALL_PID")
log 'Display, audio, decoder and bridge started; supervising critical children'
set +e
wait -n "$XVFB_PID" "$PA_PID" "$JS8CALL_PID" "$SERVER_PID"
result=$?
set -e
log "Critical child exited (status $result); restarting container"
exit 1
