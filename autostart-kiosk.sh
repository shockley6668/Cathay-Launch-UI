#!/bin/bash

echo "Starting Cathay Pacific IFE Autostart Script..."

# Detect if HDMI is connected and force 480x320 framebuffer resolution
HDMI_STATUS=$(DISPLAY=:0 xrandr 2>/dev/null | grep "^HDMI-1 connected" | grep -v "disconnected")

if [ -n "$HDMI_STATUS" ]; then
    echo "HDMI detected. Setting framebuffer to 480x320..."
    DISPLAY=:0 xrandr --fb 480x320
else
    echo "No HDMI. Setting virtual framebuffer 480x320..."
    # Without HDMI, xrandr --fb forces the X11 virtual screen size
    # so x11-to-spi captures the correct 480x320 area
    DISPLAY=:0 xrandr --fb 480x320 2>/dev/null || true
fi
sleep 1

# 1. Start local HTTP server
cd /home/sunrise/cathay_ui
python3 -m http.server 8000 > /tmp/http_server.log 2>&1 &
HTTP_PID=$!
echo "HTTP Server started with PID $HTTP_PID"

# Wait a moment for server to bind
sleep 2

# 2. Kill any existing Firefox instance to avoid session restore prompts
pkill firefox || true
sleep 1

# 3. Launch Firefox in Kiosk mode with hardware acceleration flags
# --use-gl=egl is used for better performance in headless/kiosk setups
firefox --display=:0 \
        --kiosk \
        --use-gl=egl \
        --disable-gpu-sandbox \
        http://localhost:8000/index.html > /tmp/firefox_kiosk.log 2>&1 &
FIREFOX_PID=$!
echo "Firefox Kiosk started with PID $FIREFOX_PID"

echo "Autostart script finished successfully."
