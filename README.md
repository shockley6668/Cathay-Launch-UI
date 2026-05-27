# Cathay Pacific IFE Boot Screen

国泰航空机上娱乐系统（IFE）开机引导屏的复刻版，跑在 RDK X5 + 3.5" ST7796S SPI 屏（320×480 竖屏）上。

纯 HTML5 + CSS3 + Vanilla JS，**没有构建工具、没有包管理器**。本地直接 `python3 -m http.server` 看效果，板子上用 systemd 拉起 Firefox kiosk 全屏跑。

## 视觉

- 启动屏：星空 + 7 国语言菜单（English / 繁中 / 簡中 / 日 / 韩 / 法 / 德）
- 翻牌登机口（split-flap）显示航班信息
- 3D 地球（Three.js + globe.gl），程序化建模的低多边形飞机沿大圆航线飞行
- 昼夜效果：地球白天/夜晚纹理混合 shader（来自 globe.gl 官方示例），太阳固定在香港正午、夏至
- 31 条真实国泰航点，按概率挑选（中国境内航点出现率被压低）

---

## 硬件目标

| 项目 | 值 |
|---|---|
| 板子 | RDK X5 (ARM64, 内核 6.1.83) |
| 屏 | 3.5" ST7796S SPI LCD, 480×320, 横屏 |
| 触摸 | GT911 I2C 电容触摸 |
| 显示驱动 | 内核 panel-mipi-dbi DRM, fb0 直接写 |
| 浏览器 | Firefox kiosk 模式 |

接屏 + 驱动安装的完整步骤见 **[SPI-LCD-SETUP.md](SPI-LCD-SETUP.md)**。

---

## 仓库文件结构

### 主项目（前端）

```
index.html                  入口页面
css/style.css               所有样式
js/
  app.js                    IFEApplication 状态机（4 状态：开机屏 → 地球 → 揭示目的地 → 抵达）
  globe-scene.js            Globe.gl 场景搭建、3D 飞机模型、相机轨迹
  destinations.js           31 条 HKG 出发的真实航点数据（中英繁简多语言名）
  split-flap.js             翻牌登机口动画（CSS 3D rotateX）
  day-night.js              昼夜混合 shader（globe.gl 官方示例的复刻）
assets/                     地球纹理、星空、飞机贴图等静态资源
  earth_daymap_8k.jpg
  earth_nightmap_8k.jpg
  earth_lights_2048.png     城市灯光（保留备用）
  earth_atmos_2048.jpg      备用低分辨率底图
  plane.png                 旧版 2D 飞机贴图（已不用，留作参考）
frames/                     参考视频抽出的 JPEG 截图，用作视觉对照
```

### RDK X5 SPI 屏部署

```
SPI-LCD-SETUP.md            完整接屏 + 内核驱动 + X11 + 触摸校准教程
generate_st7796s_fw.py      生成 ST7796S 初始化固件的 Python 脚本
st7796s.bin                 109 字节固件文件（部署时改名为 panel-mipi-dbi-spi.bin）
overlay-st7796s.dts         LCD 设备树 overlay 源码
overlay-st7796s.dtbo        LCD 设备树 overlay 编译产物（直接用，不需要装 dtc）
overlay-gt911.dts           触摸设备树 overlay 源码
overlay-gt911.dtbo          触摸设备树 overlay 编译产物
kernel-modules/             预编译的内核模块（kernel 6.1.83）
  panel-mipi-dbi.ko         DRM panel 驱动 (463K)
  drm_mipi_dbi.ko           DRM MIPI DBI 辅助模块，含 ST7796S 复位时序补丁 (550K)
```

### 应用部署 / 开机自启

```
autostart-kiosk.sh          启动脚本：拉起 Firefox kiosk 指向 localhost:8000
cathay-kiosk.desktop        XDG autostart 入口
Makefile                    简单的 deploy 命令封装
```

### 文档

```
README.md                   你正在看
CLAUDE.md                   给 Claude Code 的项目说明（架构、状态机、部署细节）
SPI-LCD-SETUP.md            SPI 屏完整设置教程
SESSION_CHANGELOG.md        早期开发日志
```

### 旧版本 / 历史遗留

```
archive/                    旧用户态 SPI 方案、调试脚本、被替代的 Python 直接驱动
  README.md                 archive 里每个文件原本是干嘛用的、为什么不再用
```

---

## 本地运行

零依赖，浏览器直接打开就行：

```bash
python3 -m http.server 8000
# 浏览器访问 http://localhost:8000/index.html
```

或者直接双击 `index.html`。

---

## 部署到 RDK X5

板子 IP `192.168.128.10`，密码 `sunrise`，应用路径 `/home/sunrise/cathay_ui/`。

```bash
sshpass -p 'sunrise' rsync -az \
  --exclude='.git' --exclude='node_modules' --exclude='*.mp4' \
  --exclude='frames' --exclude='venv' --exclude='.claude' \
  --exclude='archive' \
  ./ sunrise@192.168.128.10:/home/sunrise/cathay_ui/
```

板子上 systemd 服务 `cathay-http.service`（HTTP server）+ `cathay-kiosk.service`（Firefox kiosk）已经配好，刷新代码后：

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
                          （自动循环下一航班，31 选 1 概率加权）
```

各 JS 模块通过 `window` 全局通信：
- `window.ifeApp` — 状态机入口
- `window.GlobeScene` — 地球场景（init / startFlight / reset）
- `window.SplitFlapBoard` — 翻牌动画
- `window.installDayNightCycle` — 昼夜 shader 安装

详细架构（CJK 字体切换、航线高度计算、相机跟拍、设备树 overlay 等）见 [CLAUDE.md](CLAUDE.md)。

---

## 多语言

启动屏选什么语言会决定后续显示：

| 选择 | 目的地名称字段 | 出发地（香港） |
|---|---|---|
| English | `destinationName` | "Hong Kong" |
| 繁體中文 | `destinationNameCn` | "香港" |
| 簡體中文 | `destinationNameCnS` | "香港" |
| 日本語 / 한국어 | `destinationNameCn`（汉字与繁中通用） | "香港" |
| Français / Deutsch | `destinationName`（英文回退） | "Hong Kong" |

---

## 参考

- [globe.gl day-night-cycle 示例](https://globe.gl/example/day-night-cycle/) — 昼夜 shader 直接复刻
- [Three.js](https://threejs.org/)
- [panel-mipi-dbi 驱动源码](https://github.com/torvalds/linux/blob/master/drivers/gpu/drm/tiny/panel-mipi-dbi.c)
