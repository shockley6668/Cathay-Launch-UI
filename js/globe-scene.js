/**
 * Cathay Pacific IFE UI - 3D Globe Scene
 * Matches the reference video: natural blue atmosphere, full cinematic camera sequence
 */
(function() {
  const HKG_COORDS = { lat: 22.3080, lng: 113.9185 };
  const PLANE_SCREEN_SIZE_PX = 28; // 飞机在屏幕上的目标尺寸（像素）
  const PLANE_MODEL_LENGTH = 4.0;  // 模型本身的世界单位长度（首尾大约 4 单位）

  let globe = null;
  let airplane = null;
  let flightCurve = null;
  let routeLine = null;
  let isFlying = false;

  // ── Helpers ──────────────────────────────────────────────────
  function latLngToUnitVector(lat, lng) {
    const latRad = lat * Math.PI / 180;
    const lngRad = lng * Math.PI / 180;
    return new THREE.Vector3(
      Math.cos(latRad) * Math.sin(lngRad),
      Math.sin(latRad),
      Math.cos(latRad) * Math.cos(lngRad)
    );
  }

  function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function getAltitudeForRoute(destLat, destLng) {
    const dist = haversineDistance(HKG_COORDS.lat, HKG_COORDS.lng, destLat, destLng);
    // Short <2000km: 0.25 | Medium 2000-6000km: 0.45 | Long >6000km: 0.7
    if (dist < 2000) return 0.25;
    if (dist < 6000) return 0.45;
    return 0.7;
  }

  function createGreatCircleCurve(startLat, startLng, endLat, endLng, altitudeOffset, numPoints) {
    altitudeOffset = altitudeOffset || 0.12;
    numPoints = numPoints || 120;
    const startVec = latLngToUnitVector(startLat, startLng);
    const endVec   = latLngToUnitVector(endLat,   endLng);
    const points   = [];
    for (let i = 0; i <= numPoints; i++) {
      const t = i / numPoints;
      const p = new THREE.Vector3().copy(startVec).lerp(endVec, t).normalize();
      const alt = Math.sin(t * Math.PI) * altitudeOffset;
      p.multiplyScalar(100 * (1 + alt));
      points.push(p);
    }
    return new THREE.CatmullRomCurve3(points);
  }

  // ── Airplane (low-poly 3D model, screen-space constant size) ─
  // 模型坐标系：机头朝 +X，机翼沿 ±Z 展开，机背朝 +Y
  function createAirplane() {
    const plane = new THREE.Group();

    const bodyMat   = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x333333 });
    const accentMat = new THREE.MeshLambertMaterial({ color: 0x006564, emissive: 0x001818 });

    // Fuselage
    const fuselage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 3.0, 14),
      bodyMat
    );
    fuselage.rotation.z = Math.PI / 2;
    plane.add(fuselage);

    // Nose cone
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.7, 14),
      bodyMat
    );
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 1.85;
    plane.add(nose);

    // Tail cone
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.5, 14),
      bodyMat
    );
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -1.75;
    plane.add(tail);

    // Main wings (三角后掠翼)
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0.5, 0);
    wingShape.lineTo(-0.8, 2.2);
    wingShape.lineTo(-1.15, 2.2);
    wingShape.lineTo(-0.5, 0);
    wingShape.lineTo(-1.15, -2.2);
    wingShape.lineTo(-0.8, -2.2);
    wingShape.closePath();
    const wingGeom = new THREE.ExtrudeGeometry(wingShape, { depth: 0.09, bevelEnabled: false });
    wingGeom.translate(0, 0, -0.045);
    const wings = new THREE.Mesh(wingGeom, accentMat);
    wings.rotation.x = -Math.PI / 2;
    wings.position.y = -0.08;
    plane.add(wings);

    // Horizontal stabilizer
    const stabShape = new THREE.Shape();
    stabShape.moveTo(0.25, 0);
    stabShape.lineTo(-0.3, 1.0);
    stabShape.lineTo(-0.55, 1.0);
    stabShape.lineTo(-0.25, 0);
    stabShape.lineTo(-0.55, -1.0);
    stabShape.lineTo(-0.3, -1.0);
    stabShape.closePath();
    const stabGeom = new THREE.ExtrudeGeometry(stabShape, { depth: 0.07, bevelEnabled: false });
    stabGeom.translate(0, 0, -0.035);
    const stab = new THREE.Mesh(stabGeom, accentMat);
    stab.rotation.x = -Math.PI / 2;
    stab.position.set(-1.55, 0, 0);
    plane.add(stab);

    // Vertical stabilizer
    const vertShape = new THREE.Shape();
    vertShape.moveTo(0.3, 0);
    vertShape.lineTo(-0.4, 0.95);
    vertShape.lineTo(-0.7, 0.95);
    vertShape.lineTo(-0.3, 0);
    vertShape.closePath();
    const vertGeom = new THREE.ExtrudeGeometry(vertShape, { depth: 0.07, bevelEnabled: false });
    vertGeom.translate(0, 0, -0.035);
    const vert = new THREE.Mesh(vertGeom, accentMat);
    vert.position.set(-1.45, 0.25, 0);
    plane.add(vert);

    // Cockpit window strip — removed per user request

    // Engines (左右各一)
    const engineGeom = new THREE.CylinderGeometry(0.13, 0.13, 0.55, 10);
    const engineL = new THREE.Mesh(engineGeom, bodyMat);
    engineL.rotation.z = Math.PI / 2;
    engineL.position.set(-0.15, -0.28, 1.0);
    plane.add(engineL);
    const engineR = new THREE.Mesh(engineGeom, bodyMat);
    engineR.rotation.z = Math.PI / 2;
    engineR.position.set(-0.15, -0.28, -1.0);
    plane.add(engineR);

    // Extra light specifically for the airplane (主光在球体另一侧时也能看清)
    const planeLight = new THREE.PointLight(0xffffff, 0.6);
    planeLight.position.set(2, 3, 2);
    plane.add(planeLight);

    return plane;
  }

  // 让飞机在屏幕上保持恒定像素大小
  function updatePlaneScreenScale() {
    if (!airplane || !globe || !airplane.visible) return;
    const camera = globe.camera();
    const canvasHeight = globe.renderer().domElement.clientHeight;
    if (!canvasHeight) return;
    const distance = camera.position.distanceTo(airplane.position);
    const fovRad = camera.fov * Math.PI / 180;
    // 1 像素对应的世界单位大小
    const worldPerPixel = (2 * distance * Math.tan(fovRad / 2)) / canvasHeight;
    const targetWorldLength = PLANE_SCREEN_SIZE_PX * worldPerPixel;
    const scale = targetWorldLength / PLANE_MODEL_LENGTH;
    airplane.scale.set(scale, scale, scale);
  }

  // 让飞机朝向当前运动方向，机背朝外（背对地心）
  // 模型坐标系：机头 +X，机背 +Y，右翼 +Z
  function orientPlane(currentPos, nextPos) {
    if (!airplane) return;
    // 1) 飞行前方
    const forward = nextPos.clone().sub(currentPos).normalize();
    // 2) 径向外（地心 -> 飞机位置），即机背方向
    const up = currentPos.clone().normalize();
    // 3) 修正 forward 让它严格垂直于 up（去掉径向分量）
    const correctedForward = forward.clone()
      .sub(up.clone().multiplyScalar(forward.dot(up)))
      .normalize();
    // 4) 右翼方向 = forward × up （右手系下指向右侧）
    const right = new THREE.Vector3()
      .crossVectors(correctedForward, up)
      .normalize();

    // makeBasis(xCol, yCol, zCol) 三列分别对应模型的 +X、+Y、+Z 在世界中的朝向
    const m = new THREE.Matrix4();
    m.makeBasis(correctedForward, up, right);
    airplane.quaternion.setFromRotationMatrix(m);
  }


  // ── Init ─────────────────────────────────────────────────────
  function init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    globe = Globe()(container)
      .backgroundColor('rgba(0,0,0,0)')
      .showGlobe(true)
      .showAtmosphere(false)
      .globeImageUrl('assets/earth_atmos_2048.jpg');

    // Force 1.0 pixel ratio for performance
    globe.renderer().setPixelRatio(1.0);

    // Override camera updateProjectionMatrix to support smooth skew offset
    const camera = globe.camera();
    const originalUpdateProjectionMatrix = camera.updateProjectionMatrix;
    camera.updateProjectionMatrix = function() {
      originalUpdateProjectionMatrix.call(this);
      this.projectionMatrix.elements[9] = window.currentCameraSkewY || 0;
    };

    // Ensure globe resizes correctly when container becomes visible
    window.addEventListener('resize', () => {
      if (globe && container.clientWidth) {
        globe.width(container.clientWidth);
        globe.height(container.clientHeight);
      }
    });

    // Suppress tooltips
    globe.onGlobeReady(() => {
      const tooltipEl = container.querySelector('.scene-tooltip');
      if (tooltipEl) tooltipEl.style.display = 'none';

      // 安装昼夜循环（来自 globe.gl 官方 day-night-cycle 示例）
      if (window.installDayNightCycle) {
        window.installDayNightCycle(globe);
      }

      // Move directional light to left after globe is ready
      try {
        const dirLight = globe.scene().children.find(obj => obj.type === 'DirectionalLight') || globe.camera().children.find(obj => obj.type === 'DirectionalLight');
        if (dirLight) {
          dirLight.position.set(-5, 0, 1);
          dirLight.intensity = 1.0;
        }
        // 加一个补光确保飞机有亮面
        const ambient = globe.scene().children.find(obj => obj.type === 'AmbientLight');
        if (ambient) {
          ambient.intensity = 0.15;
        } else {
          globe.scene().add(new THREE.AmbientLight(0xffffff, 0.15));
        }
      } catch (e) {
        console.error("Error setting light:", e);
      }
    });

    // 3D Airplane
    airplane = createAirplane();
    airplane.visible = false;
    globe.scene().add(airplane);

    // 每帧维持飞机屏幕大小不变
    globe.onZoom(() => updatePlaneScreenScale());
    const _renderer = globe.renderer();
    const _origRender = _renderer.render.bind(_renderer);
    _renderer.render = function(s, c) {
      updatePlaneScreenScale();
      _origRender(s, c);
    };

    // Start view: looking at Pacific Ocean with a terminator line
    globe.pointOfView({ lat: 10, lng: 160, altitude: 0.58 });
    globe.controls().autoRotate      = true;
    globe.controls().autoRotateSpeed = 0.3;
    globe.controls().enableZoom      = false;
    globe.controls().enablePan       = false;
    globe.controls().enableRotate    = false; // Lock – we drive all camera

    // 让太阳缓慢绕地球转，制造昼夜交替效果（每 60s 转一圈）
    startSunRotation();
  }

  // 让 DirectionalLight 围绕 Y 轴自转，造成 terminator 在地球表面滑过的效果
  let _sunStarted = false;
  function startSunRotation() {
    if (_sunStarted) return;
    _sunStarted = true;
    const startTime = performance.now();
    const period = 60000; // 60 秒一圈
    const radius = 5;
    function tick() {
      const t = (performance.now() - startTime) / period;
      const angle = t * Math.PI * 2;
      const dirLight = globe.scene().children.find(o => o.type === 'DirectionalLight')
               || globe.camera().children.find(o => o.type === 'DirectionalLight');
      if (dirLight) {
        dirLight.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle * 0.3) * 1.0, // 微小的纬度抖动
          Math.sin(angle) * radius
        );
      }
      requestAnimationFrame(tick);
    }
    tick();
  }

  // ── Route Building ───────────────────────────────────────────
  function buildRoute(destCoords) {
    // Remove old route
    if (routeLine) {
      globe.scene().remove(routeLine);
      routeLine.geometry.dispose();
      routeLine.material.dispose();
      routeLine = null;
    }

    flightCurve = createGreatCircleCurve(
      HKG_COORDS.lat, HKG_COORDS.lng,
      destCoords.lat, destCoords.lng,
      0.14, 50
    );

    // Dashed-style line via segments (white, semi-transparent)
    const pts     = flightCurve.getPoints(50);
    const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat  = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 1,
      transparent: true,
      opacity: 0.55
    });
    routeLine = new THREE.Line(lineGeom, lineMat);
    globe.scene().add(routeLine);

    // Pre-calculate 200 animation points to avoid spline calculations on every frame
    window.airplanePathPoints = flightCurve.getPoints(200);

    // Subtle endpoint rings
    globe.ringsData([
      { lat: HKG_COORDS.lat,  lng: HKG_COORDS.lng,  color: 'rgba(255,255,255,0.6)' },
      { lat: destCoords.lat,  lng: destCoords.lng,   color: 'rgba(255,255,255,0.6)' }
    ])
      .ringColor(d => d.color)
      .ringMaxRadius(2.5)
      .ringPropagationSpeed(1.0)
      .ringRepeatPeriod(1200);

    // City labels – HTML elements for proper CJK rendering
    const labelData = [
      { lat: HKG_COORDS.lat, lng: HKG_COORDS.lng, text: destCoords.originName || 'Hong Kong', size: 'small' },
      { lat: destCoords.lat, lng: destCoords.lng,  text: destCoords.name || '', size: 'small' }
    ];

    globe.htmlElementsData(labelData)
      .htmlLat(d => d.lat)
      .htmlLng(d => d.lng)
      .htmlElement(d => {
        const el = document.createElement('div');
        el.className = 'globe-city-label';
        el.textContent = d.text;
        return el;
      })
      .htmlAltitude(0.005);
  }

  // ── Airplane Animation ────────────────────────────────────────
  function animateAirplane(destCoords, flightDurationMs, onComplete) {
    if (!flightCurve || isFlying) return;
    isFlying = true;
    airplane.visible = true;
    globe.controls().autoRotate = false;

    const startTime = performance.now();
    const points = window.airplanePathPoints || [];
    const numPoints = points.length;

    function step() {
      const t = Math.min((performance.now() - startTime) / flightDurationMs, 1.0);

      if (numPoints > 0) {
        const idx = Math.floor(t * (numPoints - 1));
        const nextIdx = Math.min(idx + 1, numPoints - 1);
        airplane.position.copy(points[idx]);
        orientPlane(points[idx], points[nextIdx]);
      }

      if (t < 1.0) {
        requestAnimationFrame(step);
      } else {
        isFlying = false;
        if (onComplete) onComplete();
      }
    }
    step();
  }

  // ── Main Flight Sequence (matches video) ─────────────────────
  function startFlight(dest, onComplete) {
    globe.controls().autoRotate = false;

    const dirLight = globe.scene().children.find(obj => obj.type === 'DirectionalLight') || globe.camera().children.find(obj => obj.type === 'DirectionalLight');
    if (dirLight) {
      dirLight.position.set(0, 0, 1);
    }

    const destWithName = { ...dest };
    buildRoute(destWithName);

    const flightAlt = getAltitudeForRoute(dest.lat, dest.lng);

    // Step 1: Zoom out to show route overview
    globe.pointOfView({ lat: dest.lat, lng: dest.lng, altitude: flightAlt + 0.6 }, 1200);

    setTimeout(() => {
      // Step 2: Pan to HKG
      globe.pointOfView({ lat: HKG_COORDS.lat, lng: HKG_COORDS.lng, altitude: flightAlt * 0.8 }, 1300);

      setTimeout(() => {
        // Step 3: Fly along route — camera follows airplane on the great circle
        const flightDuration = 4000;
        const startTime = performance.now();
        const points = window.airplanePathPoints || [];

        function trackFlight() {
          const t = Math.min((performance.now() - startTime) / flightDuration, 1.0);
          if (t < 1.0 && points.length > 0) {
            // 镜头看的点：比飞机当前位置略微提前一点（朝目的地方向），
            // 这样飞机出现在屏幕中下方，前方留出空间，看着像跟拍。
            const lookAhead = 0.04; // 0~1 之间，越大镜头越往前
            const tLook = Math.min(t + lookAhead, 1.0);
            const idxLook = Math.floor(tLook * (points.length - 1));
            const pos = points[idxLook];
            const lat = Math.asin(pos.y / pos.length()) * 180 / Math.PI;
            const lng = Math.atan2(pos.x, pos.z) * 180 / Math.PI;
            // 0ms transition：立即跳到位置，不要每帧叠加缓动导致镜头滞后
            globe.pointOfView({ lat, lng, altitude: flightAlt }, 0);
            requestAnimationFrame(trackFlight);
          }
        }
        trackFlight();

        animateAirplane(destWithName, flightDuration, () => {
          // Step 4: Zoom into destination
          globe.pointOfView({ lat: dest.lat, lng: dest.lng, altitude: 0.35 }, 1100);

          setTimeout(() => {
            if (airplane) airplane.visible = false;
            if (onComplete) onComplete();
          }, 1200);
        });
      }, 1400);
    }, 1300);
  }

  function shiftCameraToBottom(duration = 2000) {
    if (!globe) return;
    const camera = globe.camera();

    const startSkew = 0;
    const targetSkew = 2.8;
    const startTime = performance.now();

    function step() {
      const t = Math.min((performance.now() - startTime) / duration, 1.0);
      const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      window.currentCameraSkewY = startSkew + (targetSkew - startSkew) * easeT;
      camera.updateProjectionMatrix();

      if (t < 1.0) {
        requestAnimationFrame(step);
      }
    }
    step();
  }

  // ── Public API ────────────────────────────────────────────────
  window.GlobeScene = {
    init,
    startFlight,
    reset() {
      if (!globe) return;
      if (routeLine) {
        globe.scene().remove(routeLine);
        routeLine = null;
      }
      if (airplane) airplane.visible = false;

      globe.pointOfView({ lat: 10, lng: 160, altitude: 0.58 }, 0);
      globe.controls().autoRotate = true;

      window.currentCameraSkewY = 0;
      globe.camera().updateProjectionMatrix();

      try {
        const dirLight = globe.scene().children.find(obj => obj.type === 'DirectionalLight') || globe.camera().children.find(obj => obj.type === 'DirectionalLight');
        if (dirLight) {
          dirLight.position.set(-5, 0, 1);
        }
      } catch (e) {}
    },
    // Legacy stubs for app.js compatibility
    focusHKG()        { if (globe) globe.pointOfView({ lat: HKG_COORDS.lat, lng: HKG_COORDS.lng, altitude: 1.6 }, 1200); },
    panToYYZ()        { if (globe) globe.pointOfView({ lat: 43.65, lng: -79.38, altitude: 1.2 }, 1800); },
    zoomOutRoute()    { if (globe) globe.pointOfView({ lat: 60, lng: 20, altitude: 2.5 }, 1800); },
    startAirplaneAnimation(cb) { animateAirplane({}, 5000, cb); },
    shiftCameraToBottom
  };
})();
