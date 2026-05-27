# 国泰航空 IFE 开机引导屏

国泰航空机上娱乐系统（IFE）开机引导屏的复刻版，跑在 RDK X5 + 3.5" ST7796S SPI 屏（320×480 竖屏）上。

纯 HTML5 + CSS3 + Vanilla JS，**没有构建工具、没有包管理器**。本地直接 `python3 -m http.server` 看效果，板子上用 systemd 拉起 Firefox kiosk 全屏跑。

---

## 功能

- 启动屏：星空 + 7 国语言菜单（English / 繁體中文 / 简体中文 / 日本語 / 한국어 / Français / Deutsch）
- 翻牌登机口（split-flap）显示航班信息
- 3D 地球（Three.js + globe.gl），程序化建模的低多边形飞机沿大圆航线飞行
- 昼夜效果：地球白天/夜晚纹理混合 shader，太阳固定在香港正午、夏至
- 31 条真实国泰航点
- 相机跟随飞机航线，抵达时拉近

---

## 硬件目标

| 项目 | 值 |
|---|---|
| 板子 | RDK X5 (ARM64, 内核 6.1.83) |
| 屏 | 3.5" ST7796S SPI LCD, 480×320 横屏 |
| 触摸 | GT911 I2C 电容触摸 |
| 显示驱动 | 内核 panel-mipi-dbi DRM, fb0 直接写 |
| 浏览器 | Firefox kiosk 模式 |

接屏 + 驱动安装的完整步骤见 **[SPI-LCD-SETUP.zh.md](SPI-LCD-SETUP.zh.md)**。

---

## 本地运行

```bash
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000/index.html
```

或者直接双击 `index.html`。

---

## 部署到 RDK X5

板子 IP `192.168.128.10`，密码 `sunrise`，应用路径 `/home/sunrise/cathay_ui/`：

```bash
sshpass -p 'sunrise' rsync -az \
  --exclude='.git' --exclude='node_modules' --exclude='*.mp4' \
  --exclude='frames' --exclude='venv' --exclude='.claude' \
  --exclude='archive' \
  ./ sunrise@192.168.128.10:/home/sunrise/cathay_ui/
```

刷新代码后重启 kiosk：

```bash
sshpass -p 'sunrise' ssh sunrise@192.168.128.10 "sudo systemctl restart cathay-kiosk"
```

---

## 架构速览

`js/app.js` 的 `IFEApplication` 是个 4 状态机：

```
START_SCREEN → GLOBE_SCENE → DEST_REVEAL → GLOBE_ARRIVE
                ↑                                    |
                └────────────────────────────────────┘
                          (自动循环下一航班，31 条航线)
```

各 JS 模块通过 `window` 全局通信：

| 全局变量 | 文件 | 作用 |
|---|---|---|
| `window.ifeApp` | `js/app.js` | 状态机、星空、滚动文字动画 |
| `window.GlobeScene` | `js/globe-scene.js` | Globe.gl 场景、3D 飞机、相机轨迹 |
| `window.SplitFlapBoard` | `js/split-flap.js` | 翻牌登机口动画（CSS 3D rotateX）|
| `window.installDayNightCycle` | `js/day-night.js` | 昼夜混合 shader |

详细架构见 [CLAUDE.md](CLAUDE.md)。

---

## 文件结构

### 前端

```
index.html                  入口页面
css/style.css               所有样式
js/
  app.js                    IFEApplication 状态机
  globe-scene.js            Globe.gl 场景、3D 飞机、相机
  destinations.js           31 条 HKG 出发航点（多语言名）
  split-flap.js             翻牌动画（CSS 3D rotateX）
  day-night.js              昼夜混合 shader
assets/                     纹理、星空、飞机贴图
  earth_daymap_8k.jpg
  earth_nightmap_8k.jpg
  earth_lights_2048.png     城市灯光（备用）
  earth_atmos_2048.jpg      低分辨率底图
  plane.png                 旧版 2D 飞机贴图（已不用）
frames/                     参考视频截图
```

### RDK X5 SPI 屏部署

```
SPI-LCD-SETUP.md            完整接屏教程
generate_st7796s_fw.py      ST7796S 初始化固件生成脚本
st7796s.bin                 固件文件
overlay-st7796s.dts         LCD 设备树 overlay 源码
overlay-st7796s.dtbo        预编译 LCD overlay
overlay-gt911.dts           触摸设备树 overlay 源码
overlay-gt911.dtbo          预编译触摸 overlay
kernel-modules/             预编译内核模块（kernel 6.1.83）
  panel-mipi-dbi.ko         DRM panel 驱动
  drm_mipi_dbi.ko           MIPI DBI 辅助模块
```

### 文档

```
README.md                   英文版
README.zh.md                中文版（你正在看）
CLAUDE.md                   给 Claude Code 的项目说明
SPI-LCD-SETUP.md            SPI 屏完整设置教程
```

### 历史遗留

```
archive/                    旧用户态 SPI/touch 驱动、调试脚本
  README.md                 每个文件是干嘛用的、为什么不再用
```

---

## 多语言

启动屏选什么语言决定后续显示：

| 选择 | 目的地名称字段 | 出发地 |
|---|---|---|
| English | `destinationName` | "Hong Kong" |
| 繁體中文 | `destinationNameCn` | "香港" |
| 简体中文 | `destinationNameCnS` | "香港" |
| 日本語 / 한국어 | `destinationNameCn`（汉字与繁中通用） | "香港" |
| Français / Deutsch | `destinationName`（英文回退） | "Hong Kong" |

---

## 参考

- [globe.gl day-night-cycle 示例](https://globe.gl/example/day-night-cycle/)
- [Three.js](https://threejs.org/)
- [panel-mipi-dbi 驱动源码](https://github.com/torvalds/linux/blob/master/drivers/gpu/drm/tiny/panel-mipi-dbi.c)

---

> **[English Version](README.md)**