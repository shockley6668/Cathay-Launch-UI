/**
 * Cathay Pacific IFE UI - 3D Globe Scene
 * Matches the reference video: natural blue atmosphere, full cinematic camera sequence
 */
(function() {
  const HKG_COORDS = { lat: 22.3080, lng: 113.9185 };

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

  // ── Airplane (2D sprite, constant screen size) ───────────────
  function createAirplane() {
    const textureLoader = new THREE.TextureLoader();
    const texture = textureLoader.load('assets/plane.png');
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(4, 4, 1);
    return sprite;
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
      
      // Move directional light to left after globe is ready
      try {
        const dirLight = globe.scene().children.find(obj => obj.type === 'DirectionalLight') || globe.camera().children.find(obj => obj.type === 'DirectionalLight');
        if (dirLight) {
          dirLight.position.set(-5, 0, 1);
        }
      } catch (e) {
        console.error("Error setting light:", e);
      }
    });

    // 3D Airplane
    airplane = createAirplane();
    airplane.visible = false;
    globe.scene().add(airplane);

    // Start view: looking at Pacific Ocean with a terminator line
    globe.pointOfView({ lat: 10, lng: 160, altitude: 0.58 });
    globe.controls().autoRotate      = true;
    globe.controls().autoRotateSpeed = 0.3;
    globe.controls().enableZoom      = false;
    globe.controls().enablePan       = false;
    globe.controls().enableRotate    = false; // Lock – we drive all camera
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
      { lat: HKG_COORDS.lat, lng: HKG_COORDS.lng, text: '香港', size: 'small' },
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
        airplane.position.copy(points[idx]);
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
    globe.pointOfView({ lat: dest.lat, lng: dest.lng, altitude: flightAlt + 0.6 }, 1800);

    setTimeout(() => {
      // Step 2: Pan to HKG
      globe.pointOfView({ lat: HKG_COORDS.lat, lng: HKG_COORDS.lng, altitude: flightAlt * 0.8 }, 2000);

      setTimeout(() => {
        // Step 3: Fly along route — camera follows airplane on the great circle
        const flightDuration = 6000;
        const startTime = performance.now();
        const points = window.airplanePathPoints || [];

        function trackFlight() {
          const t = Math.min((performance.now() - startTime) / flightDuration, 1.0);
          if (t < 1.0 && points.length > 0) {
            const idx = Math.floor(t * (points.length - 1));
            const pos = points[idx];
            const lat = Math.asin(pos.y / pos.length()) * 180 / Math.PI;
            const lng = Math.atan2(pos.x, pos.z) * 180 / Math.PI;
            globe.pointOfView({ lat, lng, altitude: flightAlt }, 300);
            requestAnimationFrame(trackFlight);
          }
        }
        trackFlight();

        animateAirplane(destWithName, flightDuration, () => {
          // Step 4: Zoom into destination
          globe.pointOfView({ lat: dest.lat, lng: dest.lng, altitude: 0.35 }, 1500);

          setTimeout(() => {
            if (airplane) airplane.visible = false;
            if (onComplete) onComplete();
          }, 1600);
        });
      }, 2100);
    }, 1900);
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
