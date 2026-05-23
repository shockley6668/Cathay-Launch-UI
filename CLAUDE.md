# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Cathay Pacific IFE (In-Flight Entertainment) boot screen replica, built with pure HTML5/CSS3/Vanilla JS. No build tools, no package manager — open `index.html` directly in a browser.

**Target hardware**: Optimized for **RDK X5 embedded dev board** with a **3.5" ST7796S screen (320x480 portrait)**. All layout, font sizes, and GPU-heavy effects (WebGL, 3D CSS transforms) are tuned for this constrained resolution and Chromium rendering on the board. When making changes, always consider the 320x480 viewport and embedded GPU performance.

## Development

- **Run**: Open `index.html` in a browser, or serve via `python3 -m http.server`
- **No build/lint/test commands** — zero-tooling static site
- **External deps** via CDN in `index.html`: Three.js 0.162, Globe.gl 2.32.2, Google Fonts (Inter, Roboto Mono, Noto Sans TC)
- **Audio**: All sound is synthesized at runtime via Web Audio API — no audio files to load. Requires a user tap to activate (browser autoplay policy).

## Architecture

Finite state machine with 5 states in `IFEApplication` (`js/app.js`):

```
START_SCREEN → GLOBE_SCENE → GLOBE_ARRIVE → TRANSITION_TO_BOARD → BOARD_SCENE
                ↑                                                           |
                └───────────────────────────────────────────────────────────┘
                              (tap cycles next flight, 31 routes)
```

### Modules (IIFE pattern, all communicate via `window` globals)

- **`js/app.js`** — `IFEApplication` state machine, `CabinMusic` audio synthesizer, starfield canvas, `GlobeFlapDisplay` (destination name overlay on globe scene). Boot point: `window.ifeApp`.
- **`js/globe-scene.js`** — `window.GlobeScene`. Globe.gl setup with custom GLSL day/night shader, great-circle route generation, 3D airplane model animation, programmatic camera sequence (zoom-out → fly → zoom-in → pull-back).
- **`js/split-flap.js`** — `window.SplitFlapBoard`. DOM-based split-flap departure board. CSS 3D `rotateX` flip animations synced with Web Audio mechanical click synthesis. Fixed row widths in `ROW_CONFIGS`.
- **`js/destinations.js`** — 31 real HKG routes. Each has `destinationName` (for globe HUD, Chinese/English) and `destinationNameBoard` (uppercase English for split-flap).

### Audio (two separate AudioContexts)

- `CabinMusic` (app.js): Ambient chord progressions (Fmaj9 → Cmaj9 → Bbmaj9 → Am9) + periodic cabin chimes
- `SplitFlapBoard` (split-flap.js): Mechanical click sounds (white noise burst + resonant triangle pop), throttled to avoid clipping

### Key patterns to know

- **Chinese vs English rendering**: Globe HUD detects CJK characters — Chinese uses staggered fade-in (`_showChinese`), English uses character-drum rolling animation
- **Sweep transition**: CSS clip-path animation (`#sweep-transition`) masks scene changes
- **Status colors**: Auto-detected from status text — BOARDING/GO → blue (`info`), DELAY/CANCEL → orange (`warn`)
- **Camera locked**: Globe.gl `enableRotate: false`; all camera movement is programmatic via `globe.pointOfView()` with timed interpolation
- **Module init order**: `globe-scene.js` and `split-flap.js` self-init via their IIFE on load; `app.js` orchestrates state transitions and calls into them

### Reference material

- `frames/` — 79 JPEG screenshots from reference video for visual comparison
- `extract_frames.py` — script used to extract those frames from the `.mp4`
