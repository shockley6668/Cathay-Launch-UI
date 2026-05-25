# Cathay Pacific IFE Launch UI (国泰航空机上娱乐系统开机界面复刻)

高保真复刻**国泰航空 (Cathay Pacific)** 机上娱乐系统 (IFE) 开机动画与交互界面。专为低功耗嵌入式设备（RDK X5 + 3.5" ST7796S 屏幕 320x480）深度优化。

## Features

- **3D 地球航线动画** — Globe.gl + Three.js，大圆航线生成，2D 飞机精灵沿航线飞行
- **多语言支持** — 英/繁中/简中/日/韩/法/德，老虎机滚动文字根据语言切换字符池
- **CJK 视觉适配** — 中文模式下自动调整列宽、字号、Logo 大小、间距
- **距离自适应缩放** — 短/中/长航线自动调整飞行高度（0.25/0.45/0.7）
- **航线跟随相机** — 飞行中相机沿大圆航线实时追踪飞机位置
- **到达画面地球下沉** — 垂直 skew 变换将地球推至屏幕下方 35%
- **客舱音乐** — 通过 `<audio>` 标签播放，精准卡点 1:58

## Tech Stack

- Vanilla JavaScript (ES6), CSS3 3D Transforms
- [Three.js](https://threejs.org/) v0.158 + [Globe.gl](https://globe.gl/) v2.32.2
- Google Fonts: Inter, Roboto Mono, Noto Sans TC

## Quick Start

```bash
python3 -m http.server 8000
# Open http://localhost:8000
```

## Directory Structure

```
├── index.html              # Main entry
├── css/style.css           # All styles + CJK overrides
├── js/
│   ├── app.js              # State machine, localization, rolling text
│   ├── globe-scene.js      # Globe.gl, flight animation, camera tracking
│   ├── split-flap.js       # Split-flap board (not used in current flow)
│   └── destinations.js     # 31 HKG routes with zh-TW/zh-CN names
├── assets/
│   ├── plane.png           # 2D airplane sprite
│   ├── earth_atmos_2048.jpg
│   ├── cathay-logo.svg
│   └── mountain_road.png
└── SESSION_CHANGELOG.md    # Detailed session change log
```

## State Machine

```
START_SCREEN → GLOBE_SCENE → DEST_REVEAL → GLOBE_ARRIVE → (reset to START, next flight)
```

## RDK Deployment

```bash
# Sync code
sshpass -p 'sunrise' rsync -az --exclude='.git' --exclude='node_modules' \
  --exclude='*.mp4' --exclude='frames' --exclude='venv' --exclude='.claude' \
  . sunrise@192.168.128.10:/home/sunrise/cathay_ui/

# Restart kiosk
sshpass -p 'sunrise' ssh -o ControlPath=none sunrise@192.168.128.10 \
  "killall firefox; sleep 1; DISPLAY=:0 firefox --kiosk http://localhost:8000/index.html &"
```

## SPI 显示屏驱动说明（Waveshare 3.5" ST7796S）

### 硬件规格

| 参数 | 值 |
|------|-----|
| 控制芯片 | Sitronix ST7796S |
| 分辨率 | 320 × 480（竖屏物理），横屏软件旋转为 480 × 320 |
| 接口 | SPI（4线制：MOSI、SCLK、CS、DC） + RST + BL |
| 触摸控制器 | Goodix GT911（I2C，总线 5，地址 0x5D） |

### GPIO 引脚映射（RDK X5）

| 功能 | BCM 编号 | sysfs GPIO | 物理引脚 |
|------|----------|------------|----------|
| DC（数据/命令选择） | GPIO 22 | 388 | Pin 15 |
| RST（复位） | GPIO 27 | 379 | Pin 13 |
| BL（背光） | GPIO 18 | 421 | Pin 12 |
| SPI 设备 | — | `/dev/spidev1.1` | — |
| 触摸 INT | GPIO 4 | — | Pin 7 |
| 触摸 RST | GPIO 17 | — | Pin 11 |
| 触摸 I2C | — | `/dev/i2c-5` | — |

### SPI 镜像服务（x11-to-spi）

项目核心驱动为 [`x11-to-spi.c`](x11-to-spi.c)，一个用 C 编写的 X11 屏幕镜像服务，将 X11 桌面实时捕获并推送到 ST7796S。

**工作原理：**
1. 通过 **MIT-SHM 扩展**（`XShmGetImage`）从 X11 零拷贝捕获帧，避免 CPU 内存拷贝瓶颈
2. SIMD 优化的 **BGRA → RGB565** 像素格式转换（逐行处理，cache 友好）
3. **静态帧跳过**：逐像素对比当前帧与上一帧，画面未变化时不向 SPI 发送任何数据
4. 全屏 SPI 写入时利用 ST7796S **GRAM 自动环绕（Auto-Wrap）** 特性：初始化时执行一次 `set_windows(0,0,479,319)` + `0x2C`，此后只调用 `write_data_buf()`，**不再发送任何命令**，从而彻底消除 DC 引脚跳变时序问题

> **关键稳定性说明：** ST7796S 对 DC 引脚（数据/命令选择）的建立时间极为敏感。在 Linux sysfs GPIO 控制下，如果在 `ioctl` SPI 传输完成后立刻改变 DC 电平，底层硬件 FIFO 可能尚未完全清空，导致屏幕错把像素数据当成控制指令执行，表现为"触摸即灰屏"。解决方案是在每次 DC 翻转前后各加 `usleep(5~10)`，以及在大批量数据传输后加 `usleep(1000)` 等待 FIFO 排空。

**编译与部署：**

```bash
# 在 RDK X5 板子上编译
cd /home/sunrise/cathay_ui
make

# 注册为 systemd 服务（开机自启）
sudo cp x11-to-spi.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable x11-to-spi
sudo systemctl start x11-to-spi

# 查看日志（含 FPS 统计）
sudo journalctl -u x11-to-spi -f
```

**SPI 内核参数调优：**

```bash
# 增大 spidev 内核缓冲区至 512KB（默认 4KB 会导致大帧被截断）
echo 'options spidev bufsiz=524288' | sudo tee /etc/modprobe.d/spidev.conf
sudo depmod -a
sudo reboot
```

**LCD 初始化关键参数（`lcd_init()` 中）：**

```c
write_command(0x36);   // MADCTL：内存访问控制
write_data(0xE8);      // MY=1 MX=1 MV=1（横屏旋转）BGR=1
write_command(0x3A);   // 像素格式
write_data(0x05);      // 16bpp RGB565
```

### 无 HDMI 时的 GPU 加速保持

不接 HDMI 时，X11 会关闭 GPU（Glamor）加速，降级到 CPU 软件渲染，WebGL 地球极卡。

**修复方案：** 在 `/etc/X11/xorg.conf.d/99-cathay-display.conf` 中强制启用 Glamor，并声明 480×320 虚拟分辨率：

```
Section "Device"
    Identifier "Device0"
    Driver     "modesetting"
    Option     "AccelMethod" "glamor"
EndSection

Section "Screen"
    Identifier "Screen0"
    Device "Device0"
    DefaultDepth 24
    SubSection "Display"
        Depth 24
        Virtual 480 320
    EndSubSection
EndSection
```

### 触摸重定向服务（touch-redirector）

[`touch_redirector.py`](touch_redirector.py) 通过 I2C 读取 GT911 触摸坐标，并用 `xdotool` 注入到 X11 桌面，实现 SPI 触摸屏控制 Firefox 的交互。

```bash
sudo systemctl enable touch-redirector
sudo systemctl start touch-redirector
```

## Key Architecture Details

- **Language detection**: `getDestName(flight)` returns `destinationNameCn` (繁中) / `destinationNameCnS` (简中) / `destinationName` (en)
- **CJK class toggle**: `.rolling-text-cjk` on rolling container, `.cjk-mode` on `.globe-hud-content`
- **Flight altitude**: `getAltitudeForRoute()` uses haversine distance → 0.25 / 0.45 / 0.7
- **Camera tracking**: Per-frame `globe.pointOfView({lat, lng, alt}, 300)` follows airplane 3D position converted to lat/lng
- **Earth skew**: `camera.projectionMatrix.elements[9]` override, targetSkew=2.8

See `CLAUDE.md` for full architecture docs and `SESSION_CHANGELOG.md` for detailed change log.
