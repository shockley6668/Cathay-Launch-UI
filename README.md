# Cathay Pacific IFE Launch UI (国泰航空机上娱乐系统开机界面复刻)

本项目是一个基于 Web 技术栈高保真复刻**国泰航空 (Cathay Pacific) 机上娱乐系统 (IFE)** 开机动画与交互界面的开源项目。项目专为低功耗嵌入式设备（如 RDK 边缘计算板）以及 3.5 英寸小型显示屏进行了深度优化与适配。

## 🚀 核心特性 (Features)

- **🌍 3D 沉浸式地球动画**
  基于 `Three.js` 与 `globe.gl` 实现。点击开屏后，通过平滑的相机路径规划，呈现从高空俯瞰到聚焦香港 (HKG) 并拉出真实航线的精美动画，视觉冲击力极强。
- **🎛️ 机械翻牌屏 (Split-Flap Display) 模拟**
  纯利用 CSS3 3D Transforms 与 JavaScript 实现的物理机械翻牌动画，完美复刻机场经典的航班信息翻页效果（包含翻页延时、视角透视与光影效果）。
- **🎵 精准卡点客舱音乐**
  通过 JS 音频控制，完美匹配国泰航空真实登机音乐（精准空降至高潮 1分58秒 处），实现极其逼真的沉浸式机舱体验。
- **⚡ 硬件性能优化 (RDK / 3.5寸屏适配)**
  针对嵌入式设备（如 RDK X3/X5）资源有限的痛点，剔除了极其耗费 CPU 的 Web Audio API 合成音效，优化了 DOM 重排逻辑 (Forced Reflow Sync)，并调整了 UI FOV 使得其完美填满 480x320 的 3.5 英寸横屏。

## 🛠️ 技术栈 (Tech Stack)

- **核心逻辑**: Vanilla JavaScript (ES6)
- **样式与动画**: CSS3 3D Transforms / Keyframes
- **3D 渲染引擎**: [Three.js](https://threejs.org/) (v0.158.0)
- **地理数据可视化**: [globe.gl](https://globe.gl/) (v2.32.2)

## 📦 如何运行 (How to Run)

本项目为纯前端静态页面，**无需任何复杂的 Node 环境或构建工具编译**。

1. **克隆项目**
   ```bash
   git clone git@github.com:shockley6668/Cathay-Launch-UI.git
   cd Cathay-Launch-UI
   ```
2. **补充音频文件 (必须)**
   为了避免由于版权造成的风险，本项目去除了原版的登机音乐文件。
   请您自行准备登机音乐文件，并将其命名为 `26436501555-1-30280.mp4` 放置于 `assets/` 目录下（或者如果您使用 `.mp3` / `.m4a`，请同步修改 `index.html` 第 54 行的引入路径）。
3. **本地启动**
   推荐使用本地静态服务器启动以避免跨域 (CORS) 问题导致贴图加载失败：
   ```bash
   # 使用 Python 自带的 HTTP Server
   python3 -m http.server 8000
   ```
   或者使用 Node.js 的 `serve`:
   ```bash
   npx serve .
   ```
4. **浏览体验**
   在浏览器中打开 `http://localhost:8000`。
   > **Tip**: 按 `F12` 打开开发者工具，将设备调试切换为 Responsive，分辨率设置为 `480 x 320`（3.5寸屏模拟），可获得最佳视觉效果。点击屏幕正中央即可触发完整登机开场。

## 📜 目录结构 (Directory Structure)

```text
├── index.html          # 主入口文件
├── css/
│   └── style.css       # 全局样式与 3D 动画配置
├── js/
│   ├── app.js          # 全局状态机与主控逻辑
│   ├── globe-scene.js  # 3D 地球视角拉伸、航线规划与动画控制
│   └── split-flap.js   # 机械翻牌显示器核心渲染逻辑
├── assets/             # 存放地球贴图、Logo SVG 与音频文件
└── README.md
```

## ⚠️ 免责声明 (Disclaimer)

本项目仅作为前端图形学、3D 动画与 UI 还原的技术交流与个人学习之用。界面涉及的相关 Logo、品牌元素及登机音乐的版权均属于 **国泰航空 (Cathay Pacific Airways)**，严禁用于任何商业用途。
