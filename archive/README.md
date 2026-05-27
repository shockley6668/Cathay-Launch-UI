# Archive — 历史遗留代码

这里是旧版本的实现，已经被新方案取代，**不要在板子上跑这些**。留着只是参考/对照。

| 文件 | 旧用途 | 现在用什么 |
|---|---|---|
| `x11-to-spi.c` / `x11-to-spi.service` | 用户态 SPI 镜像（X11 → SHM 截帧 → spidev 写 ST7796S）。FPS ~16，CPU 占用高。 | 改用内核 `panel-mipi-dbi` DRM 驱动直接写 fb0，FPS 30+。详见 [`../SPI-LCD-SETUP.md`](../SPI-LCD-SETUP.md)。 |
| `patch.c`, `patch2.c` | 调 SPI 时序的小工具 | 已经合到 panel-mipi-dbi 内核模块里 |
| `gt911.py`, `scan.py`, `st7796.py` 及 `*_backup.py` | 用户态 Python 直接控制 GT911 触摸 / ST7796S | 改用内核 `goodix_ts` 驱动 + 设备树 overlay，触摸自动作为 `/dev/input/event*` 暴露给 X11 |
| `touch_redirector.py` / `touch-redirector.service` | 用户态把触摸事件转发到 X11 | 内核驱动接管后不再需要 |
| `check_globe.js`, `dump.js`, `test.js` | 早期调试脚本 | 已经废弃 |
| `extract_frames.py` | 从参考视频抽帧（`frames/` 来源） | 一次性脚本，跑过一次就行 |

如果新方案哪天炸了，可以从这里翻旧版本对照。
