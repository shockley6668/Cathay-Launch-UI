# Session Changelog (2025-05-24~25)

## Overview

This session focused on Chinese language localization, visual polish, flight animation improvements, and deployment workflow.

---

## 1. Chinese Language Localization

### Problem
Selecting 繁體中文 or 簡體中文 still showed English rolling text characters and English subtitle/arrival labels.

### Changes

**`js/destinations.js`**
- Added `destinationNameCnS` (Simplified Chinese) field to all 13 destinations that were missing it (Osaka, Taipei, Beijing, Shanghai, Chengdu, Singapore, Bangkok, Kuala Lumpur, Dubai, Paris, Chicago, Sydney, Hanoi)
- Fixed Sydney: Traditional 繁體 = 雪梨, Simplified 简体 = 悉尼

**`js/app.js`**
- `revealDestination()`: Replaced hardcoded English+Chinese character pool with language-specific pools:
  - `zh-CN`: simplified Chinese city names
  - `zh-TW`/`ja`/`ko`: traditional Chinese city names
  - `en`: `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`
  - Toggles `.rolling-text-cjk` class on container
- Added localized subtitle text ("Enjoy your flight to" → "請享受前往" / "请享受前往" etc.) in `DEST_REVEAL` state
- Added localized arrival label ("Enjoy your journey" → "享受你的旅程") in `GLOBE_ARRIVE` state

### CJK Visual Fixes

**`css/style.css`**
- `.rolling-text-cjk`: container height 60px, gap 2px
- `.rolling-text-cjk .rolling-char-col`: width 40px (was 26px)
- `.rolling-text-cjk .rolling-char`: width 40px, height 60px, font-size 42px (was 38px)
- `.cjk-mode .rolling-subtitle`: font-style normal, letter-spacing 2px, font-size 15px, margin-bottom 10px

**`js/app.js`**
- `revealDestination()`: `charHeight = 60` (same for both English and CJK after adjustment)

---

## 2. CJK HUD Styling (Rolling Text & Arrival Screen)

### Problem
Chinese characters were cramped, logo was too large, text proportions didn't match reference video.

### Changes

**`css/style.css`**
- `.globe-hud-content.cjk-mode`: gap 8px (was 20px default)
- `.globe-hud-content.cjk-mode .globe-brushwing-svg`: width 36px (was 60px)
- `.cjk-mode .globe-enjoy-label`: font-size 13px, letter-spacing 2px, italic
- `.cjk-mode .globe-dest-text`: font-size 44px (was 64px), letter-spacing 6px, no uppercase
- `.cjk-mode .final-text-container`: gap 6px (was 15px)

**`js/app.js`**
- Both `DEST_REVEAL` and `GLOBE_ARRIVE` states toggle `.cjk-mode` on `.globe-hud-content`

---

## 3. Flight Animation Rewrite

### Problem
Camera didn't follow the route, no zoom effects, `onComplete` was called twice (bug), airplane was a 3D model that changed size with camera distance.

### Changes

**`js/globe-scene.js`**

#### 3D Airplane → 2D Sprite
- Replaced `createAirplane()` (60+ lines of Three.js geometry) with 4-line sprite loader:
  ```js
  const texture = textureLoader.load('assets/plane.png');
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(4, 4, 1); // constant screen size
  ```
- Simplified `animateAirplane()`: removed quaternion/matrix orientation logic, sprite always faces camera

#### Distance-Based Altitude
- Added `haversineDistance()` helper function
- Added `getAltitudeForRoute(destLat, destLng)`:
  - Short <2000km (e.g. HKG→TPE): altitude 0.25
  - Medium 2000-6000km (e.g. HKG→BKK): altitude 0.45
  - Long >6000km (e.g. HKG→LAX): altitude 0.7
- `startFlight()` uses `flightAlt = getAltitudeForRoute(dest.lat, dest.lng)`
- Zoom-out: `flightAlt + 0.6`, HKG pan: `flightAlt * 0.8`, flight: `flightAlt`, zoom-in: 0.35

#### Camera Route Tracking
- During flight phase, `requestAnimationFrame` loop:
  1. Reads airplane 3D position from `window.airplanePathPoints`
  2. Converts to lat/lng via `Math.asin(y/len)` and `Math.atan2(x,z)`
  3. Calls `globe.pointOfView({lat, lng, altitude: flightAlt}, 300)` with 300ms smooth transition

#### Flight Sequence (5 phases)
1. Zoom out to `flightAlt + 0.6` (1.8s) — route overview
2. Pan to HKG at `flightAlt * 0.8` (2s)
3. Camera follows airplane along great circle (6s, 300ms transitions)
4. Zoom into destination at altitude 0.35 (1.5s)
5. Hide airplane, call `onComplete`

#### Earth Skew on Arrival
- `shiftCameraToBottom()`: `targetSkew = 2.8` (pushes earth to bottom ~35% of screen)
- Applied via `camera.projectionMatrix.elements[9]` override in `updateProjectionMatrix`

#### Route Visualization
- `buildRoute()`: great-circle curve via `CatmullRomCurve3`, dashed white line
- Endpoint rings via `globe.ringsData()`
- City labels via `globe.htmlElementsData()` with CJK support

---

## 4. RDK Deployment Workflow

### Setup
- RDK IP: `192.168.128.10`, user: `sunrise`, password: `sunrise`
- App deployed to `/home/sunrise/cathay_ui/`

### Deploy Command
```bash
sshpass -p 'sunrise' rsync -az \
  --exclude='.git' --exclude='node_modules' --exclude='*.mp4' \
  --exclude='frames' --exclude='venv' --exclude='.claude' \
  /Users/shockleykun/Project/Cathay_UI/ \
  sunrise@192.168.128.10:/home/sunrise/cathay_ui/
```

### Restart Firefox Kiosk
```bash
sshpass -p 'sunrise' ssh -o ControlPath=none sunrise@192.168.128.10 \
  "killall firefox 2>/dev/null; sleep 1; \
   DISPLAY=:0 nohup firefox --kiosk http://localhost:8000/index.html &>/tmp/firefox_kiosk.log &"
```

### Known Issues
- SSH drops with "Connection closed" after many rapid rsync/ssh calls (sshd overload)
- Fix: add `-o ControlPath=none` to ssh commands, or wait 15-30 seconds

---

## 5. Files Modified This Session

| File | Changes |
|------|---------|
| `js/destinations.js` | Added `destinationNameCnS` to 13 destinations, fixed Sydney zh-CN |
| `js/app.js` | CJK rolling text pool, localized subtitles/arrival labels, cjk-mode toggle |
| `js/globe-scene.js` | 2D sprite airplane, distance-based altitude, camera route tracking, skew=2.8 |
| `css/style.css` | CJK rolling text sizing, cjk-mode HUD overrides |
| `CLAUDE.md` | Updated architecture docs, RDK deployment instructions |
