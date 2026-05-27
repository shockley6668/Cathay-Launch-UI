# RDK X5 — ST7796S SPI LCD + GT911 Touch Setup

Connect a 3.5" ST7796S SPI LCD (480x320) and GT911 capacitive touch panel to the RDK X5, driven by the kernel DRM driver. End result: desktop displayed on boot, touch orientation correct.

> **[中文版本](SPI-LCD-SETUP.zh.md)**

---

## Why Bother with the Kernel Driver?

The old approach used `x11-to-spi.c` in userspace:

```
App → X11 → SHM capture → BGRA→RGB565 → spidev ioctl(PIO) → ST7796S
```

This worked but topped out at ~16 FPS. Bottlenecks: spidev PIO blocks the CPU, DC pin via sysfs GPIO, usleep overhead, SHM capture + pixel format conversion.

With the kernel `panel-mipi-dbi` DRM driver:

```
App → X11 → modesetting → /dev/fb0 → panel-mipi-dbi → SPI DMA → ST7796S
```

X11 writes directly to the kernel framebuffer — zero copy. SPI uses DMA, no CPU blocking. Kernel handles dirty rectangle tracking, only sending changed regions. FPS doubles to 30+, and `x11-to-spi.c` is no longer needed.

Two kernel modules involved:
- `panel_mipi_dbi` + `drm_mipi_dbi` — drives ST7796S LCD, creates `/dev/fb0`
- `goodix_ts` — drives GT911 touch, creates `/dev/input/event1` (already in kernel, no compilation needed)

Note: SPI LCD exposes card0 without GPU rendering. WebGL falls back to Mesa swrast software rendering. For hardware WebGL, use HDMI (vs_drm on card1).

---

## Wiring

### LCD and Touch Pin Connections

```
ST7796S Pin       RDK X5 Pin                    Description
────────────────────────────────────────────────────────────────
VCC               3.3V (pin 1 or 17)            3.3V supply, do NOT use 5V
GND               GND (pin 6/9/25/39)           Common ground
SCL               Physical 23 (SPI1 SCLK)        SPI clock
SDA/SDI           Physical 19 (SPI1 MOSI)        SPI data input
CS                Physical 26 (SPI1 CS1)         Chip select — CS1, NOT CS0
DC/RS             Physical 15 (BCM 22)           Data/command select
RST               Physical 13 (BCM 27)           Reset
LED/BL            Physical 12 (BCM 18)           Backlight control

GT911 Pin         RDK X5 Pin                    Description
────────────────────────────────────────────────────────────────
VCC               3.3V (pin 1 or 17)            3.3V supply
GND               GND (pin 6/9/25/39)           Common ground
SDA               Physical 3 (I2C5 SDA)          I2C data
SCL               Physical 5 (I2C5 SCL)          I2C clock
INT               Physical 4 (BCM 4)             Interrupt (falling edge)
RST               Physical 1 (BCM 1)             Reset
```

Common pitfalls:
- LCD **CS must connect to pin 26 (CS1)**, NOT pin 24 (CS0) — CS0 may have an IMU sensor
- Both devices use **3.3V**, not 5V
- GT911 I2C address is **0x5D**, enumerated on `/dev/i2c-5` on RDK X5

### sysfs GPIO Mapping

RDK X5 uses Hobot GPIO numbering, different from BCM. These mappings are needed for device tree and sysfs operations:

```
BCM Pin    sysfs GPIO    Device Tree phandle      DT offset
──────────────────────────────────────────────────────────────
BCM 22     388           ls_gpio0_porta           pin 9
BCM 27     379           ls_gpio0_porta           pin 0
BCM 18     421           dsp_gpio_porta           pin 10
BCM 4      420           dsp_gpio_porta           pin 9
BCM 1      354           ls_gpio1_porta           pin 7
```

---

## Step-by-Step

### 1. Wire It Up

Follow the table above. Pay special attention to CS on pin 26, 3.3V for both devices, and proper grounding.

### 2. Build Kernel Modules

RDK X5 kernel (6.1.83) does not enable `CONFIG_DRM_PANEL_MIPI_DBI` by default. Two modules need building: `panel_mipi_dbi.ko` and `drm_mipi_dbi.ko`.

Good news: the x5-rdk-gen source tree already has the driver source, Kconfig, and Makefile — you just need to enable one config line and build.

#### Get the Source Tree

x5-rdk-gen is the RDK X5 kernel build system:

```bash
# Install repo
mkdir -p ~/bin
curl https://storage.googleapis.com/git-repo-downloads/repo > ~/bin/repo
chmod a+x ~/bin/repo
export PATH=~/bin:$PATH

# Clone (Tsinghua mirror for speed)
export REPO_URL='https://mirrors.tuna.tsinghua.edu.cn/git/git-repo/'
cd ~
repo init -u git@github.com:D-Robotics/x5-manifest.git -b main
repo sync
```

Key directories:

```
x5-rdk-gen/
├── source/kernel/drivers/gpu/drm/tiny/panel-mipi-dbi.c   ← driver source, already present
├── source/kernel/drivers/gpu/drm/drm_mipi_dbi.c          ← helper module with ST7796S reset timing patch
├── source/kernel/arch/arm64/configs/                      ← defconfig location
├── mk_kernel.sh                                           ← build script
└── mk_debs.sh                                             ← packaging script
```

What's already in the source tree:
- `panel-mipi-dbi.c` — 397 lines, ported from Linux mainline
- `drm_mipi_dbi.c` — reset timing at line 603 patched to `usleep_range(10000, 15000)` (ST7796S needs 10ms, not 20us)
- Kconfig has `CONFIG_DRM_PANEL_MIPI_DBI` entry
- Makefile has `panel-mipi-dbi.o` build rule

**The only thing to do** is enable the module in defconfig.

#### Enable Module Config

Edit `arch/arm64/configs/hobot_x5_rdk_ubuntu_defconfig`, append:

```
CONFIG_DRM_PANEL_MIPI_DBI=m
```

Or via menuconfig:

```bash
cd x5-rdk-gen
./mk_kernel.sh menuconfig
# Device Drivers → Graphics support → Display panels → MIPI DBI compatible display panels
# Press M for module, save and exit
```

#### Set Up Build Environment

x5-rdk-gen needs Ubuntu 22.04 for cross-compilation. If running a different version (e.g., WSL Ubuntu 26.04), use Docker:

```bash
# Install Docker
sudo apt install docker.io
sudo usermod -aG docker $USER
# Re-login shell

# Start 22.04 container with source mounted
docker run -it --name x5-build -v ~/x5-rdk-gen:/work ubuntu:22.04 bash

# Install dependencies inside container
apt update && apt install -y \
  build-essential bc bison flex python3 \
  libncurses5-dev libssl-dev \
  device-tree-compiler u-boot-tools ccache wget git

# Install ARM cross-compilation toolchain
cd /opt
wget http://archive.d-robotics.cc/toolchain/gcc-arm-11.2-2022.02-x86_64-aarch64-none-linux-gnu.tar.xz
tar -xf gcc-arm-11.2-2022.02-x86_64-aarch64-none-linux-gnu.tar.xz

# Verify
/opt/gcc-arm-11.2-2022.02-x86_64-aarch64-none-linux-gnu/bin/aarch64-none-linux-gnu-gcc --version
```

#### Build

```bash
cd /work
./mk_kernel.sh
```

Output modules will be at:
- `source/kernel/drivers/gpu/drm/tiny/panel_mipi_dbi.ko`
- `source/kernel/drivers/gpu/drm/drm_mipi_dbi.ko`

For faster single-module builds:

```bash
cd /work/source/kernel
make ARCH=arm64 \
  CROSS_COMPILE=/opt/gcc-arm-11.2-2022.02-x86_64-aarch64-none-linux-gnu/bin/aarch64-none-linux-gnu- \
  M=drivers/gpu/drm/tiny \
  modules
```

Verify the modules:

```bash
modinfo panel_mipi_dbi.ko | grep depends   # should show drm_mipi_dbi, drm, spi, etc.
modinfo drm_mipi_dbi.ko | grep vermagic     # should show 6.1.83
```

### 3. Generate ST7796S Firmware

The `panel-mipi-dbi` driver loads init commands from `/lib/firmware/panel-mipi-dbi-spi.bin` at startup. The binary format:

```
15 bytes: magic "MIPI DBI\0\0\0\0\0\0\0"
 1 byte:  version (0x01)
 N bytes: command sequence, each [cmd, param_count, param1, param2, ...]
          Delay via NOP: [0x00, 0x01, delay_ms]
```

This repo includes `generate_st7796s_fw.py` — just run it:

```bash
python3 generate_st7796s_fw.py    # generates st7796s.bin (109 bytes)
```

Then transfer to the board (file name must match the device tree compatible string):

```bash
scp st7796s.bin sunrise@192.168.128.10:/tmp/
ssh sunrise@192.168.128.10 "sudo cp /tmp/st7796s.bin /lib/firmware/panel-mipi-dbi-spi.bin"
```

### 4. Device Tree Overlay

Two overlays needed: one for the LCD, one for the touch panel.

#### ST7796S LCD Overlay

Save as `overlay-st7796s.dts`:

```dts
/dts-v1/;
/plugin/;

/ {
    fragment@0 {
        target-path = "/soc/a55_apb0/spi@34010000";
        __overlay__ {
            #address-cells = <1>;
            #size-cells = <0>;

            /* Disable spidev on CS1 to avoid conflict */
            spidev@1 {
                status = "disabled";
            };

            panel-mipi-dbi@1 {
                compatible = "panel-mipi-dbi-spi";
                reg = <1>;                         /* CS1, not CS0 */
                spi-max-frequency = <40000000>;    /* 40MHz */
                dc-gpios = <&ls_gpio0_porta 9 0>;  /* BCM 22 */
                reset-gpios = <&ls_gpio0_porta 0 0>; /* BCM 27 */
                write-only;                        /* ST7796S SPI reads unreliable */

                width-mm = <85>;
                height-mm = <53>;

                panel-timing {
                    clock-frequency = <0>;
                    hactive = <480>;
                    vactive = <320>;
                    hfront-porch = <0>;
                    hsync-len = <0>;
                    hback-porch = <0>;
                    vfront-porch = <0>;
                    vsync-len = <0>;
                    vback-porch = <0>;
                };
            };
        };
    };
};
```

Key points:
- `reg = <1>` selects CS1. CS0 may be used by an IMU sensor — don't conflict
- `write-only` is required. ST7796S SPI reads are unreliable; without it the driver will skip init after failing ID read
- `width-mm` / `height-mm` and porch values are validation requirements for `of_get_drm_panel_display_mode()`, even though ST7796S is a write-only device without sync signals

#### GT911 Touch Overlay

Save as `overlay-gt911.dts`:

```dts
/dts-v1/;
/plugin/;

/ {
    fragment@0 {
        target-path = "/soc/a55_apb0/i2c@341c0000";
        __overlay__ {
            #address-cells = <1>;
            #size-cells = <0>;

            gt911@5d {
                compatible = "goodix,gt911";
                reg = <0x5d>;
                interrupt-parent = <&dsp_gpio_porta>;
                interrupts = <9 2>;                  /* falling edge */
                reset-gpios = <&ls_gpio1_porta 7 1>; /* active low */

                touchscreen-size-x = <320>;
                touchscreen-size-y = <480>;
            };
        };
    };
};
```

**Important**: Do NOT add `touchscreen-inverted-x`, `touchscreen-inverted-y`, or `touchscreen-swapped-x-y`. These swap/invert coordinates in the kernel driver, but the ABS_X/Y min/max range stays at portrait values (X:0-319, Y:0-479). After swapping, values fall outside range, and libinput normalization distorts coordinates — worse toward edges. Coordinate transform is handled at the X11 layer instead (step 7 below).

#### Compile and Deploy Overlays

```bash
# Build on host (requires device-tree-compiler)
dtc -@ -I dts -O dtb overlay-st7796s.dts -o overlay-st7796s.dtbo
dtc -@ -I dts -O dtb overlay-gt911.dts -o overlay-gt911.dtbo

# Transfer to board
scp overlay-st7796s.dtbo overlay-gt911.dtbo sunrise@192.168.128.10:/tmp/
ssh sunrise@192.168.128.10 \
  "sudo cp /tmp/overlay-st7796s.dtbo /boot/overlays/ &&
   sudo cp /tmp/overlay-gt911.dtbo /boot/overlays/"
```

Then append to `/boot/config.txt` on the board:

```
dtoverlay=overlay-st7796s
dtoverlay=overlay-gt911
```

### 5. Deploy Kernel Modules

Copy the compiled `.ko` files to the board:

```bash
scp panel_mipi_dbi.ko drm_mipi_dbi.ko sunrise@192.168.128.10:/tmp/
ssh sunrise@192.168.128.10 \
  "sudo mkdir -p /lib/modules/6.1.83/extra &&
   sudo cp /tmp/panel_mipi_dbi.ko /lib/modules/6.1.83/extra/ &&
   sudo cp /tmp/drm_mipi_dbi.ko /lib/modules/6.1.83/extra/ &&
   sudo depmod -a"
```

Modules load automatically at boot via device tree compatible string matching. Manual load also works:

```bash
sudo modprobe drm_mipi_dbi
sudo modprobe panel_mipi_dbi
```

### 6. Backlight GPIO Service

ST7796S backlight is controlled by GPIO (BCM 18, sysfs 421). Create a systemd service to enable it at boot:

```bash
sudo nano /etc/systemd/system/st7796s-backlight.service
```

Content:

```ini
[Unit]
Description=ST7796S LCD Backlight
After=multi-user.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'echo 421 > /sys/class/gpio/export 2>/dev/null; echo out > /sys/class/gpio/gpio421/direction; echo 1 > /sys/class/gpio/gpio421/value'
ExecStop=/bin/sh -c 'echo 0 > /sys/class/gpio/gpio421/value'

[Install]
WantedBy=multi-user.target
```

Enable: `sudo systemctl enable st7796s-backlight.service`

### 7. X11 Configuration

#### Display Driver

Create `/etc/X11/xorg.conf.d/99-spi-lcd.conf`:

```
Section "Device"
    Identifier "SPI LCD"
    Driver     "modesetting"
    Option     "kmsdev" "/dev/dri/card0"
EndSection
```

**Must use `modesetting`, NOT `fbdev`.** fbdev doesn't support DRI, causing GLX/software rendering errors. modesetting works with swrast even without GPU hardware.

#### Touch Calibration

GT911 reports portrait coordinates (X: 0-319, Y: 0-479), but the LCD displays in landscape (480x320). A 90° rotation maps portrait touch to landscape display.

Create `/etc/X11/xorg.conf.d/90-touchscreen.conf`:

```
Section "InputClass"
    Identifier "Goodix TouchScreen Calibration"
    MatchProduct "Goodix Capacitive TouchScreen"
    MatchDriver "libinput"
    Option "CalibrationMatrix" "0 -1 1 1 0 0 0 0 1"
EndSection
```

What this matrix does:
- `screen_x = 1 - y_norm` (Y flipped into X)
- `screen_y = x_norm` (X mapped to Y)

Where `x_norm = raw_x / 319`, `y_norm = raw_y / 479` — libinput normalizes to 0-1 based on ABS ranges.

Using the config file makes this **persistent** across reboots. Setting via `xinput set-prop` only lasts the current session.

#### Disable Conflicting X11 Config

RDK X5 default X11 config may conflict. Disable:

```bash
sudo mv /etc/X11/xorg.conf.d/1-resolution.conf /etc/X11/xorg.conf.d/1-resolution.conf.disable
sudo mv /etc/X11/xorg.conf.d/2-dr-accel.conf /etc/X11/xorg.conf.d/2-dr-accel.conf.bak
```

### 8. Reboot and Verify

```bash
sudo reboot
```

After reboot, check each item:

```bash
# DRM panel loaded?
dmesg | grep -i "mipi.dbi\|panel-mipi"
ls /dev/fb*                              # should show /dev/fb0
cat /sys/class/graphics/fb0/name         # should show panel-mipi-dbid
cat /sys/class/graphics/fb0/modes        # should show U:480x320p-0

# Touch driver loaded?
dmesg | grep -i "goodix"
cat /proc/bus/input/devices | grep -A5 Goodix

# DRM devices
ls /dev/dri/                              # card0 (panel-mipi-dbi), card1 (vs_drm), renderD128

# Touch calibration active?
DISPLAY=:0 xinput list-props 7 | grep "Calibration Matrix"   # should show 0 -1 1 1 0 0 0 0 1

# Framebuffer test
cat /dev/urandom > /dev/fb0               # LCD shows noise
dd if=/dev/zero of=/dev/fb0               # LCD goes black
```

If X11 config is correct, the desktop should appear on the LCD after reboot.

---

## Troubleshooting

### Screen is Blank

Check in order:
1. Wiring — especially CS (pin 26/CS1), DC (pin 15), RST (pin 13)
2. Backlight: `cat /sys/class/gpio/gpio421/value` should be 1
3. Firmware file: `ls -la /lib/firmware/panel-mipi-dbi-spi.bin`
4. Module loaded: `lsmod | grep panel_mipi_dbi`
5. DRM connector status: `cat /sys/class/drm/card0/card0-SPI-1/status` should show `connected`

### Touch Orientation Wrong

Do NOT add `touchscreen-inverted-x/y` or `touchscreen-swapped-x-y` in the device tree overlay. Verify `/etc/X11/xorg.conf.d/90-touchscreen.conf` exists and has correct content. Check calibration matrix is applied: `DISPLAY=:0 xinput list-props 7 | grep "Calibration Matrix"` should show custom values, not identity.

### Touch Calibration Lost After Reboot

You used `xinput set-prop` to set it manually — that only lasts the current session. Must be written into `90-touchscreen.conf` for persistence.

### Display Corruption / Glitchy Output

1. Lower SPI clock — change `spi-max-frequency` from 40000000 to 32000000 in the overlay
2. Verify the `drm_mipi_dbi.c` reset timing patch is applied (10ms rather than 20us)
3. Verify the firmware `.bin` init sequence matches ST7796S

### I2C Bus Number Changed

Adding device tree overlays may change I2C bus numbering. After deployment, verify GT911 is on bus 5 at 0x5D with `i2cdetect -l` and `i2cdetect -y 5`.

---

## Quick Deploy (Fresh RDK X5)

This repo includes pre-compiled `.ko` modules, `.dtbo` overlays, and firmware for kernel 6.1.83 — **no tools or compilation needed**. Just clone and copy to the board.

Board IP 192.168.128.10, password sunrise. Run in order:

```bash
# Overlays
scp overlay-st7796s.dtbo overlay-gt911.dtbo sunrise@192.168.128.10:/tmp/
ssh sunrise@192.168.128.10 \
  "sudo cp /tmp/*.dtbo /boot/overlays/ &&
   grep -q overlay-st7796s /boot/config.txt || printf 'dtoverlay=overlay-st7796s\ndtoverlay=overlay-gt911\n' | sudo tee -a /boot/config.txt"

# Firmware
scp st7796s.bin sunrise@192.168.128.10:/tmp/
ssh sunrise@192.168.128.10 "sudo cp /tmp/st7796s.bin /lib/firmware/panel-mipi-dbi-spi.bin"

# Kernel modules
scp kernel-modules/panel-mipi-dbi.ko kernel-modules/drm_mipi_dbi.ko sunrise@192.168.128.10:/tmp/
ssh sunrise@192.168.128.10 \
  "sudo mkdir -p /lib/modules/6.1.83/extra &&
   sudo cp /tmp/panel-mipi-dbi.ko /lib/modules/6.1.83/extra/ &&
   sudo cp /tmp/drm_mipi_dbi.ko /lib/modules/6.1.83/extra/ &&
   sudo depmod -a"

# X11 display config
ssh sunrise@192.168.128.10 "sudo tee /etc/X11/xorg.conf.d/99-spi-lcd.conf << 'EOF'
Section \"Device\"
    Identifier \"SPI LCD\"
    Driver     \"modesetting\"
    Option     \"kmsdev\" \"/dev/dri/card0\"
EndSection
EOF"

# X11 touch calibration
ssh sunrise@192.168.128.10 "sudo tee /etc/X11/xorg.conf.d/90-touchscreen.conf << 'EOF'
Section \"InputClass\"
    Identifier \"Goodix TouchScreen Calibration\"
    MatchProduct \"Goodix Capacitive TouchScreen\"
    MatchDriver \"libinput\"
    Option \"CalibrationMatrix\" \"0 -1 1 1 0 0 0 0 1\"
EndSection
EOF"

# Backlight service
ssh sunrise@192.168.128.10 "sudo tee /etc/systemd/system/st7796s-backlight.service << 'EOF'
[Unit]
Description=ST7796S LCD Backlight
After=multi-user.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'echo 421 > /sys/class/gpio/export 2>/dev/null; echo out > /sys/class/gpio/gpio421/direction; echo 1 > /sys/class/gpio/gpio421/value'
ExecStop=/bin/sh -c 'echo 0 > /sys/class/gpio/gpio421/value'

[Install]
WantedBy=multi-user.target
EOF"

ssh sunrise@192.168.128.10 "sudo systemctl enable st7796s-backlight.service"

# Disable old x11-to-spi (if present)
ssh sunrise@192.168.128.10 "sudo systemctl disable x11-to-spi 2>/dev/null; sudo systemctl stop x11-to-spi 2>/dev/null"

# Reboot
ssh sunrise@192.168.128.10 "sudo reboot"

# Post-reboot verification
ssh sunrise@192.168.128.10 \
  "ls /dev/fb* &&
   cat /sys/class/graphics/fb0/name &&
   DISPLAY=:0 xinput list-props 7 | grep Calibration"
```

---

## Repository Files

```
generate_st7796s_fw.py      ST7796S firmware generation script
st7796s.bin                 Firmware binary (109 bytes), rename to panel-mipi-dbi-spi.bin
overlay-st7796s.dts         ST7796S LCD device tree overlay source
overlay-st7796s.dtbo        Pre-compiled LCD overlay
overlay-gt911.dts           GT911 touch device tree overlay source
overlay-gt911.dtbo          Pre-compiled touch overlay
kernel-modules/             Pre-built kernel modules (kernel 6.1.83)
  panel-mipi-dbi.ko         DRM panel driver (463K)
  drm_mipi_dbi.ko           DRM MIPI DBI helper with ST7796S reset timing fix (550K)
```

Board file locations:

```
/boot/overlays/overlay-st7796s.dtbo          LCD overlay
/boot/overlays/overlay-gt911.dtbo            Touch overlay
/lib/firmware/panel-mipi-dbi-spi.bin         ST7796S init firmware
/lib/modules/6.1.83/extra/panel-mipi-dbi.ko  DRM panel driver
/lib/modules/6.1.83/extra/drm_mipi_dbi.ko    MIPI DBI helper
/etc/X11/xorg.conf.d/99-spi-lcd.conf         X11 display config (modesetting + card0)
/etc/X11/xorg.conf.d/90-touchscreen.conf     X11 touch calibration (persistent)
/etc/systemd/system/st7796s-backlight.service Backlight GPIO service
```

---

## References

- [panel-mipi-dbi driver source](https://github.com/torvalds/linux/blob/master/drivers/gpu/drm/tiny/panel-mipi-dbi.c)
- [drm_mipi_dbi helper source](https://github.com/torvalds/linux/blob/master/drivers/gpu/drm/drm_mipi_dbi.c)
- [GT911 touch driver source](https://github.com/torvalds/linux/blob/master/drivers/input/touchscreen/goodix.c)
- [RDK X5 kernel source (x5-manifest)](https://github.com/D-Robotics/x5-manifest)
- [RDK X5 cross-compilation toolchain](http://archive.d-robotics.cc/toolchain/) — gcc-arm-11.2-2022.02
- [libinput Calibration Matrix docs](https://xorg-docs.archlinux.org/libinput.4.html)
- [Linux Kernel DRM KMS docs](https://www.kernel.org/doc/html/latest/gpu/drm-kms.html)