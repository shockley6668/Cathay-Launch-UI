# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cathay Pacific IFE (In-Flight Entertainment) boot screen replica, built with pure HTML5/CSS3/Vanilla JS. No build tools, no package manager — open `index.html` directly in a browser.

**Target hardware**: Optimized for **RDK X5 embedded dev board** with a **3.5" ST7796S screen (320x480 portrait)**. All layout, font sizes, and GPU-heavy effects (WebGL, 3D CSS transforms) are tuned for this constrained resolution and Chromium rendering on the board. When making changes, always consider the 320x480 viewport and embedded GPU performance.

**RDK deployment**: `sshpass -p 'sunrise' rsync -az --exclude='.git' --exclude='node_modules' --exclude='*.mp4' --exclude='frames' --exclude='venv' --exclude='.claude' /path/to/Cathay_UI/ sunrise@192.168.128.10:/home/sunrise/cathay_ui/` then restart Firefox kiosk.

## Development

- **Run**: Open `index.html` in a browser, or serve via `python3 -m http.server`
- **No build/lint/test commands** — zero-tooling static site
- **External deps** via CDN in `index.html`: Three.js 0.158, Globe.gl 2.32.2, Google Fonts (Inter, Roboto Mono, Noto Sans TC)
- **Audio**: `<audio>` tag with external MP4 file (not Web Audio API synthesis). Requires a user tap to activate (browser autoplay policy).

## Architecture

Finite state machine with 4 states in `IFEApplication` (`js/app.js`):

```
START_SCREEN → GLOBE_SCENE → DEST_REVEAL → GLOBE_ARRIVE
                ↑                                    |
                └────────────────────────────────────┘
                          (auto-cycle next flight, 31 routes)
```

### Modules (all communicate via `window` globals)

- **`js/app.js`** — `IFEApplication` state machine, starfield canvas, `revealDestination()` rolling text animation, `getDestName()` language-aware destination name resolver. Boot point: `window.ifeApp`.
- **`js/globe-scene.js`** — `window.GlobeScene`. Globe.gl setup, great-circle route generation, 2D airplane sprite animation (`assets/plane.png`), programmatic camera sequence with distance-based altitude scaling and route-following camera tracking.
- **`js/split-flap.js`** — `window.SplitFlapBoard`. DOM-based split-flap departure board. CSS 3D `rotateX` flip animations. Fixed row widths in `ROW_CONFIGS`. Character drum is ASCII-only (`A-Z 0-9 -`), not used in current flow.
- **`js/destinations.js`** — 31 real HKG routes. Each has: `destinationName` (English), `destinationNameCn` (Traditional Chinese), `destinationNameCnS` (Simplified Chinese), `destinationNameBoard` (uppercase English for split-flap).

### Key patterns

- **Multi-language support**: Language selected on start screen. `getDestName(flight)` returns the correct name by `this.selectedLang`. Globe HUD rolling text uses CJK character pools for zh-TW/zh-CN/ja/ko.
- **CJK rendering**: Rolling text uses `.rolling-text-cjk` CSS class — wider columns (40px vs 26px), larger font (42px vs 38px), non-italic subtitle. Arrival screen uses `.cjk-mode` on `.globe-hud-content` — smaller logo (36px), smaller destination text (44px), tighter gaps.
- **Flight altitude scaling**: `getAltitudeForRoute(destLat, destLng)` uses haversine distance. Short <2000km → 0.25, Medium 2000-6000km → 0.45, Long >6000km → 0.7. Zoom-in at destination is always 0.35.
- **Camera route tracking**: During flight, `requestAnimationFrame` loop reads airplane's 3D position, converts to lat/lng, and calls `globe.pointOfView({lat, lng, altitude: flightAlt}, 300)` with 300ms smooth transition.
- **Earth skew on arrival**: `shiftCameraToBottom()` applies vertical skew (targetSkew=2.8) via `camera.projectionMatrix.elements[9]` override, pushing earth to bottom half of screen.
- **2D airplane sprite**: `assets/plane.png` loaded as `THREE.Sprite` with fixed scale (4x4), always same screen size regardless of camera distance.
- **Sweep transition**: CSS clip-path animation (`#sweep-transition`) masks scene changes.
- **Status colors**: Auto-detected from status text — BOARDING/GO → blue (`info`), DELAY/CANCEL → orange (`warn`).
- **Camera locked**: Globe.gl `enableRotate: false`; all camera movement is programmatic via `globe.pointOfView()`.
- **Module init order**: `globe-scene.js` and `split-flap.js` self-init via their IIFE on load; `app.js` orchestrates state transitions and calls into them.

### RDK Deployment

- Host: `192.168.128.10`, user: `sunrise`, password: `sunrise`
- App path: `/home/sunrise/cathay_ui/`
- HTTP server: `python3 -m http.server 8000` (pre-running)
- Browser: Firefox kiosk mode — `DISPLAY=:0 firefox --kiosk http://localhost:8000/index.html`
- Restart: `killall firefox` then re-launch
- SSH tip: Use `-o ControlPath=none` if connection drops from too many sessions

### Reference material

- `frames/` — 79 JPEG screenshots from reference video for visual comparison
- `extract_frames.py` — script used to extract those frames from the `.mp4`
