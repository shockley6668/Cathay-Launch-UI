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

## Key Architecture Details

- **Language detection**: `getDestName(flight)` returns `destinationNameCn` (繁中) / `destinationNameCnS` (简中) / `destinationName` (en)
- **CJK class toggle**: `.rolling-text-cjk` on rolling container, `.cjk-mode` on `.globe-hud-content`
- **Flight altitude**: `getAltitudeForRoute()` uses haversine distance → 0.25 / 0.45 / 0.7
- **Camera tracking**: Per-frame `globe.pointOfView({lat, lng, alt}, 300)` follows airplane 3D position converted to lat/lng
- **Earth skew**: `camera.projectionMatrix.elements[9]` override, targetSkew=2.8

See `CLAUDE.md` for full architecture docs and `SESSION_CHANGELOG.md` for detailed change log.
