# JS8Call 3.0.3 AppImage requires glibc >= 2.38 and GCC 13 runtime symbols.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive TZ=UTC
RUN sed -i 's|http://archive.ubuntu.com/ubuntu/|http://mirrors.edge.kernel.org/ubuntu/|g' /etc/apt/sources.list.d/ubuntu.sources \
    && apt-get update -o APT::Update::Error-Mode=any && apt-get install -y --no-install-recommends \
    ca-certificates wget curl python3 python3-venv \
    xvfb x11-utils openbox dbus dbus-x11 \
    libx11-xcb1 libxcb-cursor0 libxcb-icccm4 libxcb-image0 libxcb-keysyms1 \
    libxcb-randr0 libxcb-render-util0 libxcb-shape0 libxcb-xinerama0 \
    libxcb-xkb1 libxkbcommon-x11-0 libopengl0 libegl1 libgl1 \
    pulseaudio pulseaudio-utils libasound2t64 libasound2-plugins alsa-utils \
    libhamlib-utils libusb-1.0-0 libportaudio2 libpulse0 libfftw3-double3 \
    && rm -rf /var/lib/apt/lists/*
ARG JS8CALL_VERSION=3.0.3
RUN wget -q -O /tmp/JS8Call.AppImage "https://github.com/JS8Call-improved/JS8Call-improved/releases/download/v${JS8CALL_VERSION}/JS8Call-v${JS8CALL_VERSION}-x86_64.AppImage" \
    && chmod +x /tmp/JS8Call.AppImage \
    && cd /opt && /tmp/JS8Call.AppImage --appimage-extract \
    && ln -s /opt/squashfs-root/AppRun /usr/bin/js8call \
    && rm /tmp/JS8Call.AppImage
COPY --from=ghcr.io/astral-sh/uv:0.12.23 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
ENV UV_PROJECT_ENVIRONMENT=/opt/venv UV_LINK_MODE=copy UV_COMPILE_BYTECODE=1
RUN uv sync --frozen --no-dev --no-install-project
ENV PATH="/opt/venv/bin:$PATH"
# One receive sink; decoder output goes to a separate discard sink.
RUN printf '%s\n' \
    'load-module module-native-protocol-unix' \
    'load-module module-null-sink sink_name=KIWI_RX rate=48000 channels=1 sink_properties=device.description=KiwiSDR_RX' \
    'load-module module-null-sink sink_name=JS8_TX rate=48000 channels=1' \
    'load-module module-remap-source master=KIWI_RX.monitor source_name=JS8_RX source_properties=device.description=KiwiSDR_Input' \
    'set-default-sink JS8_TX' \
    'set-default-source JS8_RX' > /etc/pulse/default.pa
COPY server.py kiwi_client.py kiwi_directory.py websdr_directory.py ./
COPY js8call.ini /app/js8call.ini
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV DISPLAY=:99 XDG_RUNTIME_DIR=/run/user/1000
ENV PULSE_RUNTIME_PATH=/run/user/1000/pulse PULSE_SERVER=unix:/run/user/1000/pulse/native
ENV JS8CALL_HOST=0.0.0.0 JS8CALL_UDP_SERVER_PORT=2242
ENV KIWI_HOST=kiwisdr.example.com KIWI_PORT=8073 KIWI_FREQ=14078 KIWI_MODE=usb
ENV PYTHONUNBUFFERED=1 QT_QPA_PLATFORM=xcb QT_MEDIA_BACKEND=ffmpeg LANG=C.UTF-8
EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
