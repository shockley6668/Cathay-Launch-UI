# RDK X5 接 ST7796S SPI 屏 + GT911 触摸

把一块 3.5 寸 ST7796S SPI LCD (480x320) 和 GT911 电容触摸接到 RDK X5 上，用内核 DRM 驱动跑起来。最终效果：开机显示桌面，触摸方向正确。

> **[English Version](SPI-LCD-SETUP.md)**

---

## 为什么要折腾内核驱动

之前我用用户态的 `x11-to-spi.c` 驱动这块屏，流程是这样的：

```
应用 → X11 → SHM 截帧 → BGRA转RGB565 → spidev ioctl(PIO) → ST7796S
```

这套方案能跑，但 FPS 只有 16 左右。瓶颈很明显：spidev 是 PIO 传输，CPU 阻塞等着；DC 引脚靠 sysfs GPIO 切换，每次 5us；还有各种 usleep 占着 CPU 不干活。加上 SHM 截帧和像素格式转换的额外拷贝，能跑 16 FPS 已经是极限了。

换用内核的 `panel-mipi-dbi` DRM 驱动后：

```
应用 → X11 → modesetting → /dev/fb0 → panel-mipi-dbi → SPI DMA → ST7796S
```

X11 直接写内核 framebuffer，零拷贝；SPI 用 DMA 传，CPU 不阻塞；内核还会自动做脏矩形追踪，只传变化区域。FPS 直接翻倍到 30+，而且不需要 `x11-to-spi.c` 了。

整套方案涉及两个内核模块：
- `panel_mipi_dbi` + `drm_mipi_dbi` — 驱动 ST7796S LCD，创建 `/dev/fb0`
- `goodix_ts` — 驱动 GT911 触摸，创建 `/dev/input/event1`（这个内核已经有了，不用编译）

还有一点要注意：SPI LCD 走的是 card0，没有 GPU 渲染节点。所以 WebGL 只能用 Mesa swrast 软渲染。如果你需要硬件 WebGL，得接 HDMI 用 vs_drm（card1）。

---

## 接线

### LCD 和触摸的引脚连接

ST7796S 和 GT911 都接在 RDK X5 的 40-pin 排针上，对应关系如下：

```
ST7796S 引脚    RDK X5 引脚              说明
─────────────────────────────────────────────────
VCC             3.3V (pin 1 或 17)       3.3V 供电，不要用 5V
GND             GND (pin 6/9/25/39)      接好地线
SCL             Physical 23 (SPI1 SCLK)  SPI 时钟
SDA/SDI         Physical 19 (SPI1 MOSI)  SPI 数据输入
CS              Physical 26 (SPI1 CS1)   片选——注意是 CS1，不是 CS0
DC/RS           Physical 15 (BCM 22)     数据/命令选择
RST             Physical 13 (BCM 27)     复位
LED/BL          Physical 12 (BCM 18)     背光控制

GT911 引脚      RDK X5 引脚              说明
─────────────────────────────────────────────────
VCC             3.3V (pin 1 或 17)       3.3V 供电
GND             GND (pin 6/9/25/39)      接好地线
SDA             Physical 3 (I2C5 SDA)    I2C 数据
SCL             Physical 5 (I2C5 SCL)    I2C 时钟
INT             Physical 4 (BCM 4)       中断（下降沿触发）
RST             Physical 1 (BCM 1)       复位
```

几个容易搞错的地方：
- LCD 的 **CS 一定要接 pin 26（CS1）**，不是 pin 24（CS0），因为 CS0 上可能挂着 IMU 传感器
- 两个设备都用 **3.3V** 供电，别用 5V
- GT911 的 I2C 地址是 **0x5D**，在 RDK X5 上枚举到 `/dev/i2c-5`

### sysfs GPIO 编号

RDK X5 用的 Hobort GPIO 编号，和 BCM 不一样。写设备树和 sysfs 操作时需要用到这些映射：

```
BCM 引脚    sysfs GPIO    设备树 phandle          设备树 offset
──────────────────────────────────────────────────────────────
BCM 22      388           ls_gpio0_porta          pin 9
BCM 27      379           ls_gpio0_porta          pin 0
BCM 18      421           dsp_gpio_porta          pin 10
BCM 4       420           dsp_gpio_porta          pin 9
BCM 1       354           ls_gpio1_porta          pin 7
```

---

## 操作步骤

### 1. 接线

按上面的表接好线。特别注意 CS 接 pin 26、两个设备都用 3.3V、地线都接好。

### 2. 编译内核模块

RDK X5 内核 (6.1.83) 默认没有启用 `CONFIG_DRM_PANEL_MIPI_DBI`，需要编译两个模块：`panel_mipi_dbi.ko` 和 `drm_mipi_dbi.ko`。

好消息是，x5-rdk-gen 源码树里这些驱动的源文件、Kconfig、Makefile 都已经就位了，你只需要在 defconfig 里加一行然后编译就行。

#### 获取源码树

x5-rdk-gen 是 RDK X5 的完整内核构建系统：

```bash
# 安装 repo
mkdir -p ~/bin
curl https://storage.googleapis.com/git-repo-downloads/repo > ~/bin/repo
chmod a+x ~/bin/repo
export PATH=~/bin:$PATH

# 克隆（清华镜像加速）
export REPO_URL='https://mirrors.tuna.tsinghua.edu.cn/git/git-repo/'
cd ~
repo init -u git@github.com:D-Robotics/x5-manifest.git -b main
repo sync
```

克隆完成后，关键目录长这样：

```
x5-rdk-gen/
├── source/kernel/drivers/gpu/drm/tiny/panel-mipi-dbi.c   ← 驱动源码，已存在
├── source/kernel/drivers/gpu/drm/drm_mipi_dbi.c          ← 辅助模块，已存在（含 ST7796S 复位时序补丁）
├── source/kernel/arch/arm64/configs/                      ← defconfig 在这里
├── mk_kernel.sh                                           ← 编译脚本
└── mk_debs.sh                                             ← 打包脚本
```

源码树里已经有的东西：
- `panel-mipi-dbi.c` — 397 行，从 Linux 主线引入的完整驱动
- `drm_mipi_dbi.c` — 第 603 行的复位时序已改成 `usleep_range(10000, 15000)`，适配 ST7796S（默认的 20us 不够，ST7796S 复位需要 10ms）
- Kconfig 里已有 `CONFIG_DRM_PANEL_MIPI_DBI` 条目
- Makefile 里已有 `panel-mipi-dbi.o` 编译规则

**唯一要做的就是**在 defconfig 里启用这个模块。

#### 启用模块配置

编辑 `arch/arm64/configs/hobot_x5_rdk_ubuntu_defconfig`，末尾加一行：

```
CONFIG_DRM_PANEL_MIPI_DBI=m
```

或者用 menuconfig：

```bash
cd x5-rdk-gen
./mk_kernel.sh menuconfig
# Device Drivers → Graphics support → Display panels → MIPI DBI compatible display panels
# 按 M 设为模块，保存退出
```

#### 搭建编译环境

x5-rdk-gen 的交叉编译需要 Ubuntu 22.04。如果你跑的是其他版本（比如 WSL Ubuntu 26.04），用 Docker：

```bash
# 装 Docker
sudo apt install docker.io
sudo usermod -aG docker $USER
# 重新登录 shell

# 起 22.04 容器，把源码挂进去
docker run -it --name x5-build -v ~/x5-rdk-gen:/work ubuntu:22.04 bash

# 容器里装依赖
apt update && apt install -y \
  build-essential bc bison flex python3 \
  libncurses5-dev libssl-dev \
  device-tree-compiler u-boot-tools ccache wget git

# 装 ARM 交叉编译工具链
cd /opt
wget http://archive.d-robotics.cc/toolchain/gcc-arm-11.2-2022.02-x86_64-aarch64-none-linux-gnu.tar.xz
tar -xf gcc-arm-11.2-2022.02-x86_64-aarch64-none-linux-gnu.tar.xz

# 验证
/opt/gcc-arm-11.2-2022.02-x86_64-aarch64-none-linux-gnu/bin/aarch64-none-linux-gnu-gcc --version
```

#### 编译

```bash
cd /work
./mk_kernel.sh
```

编译完成后，模块在：
- `source/kernel/drivers/gpu/drm/tiny/panel_mipi_dbi.ko`
- `source/kernel/drivers/gpu/drm/drm_mipi_dbi.ko`

如果只想编单个模块（更快），可以：

```bash
cd /work/source/kernel
make ARCH=arm64 \
  CROSS_COMPILE=/opt/gcc-arm-11.2-2022.02-x86_64-aarch64-none-linux-gnu/bin/aarch64-none-linux-gnu- \
  M=drivers/gpu/drm/tiny \
  modules
```

验证一下模块对不对：

```bash
modinfo panel_mipi_dbi.ko | grep depends   # 应看到依赖 drm_mipi_dbi, drm, spi 等
modinfo drm_mipi_dbi.ko | grep vermagic     # 应显示 6.1.83
```

### 3. 生成 ST7796S 固件文件

`panel-mipi-dbi` 驱动启动时会从 `/lib/firmware/panel-mipi-dbi-spi.bin` 加载初始化命令。这个 bin 文件的格式是：

```
15 字节：magic "MIPI DBI\0\0\0\0\0\0\0"
 1 字节：版本号 (0x01)
 N 字节：命令序列，每条 [cmd, 参数个数, param1, param2, ...]
         延时用 NOP 表示：[0x00, 0x01, 延时ms]
```

本仓库有生成脚本 `generate_st7796s_fw.py`，直接跑：

```bash
python3 generate_st7796s_fw.py    # 生成 st7796s.bin (109 bytes)
```

然后传到板子上，**注意文件名必须和设备树 compatible 一致**（驱动会自动拼 `.bin` 后缀）：

```bash
scp st7796s.bin sunrise@192.168.128.10:/tmp/
ssh sunrise@192.168.128.10 "sudo cp /tmp/st7796s.bin /lib/firmware/panel-mipi-dbi-spi.bin"
```

### 4. 设备树 Overlay

需要两个 overlay：一个给 LCD，一个给触摸屏。

#### ST7796S LCD overlay

保存为 `overlay-st7796s.dts`：

```dts
/dts-v1/;
/plugin/;

/ {
    fragment@0 {
        target-path = "/soc/a55_apb0/spi@34010000";
        __overlay__ {
            #address-cells = <1>;
            #size-cells = <0>;

            /* 禁用 CS1 上的 spidev，避免冲突 */
            spidev@1 {
                status = "disabled";
            };

            panel-mipi-dbi@1 {
                compatible = "panel-mipi-dbi-spi";
                reg = <1>;                         /* CS1，不是 CS0 */
                spi-max-frequency = <40000000>;    /* 40MHz */
                dc-gpios = <&ls_gpio0_porta 9 0>;  /* BCM 22 */
                reset-gpios = <&ls_gpio0_porta 0 0>; /* BCM 27 */
                write-only;                        /* ST7796S SPI 读取不可靠 */

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

几个要注意的点：
- `reg = <1>` 表示 CS1。CS0 上可能挂着 IMU，别抢
- `write-only` 必须加。ST7796S 的 SPI 读取不可靠，不加的话驱动读 ID 失败会跳过整个初始化
- `width-mm` / `height-mm` 和各种 porch 是 `of_get_drm_panel_display_mode()` 的校验必填项，虽然 ST7796S 是 write-only 设备没有同步信号，但驱动要检查这些字段

#### GT911 触摸 overlay

保存为 `overlay-gt911.dts`：

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
                interrupts = <9 2>;                  /* 下降沿触发 */
                reset-gpios = <&ls_gpio1_porta 7 1>; /* 低电平有效 */

                touchscreen-size-x = <320>;
                touchscreen-size-y = <480>;
            };
        };
    };
};
```

**重要**：不要加 `touchscreen-inverted-x`、`touchscreen-inverted-y` 或 `touchscreen-swapped-x-y`！这些属性会让内核驱动交换/翻转坐标值，但 ABS_X/Y 的 min/max 范围仍然是竖屏值（X:0-319, Y:0-479）。交换后值超出范围，libinput 归一化会把坐标扭曲，越到边缘偏差越大。坐标变换放在 X11 层处理（后面第 7 步会说）。

#### 编译和部署 overlay

```bash
# 主机上编译（需要 device-tree-compiler）
dtc -@ -I dts -O dtb overlay-st7796s.dts -o overlay-st7796s.dtbo
dtc -@ -I dts -O dtb overlay-gt911.dts -o overlay-gt911.dtbo

# 传到板子
scp overlay-st7796s.dtbo overlay-gt911.dtbo sunrise@192.168.128.10:/tmp/
ssh sunrise@192.168.128.10 \
  "sudo cp /tmp/overlay-st7796s.dtbo /boot/overlays/ &&
   sudo cp /tmp/overlay-gt911.dtbo /boot/overlays/"
```

然后在板子上的 `/boot/config.txt` 末尾加上：

```
dtoverlay=overlay-st7796s
dtoverlay=overlay-gt911
```

### 5. 部署内核模块

把编译好的 `.ko` 传到板子上：

```bash
scp panel_mipi_dbi.ko drm_mipi_dbi.ko sunrise@192.168.128.10:/tmp/
ssh sunrise@192.168.128.10 \
  "sudo mkdir -p /lib/modules/6.1.83/extra &&
   sudo cp /tmp/panel_mipi_dbi.ko /lib/modules/6.1.83/extra/ &&
   sudo cp /tmp/drm_mipi_dbi.ko /lib/modules/6.1.83/extra/ &&
   sudo depmod -a"
```

模块会通过设备树 compatible 字符串在启动时自动加载。想手动加载也行：

```bash
sudo modprobe drm_mipi_dbi
sudo modprobe panel_mipi_dbi
```

### 6. 背光 GPIO 服务

ST7796S 背光由 GPIO 控制（BCM 18，sysfs 编号 421）。写个 systemd 服务让开机自动点亮：

```bash
sudo nano /etc/systemd/system/st7796s-backlight.service
```

写入：

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

启用：`sudo systemctl enable st7796s-backlight.service`

### 7. X11 配置

#### 显示驱动

创建 `/etc/X11/xorg.conf.d/99-spi-lcd.conf`：

```
Section "Device"
    Identifier "SPI LCD"
    Driver     "modesetting"
    Option     "kmsdev" "/dev/dri/card0"
EndSection
```

**一定要用 `modesetting`，不要用 `fbdev`。** fbdev 不支持 DRI，GLX 走软件渲染容易出错。modesetting 虽然也没有硬件 GPU，但 swrast 能正常工作。

#### 触摸校准

GT911 报的是竖屏坐标（X: 0-319, Y: 0-479），但 LCD 显示是横屏 (480x320)。需要做 90° 旋转才能把竖屏触摸映射到横屏。

创建 `/etc/X11/xorg.conf.d/90-touchscreen.conf`：

```
Section "InputClass"
    Identifier "Goodix TouchScreen Calibration"
    MatchProduct "Goodix Capacitive TouchScreen"
    MatchDriver "libinput"
    Option "CalibrationMatrix" "0 -1 1 1 0 0 0 0 1"
EndSection
```

这个矩阵做的事是：
- `screen_x = 1 - y_norm`（Y 翻转到 X，取反）
- `screen_y = x_norm`（X 映射到 Y）

其中 `x_norm = raw_x / 319`，`y_norm = raw_y / 479`，libinput 会根据 ABS 范围归一化到 0-1。

用配置文件的好处是**持久化**的，重启不会丢。如果用 `xinput set-prop` 命令设，重启后就没了。

#### 禁用冲突的 X11 配置

RDK X5 默认的一些 X11 配置可能冲突，禁用掉：

```bash
sudo mv /etc/X11/xorg.conf.d/1-resolution.conf /etc/X11/xorg.conf.d/1-resolution.conf.disable
sudo mv /etc/X11/xorg.conf.d/2-dr-accel.conf /etc/X11/xorg.conf.d/2-dr-accel.conf.bak
```

### 8. 重启和验证

```bash
sudo reboot
```

重启后逐项检查：

```bash
# DRM panel 是否加载
dmesg | grep -i "mipi.dbi\|panel-mipi"
ls /dev/fb*                              # 应有 /dev/fb0
cat /sys/class/graphics/fb0/name         # 应显示 panel-mipi-dbid
cat /sys/class/graphics/fb0/modes        # 应显示 U:480x320p-0

# 触摸驱动是否加载
dmesg | grep -i "goodix"
cat /proc/bus/input/devices | grep -A5 Goodix

# DRM 设备
ls /dev/dri/                              # card0 (panel-mipi-dbi), card1 (vs_drm), renderD128

# 触摸校准是否生效
DISPLAY=:0 xinput list-props 7 | grep "Calibration Matrix"   # 应显示 0 -1 1 1 0 0 0 0 1

# framebuffer 测试
cat /dev/urandom > /dev/fb0               # LCD 显示噪点
dd if=/dev/zero of=/dev/fb0               # LCD 变黑
```

如果 X11 配置正确，重启后 LCD 上应该能看到桌面。

---

## 遇到问题？

### 屏幕不亮

依次排查：
1. 接线——特别是 CS（pin 26/CS1）、DC（pin 15）、RST（pin 13）
2. 背光：`cat /sys/class/gpio/gpio421/value` 应为 1
3. 固件文件：`ls -la /lib/firmware/panel-mipi-dbi-spi.bin`
4. 模块加载：`lsmod | grep panel_mipi_dbi`
5. DRM 连接器状态：`cat /sys/class/drm/card0/card0-SPI-1/status` 应显示 `connected`

### 触摸方向不对

不要在设备树 overlay 里加 `touchscreen-inverted-x/y` 或 `touchscreen-swapped-x-y`。确认 `/etc/X11/xorg.conf.d/90-touchscreen.conf` 存在且内容正确，校准矩阵生效：`DISPLAY=:0 xinput list-props 7 | grep "Calibration Matrix"` 应显示自定义值而不是 identity。

### 触摸校准重启后丢失

说明你用的是 `xinput set-prop` 手动设置的，这只在当前会话有效。必须写进 `90-touchscreen.conf` 才能持久化。

### 显示花屏/乱码

1. 降低 SPI 时钟——overlay 里 `spi-max-frequency` 从 40000000 降到 32000000
2. 确认 `drm_mipi_dbi.c` 的复位时序补丁已应用（10ms 而不是 20us）
3. 确认固件 `.bin` 文件和 ST7796S 的初始化序列匹配

### I2C 总线编号变了

添加设备树 overlay 后可能改变 I2C 总线编号，部署后用 `i2cdetect -l` 和 `i2cdetect -y 5` 确认 GT911 是否在 bus 5 的 0x5D。

---

## 仓库文件说明

```
generate_st7796s_fw.py      生成 ST7796S 初始化固件的脚本（参考用）
st7796s.bin                 固件文件 (109 bytes)，部署时改名为 panel-mipi-dbi-spi.bin
overlay-st7796s.dts         ST7796S LCD 设备树 overlay 源码
overlay-st7796s.dtbo        编译好的 LCD overlay（直接用，不需要装 dtc）
overlay-gt911.dts           GT911 触摸设备树 overlay 源码
overlay-gt911.dtbo          编译好的触摸 overlay（直接用，不需要装 dtc）
kernel-modules/             预编译的内核模块（内核 6.1.83）
  panel-mipi-dbi.ko         DRM panel 驱动 (463K)
  drm_mipi_dbi.ko           DRM MIPI DBI 辅助模块，含 ST7796S 复位时序补丁 (550K)
```

板子上的文件：

```
/boot/overlays/overlay-st7796s.dtbo          LCD overlay
/boot/overlays/overlay-gt911.dtbo            触摸 overlay
/lib/firmware/panel-mipi-dbi-spi.bin         ST7796S 初始化固件
/lib/modules/6.1.83/extra/panel-mipi-dbi.ko  DRM panel 驱动模块
/lib/modules/6.1.83/extra/drm_mipi_dbi.ko    DRM MIPI DBI 辅助模块
/etc/X11/xorg.conf.d/99-spi-lcd.conf         X11 显示配置（modesetting + card0）
/etc/X11/xorg.conf.d/90-touchscreen.conf     X11 触摸校准（持久化）
/etc/systemd/system/st7796s-backlight.service 背光 GPIO 服务
```

---

## 快速部署（全新 RDK X5）

仓库里已经有编译好的 `.ko`、`.dtbo` 和固件，内核版本 6.1.83，**不需要安装任何工具，也不需要编译**，克隆仓库后直接传到板子上就行。如果你的板子内核版本不是 6.1.83，`.ko` 需要按第 2 步重新编译，`.dtbo` 和固件直接用。

板子 IP 192.168.128.10，密码 sunrise，按顺序执行：

```bash
# overlay
scp overlay-st7796s.dtbo overlay-gt911.dtbo sunrise@192.168.128.10:/tmp/
ssh sunrise@192.168.128.10 \
  "sudo cp /tmp/*.dtbo /boot/overlays/ &&
   grep -q overlay-st7796s /boot/config.txt || printf 'dtoverlay=overlay-st7796s\ndtoverlay=overlay-gt911\n' | sudo tee -a /boot/config.txt"

# 固件
scp st7796s.bin sunrise@192.168.128.10:/tmp/
ssh sunrise@192.168.128.10 "sudo cp /tmp/st7796s.bin /lib/firmware/panel-mipi-dbi-spi.bin"

# 内核模块
scp kernel-modules/panel-mipi-dbi.ko kernel-modules/drm_mipi_dbi.ko sunrise@192.168.128.10:/tmp/
ssh sunrise@192.168.128.10 \
  "sudo mkdir -p /lib/modules/6.1.83/extra &&
   sudo cp /tmp/panel-mipi-dbi.ko /lib/modules/6.1.83/extra/ &&
   sudo cp /tmp/drm_mipi_dbi.ko /lib/modules/6.1.83/extra/ &&
   sudo depmod -a"

# X11 显示配置
ssh sunrise@192.168.128.10 "sudo tee /etc/X11/xorg.conf.d/99-spi-lcd.conf << 'EOF'
Section \"Device\"
    Identifier \"SPI LCD\"
    Driver     \"modesetting\"
    Option     \"kmsdev\" \"/dev/dri/card0\"
EndSection
EOF"

# X11 触摸校准
ssh sunrise@192.168.128.10 "sudo tee /etc/X11/xorg.conf.d/90-touchscreen.conf << 'EOF'
Section \"InputClass\"
    Identifier \"Goodix TouchScreen Calibration\"
    MatchProduct \"Goodix Capacitive TouchScreen\"
    MatchDriver \"libinput\"
    Option \"CalibrationMatrix\" \"0 -1 1 1 0 0 0 0 1\"
EndSection
EOF"

# 背光服务
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

# 禁用旧的 x11-to-spi（如果存在）
ssh sunrise@192.168.128.10 "sudo systemctl disable x11-to-spi 2>/dev/null; sudo systemctl stop x11-to-spi 2>/dev/null"

# 重启
ssh sunrise@192.168.128.10 "sudo reboot"

# 重启后验证
ssh sunrise@192.168.128.10 \
  "ls /dev/fb* &&
   cat /sys/class/graphics/fb0/name &&
   DISPLAY=:0 xinput list-props 7 | grep Calibration"
```

---

## 参考资料

- [panel-mipi-dbi 驱动源码](https://github.com/torvalds/linux/blob/master/drivers/gpu/drm/tiny/panel-mipi-dbi.c)
- [drm_mipi_dbi 辅助模块源码](https://github.com/torvalds/linux/blob/master/drivers/gpu/drm/drm_mipi_dbi.c)
- [GT911 触摸驱动源码](https://github.com/torvalds/linux/blob/master/drivers/input/touchscreen/goodix.c)
- [RDK X5 内核源码 (x5-manifest)](https://github.com/D-Robotics/x5-manifest)
- [RDK X5 交叉编译工具链](http://archive.d-robotics.cc/toolchain/) — gcc-arm-11.2-2022.02
- [libinput Calibration Matrix 文档](https://xorg-docs.archlinux.org/libinput.4.html)
- [Linux Kernel DRM KMS 文档](https://www.kernel.org/doc/html/latest/gpu/drm-kms.html)