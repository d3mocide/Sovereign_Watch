FROM ubuntu:22.04

# Prevent interactive prompts during apt operations
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# -----------------------------------------------------------------------------
# Layer 1: Core system utilities and build prerequisites
# -----------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    git \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Layer 2: Qt5 runtime libraries required by JS8Call
#
# JS8Call is a Qt5 application. It requires the core widget, network, and
# multimedia stacks. libqt5multimedia5-plugins provides the GStreamer or ALSA
# backend so Qt's QAudioInput can enumerate PulseAudio sources at runtime.
# -----------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    libqt5core5a \
    libqt5gui5 \
    libqt5widgets5 \
    libqt5network5 \
    libqt5sql5 \
    libqt5multimedia5 \
    libqt5multimediawidgets5 \
    libqt5multimedia5-plugins \
    libqt5dbus5 \
    libqt5serialport5 \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Layer 3: X11 virtual framebuffer and display dependencies
#
# Xvfb (X Virtual FrameBuffer) creates an in-memory X11 display. Qt5 requires
# a live X11 DISPLAY even in headless mode – without it, QApplication will
# abort immediately with "cannot connect to X server".
#
# libx11-xcb1: XCB<->Xlib compatibility bridge used by Qt's xcb platform plugin
# libxcb-*   : Low-level XCB protocol extensions expected by the Qt xcb backend
# x11-utils  : xdpyinfo / xwininfo for health-check scripts
# openbox    : Minimal ICCCM-compliant window manager; prevents Qt from logging
#              "No window manager running" warnings that can cause focus errors
# -----------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11-utils \
    x11-xserver-utils \
    libx11-xcb1 \
    libxcb1 \
    libxcb-icccm4 \
    libxcb-image0 \
    libxcb-keysyms1 \
    libxcb-randr0 \
    libxcb-render-util0 \
    libxcb-shape0 \
    libxcb-xinerama0 \
    libxcb-xkb1 \
    libxkbcommon-x11-0 \
    libxkbcommon0 \
    openbox \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Layer 4: D-Bus session daemon
#
# WHY DBUS IS REQUIRED:
# Qt5 applications communicate via D-Bus for several subsystems:
#   1. Qt's QDBusConnection::sessionBus() is initialized on QApplication startup.
#      If no session bus is running, Qt logs warnings and some signal paths fail.
#   2. PulseAudio's "module-dbus-protocol" uses D-Bus for client negotiation.
#      Without a session bus, pactl and other PA utilities cannot authenticate
#      their session-level requests to the per-user daemon.
#   3. JS8Call may use platform theme D-Bus calls (e.g. org.freedesktop.portal.*)
#      for file dialogs and system notifications even in headless operation.
#
# dbus-x11 provides dbus-launch, which starts a session bus AND exports
# DBUS_SESSION_BUS_ADDRESS into the current shell environment – a precondition
# for all of the above to work correctly inside the container.
# -----------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    dbus \
    dbus-x11 \
    libdbus-1-3 \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Layer 5: PulseAudio user daemon + ALSA compatibility shim
#
# PULSEAUDIO ROUTING ARCHITECTURE:
#   KiwiSDR → kiwi_client.py (native async WebSocket) → S16LE PCM bytes
#                ↓ pacat (playback)
#   PulseAudio null sink "KIWI_RX"
#                ↓ monitor source
#   JS8Call QAudioInput → reads "KIWI_RX.monitor" as microphone input
#
# WHY A NULL SINK:
#   The container has no physical sound card. PulseAudio's module-null-sink
#   creates a fully virtual sink that accepts audio writes and exposes a
#   corresponding monitor source. This is the standard Docker audio trick.
#
# libasound2: ALSA userspace library; required by JS8Call's Qt multimedia
#             backend even when PulseAudio is the final destination. Qt will
#             try to dlopen libasound2 at startup and segfault if missing.
# pulseaudio-utils: provides pactl (sink/source management) and pacat
# alsa-utils: provides aplay/arecord for optional diagnostics
# -----------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    pulseaudio \
    pulseaudio-utils \
    libasound2 \
    libasound2-plugins \
    alsa-utils \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Layer 6: Python 3 runtime
# -----------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    python3-setuptools \
    python3-wheel \
    && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Layer 7: Download and install JS8Call-improved .deb package
#
# JS8Call 2.5.2 is the latest stable release as of the image build date.
# The deb is installed via dpkg; apt-get install -f resolves any missing
# runtime deps that dpkg itself cannot fetch (e.g. hamlib, libfftw3).
# -----------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget ca-certificates libhamlib-utils libqt5svg5 libusb-1.0-0 libportaudio2 libpulse0 \
    libfftw3-double3 libopengl0 \
    && rm -rf /var/lib/apt/lists/*

RUN wget -q -O /tmp/JS8Call-2.5.2-x86_64.AppImage "https://github.com/JS8Call-improved/JS8Call-improved/releases/download/release/2.5.2/JS8Call-2.5.2-x86_64.AppImage" \
    && chmod +x /tmp/JS8Call-2.5.2-x86_64.AppImage \
    && cd /opt && /tmp/JS8Call-2.5.2-x86_64.AppImage --appimage-extract \
    && ln -s /opt/squashfs-root/AppRun /usr/bin/js8call \
    && mkdir -p /root/.config && printf "[Main]\n[Configuration]\nTCPEnabled=false\nUDPEnabled=true\nUDPServer=127.0.0.1\nUDPServerPort=2242\nAcceptUDPRequests=true\nUDPClient2=127.0.0.1\nUDPClient2Port=2245\nMyCall=N0CALL\nMyGrid=CN85\n[MultiSettings]\n" > "/root/.config/JS8Call - KiwiSDR-Virtual.ini" \
    && cp "/root/.config/JS8Call - KiwiSDR-Virtual.ini" /root/.config/JS8Call.ini \
    && rm /tmp/JS8Call-2.5.2-x86_64.AppImage && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# Layer 7.5: Install uv for reproducible Python dependency installation
# -----------------------------------------------------------------------------
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# -----------------------------------------------------------------------------
# Layer 8: Python API middleware dependencies (pinned via uv lock file)
# -----------------------------------------------------------------------------
COPY pyproject.toml /tmp/py-deps/
ENV UV_SYSTEM_PYTHON=1
RUN cd /tmp/py-deps && uv pip install --system . && rm -rf /tmp/py-deps


# -----------------------------------------------------------------------------
# PulseAudio configuration: disable hardware detection
#
# In a container there are no physical sinks/sources. We override the default
# PA configuration to suppress autospawn of hardware modules, prevent the
# default auto-detection loop, and enable TCP access for pactl/pacat clients
# that may run in child processes with a different PID namespace.
# -----------------------------------------------------------------------------
RUN mkdir -p /etc/pulse && \
    printf '# Sovereign Watch – PulseAudio virtual-only configuration\n\
    # Hardware auto-detect is intentionally disabled; the container has no\n\
    # physical audio devices. All audio is routed through null sinks.\n\
    \n\
    # Load the basic IPC primitives\n\
    load-module module-native-protocol-unix\n\
    load-module module-native-protocol-tcp auth-anonymous=1\n\
    \n\
    # Enable D-Bus protocol so pactl session commands work\n\
    load-module module-dbus-protocol\n\
    \n\
    # Prevent PulseAudio from probing ALSA hardware (would fail in container)\n\
    # Do NOT load module-detect or module-udev-detect\n\
    \n\
    # Create the static virtual sink for KiwiSDR audio.\n\
    # JS8Call will read from the corresponding monitor source: KIWI_RX.monitor\n\
    load-module module-null-sink sink_name=KIWI_RX sink_properties=device.description="KiwiSDR_Virtual_Sink"\n\
    \n\
    # Set the null sink as the default so JS8Call picks it up automatically\n\
    set-default-sink KIWI_RX\n\
    set-default-source KIWI_RX.monitor\n' > /etc/pulse/default.pa

# Daemon config: keep PA alive even when no clients are connected
RUN printf '# Sovereign Watch – PulseAudio daemon settings for headless container use\n\
    exit-idle-time = -1\n\
    # Disable shared memory transport (not supported between container namespaces)\n\
    shm-size-bytes = 0\n\
    flat-volumes = no\n\
    # Reduce log noise\n\
    log-level = warn\n' > /etc/pulse/daemon.conf

# -----------------------------------------------------------------------------
# Application files
# -----------------------------------------------------------------------------
WORKDIR /app
COPY server.py /app/server.py
COPY kiwi_client.py /app/kiwi_client.py
COPY kiwi_directory.py /app/kiwi_directory.py
COPY websdr_directory.py /app/websdr_directory.py
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# -----------------------------------------------------------------------------
# Runtime environment defaults
# Environment variables can be overridden at container startup via -e flags
# or via docker-compose environment: stanza.
# -----------------------------------------------------------------------------
ENV DISPLAY=:99
ENV PULSE_SERVER=unix:/run/pulse/native
ENV XDG_RUNTIME_DIR=/run/user/1000

# KiwiSDR connection defaults (override at runtime)
ENV KIWI_HOST=kiwisdr.example.com
ENV KIWI_PORT=8073
ENV KIWI_FREQ=14078
ENV KIWI_MODE=usb

# JS8Call API port
ENV JS8CALL_HOST=127.0.0.1
ENV JS8CALL_PORT=2442

# Ensure Python logs are unbuffered
ENV PYTHONUNBUFFERED=1

# FastAPI bridge port
EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
