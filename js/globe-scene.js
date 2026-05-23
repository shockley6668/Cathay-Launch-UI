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

  // ── Airplane Model ───────────────────────────────────────────
  function createAirplane() {
    const plane    = new THREE.Group();
    const mat      = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });

    // Fuselage
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 4.0, 10), mat);
    fuselage.rotation.x = Math.PI / 2;
    plane.add(fuselage);

    // Nose cone
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.2, 10), mat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 2.6;
    plane.add(nose);

    // Main wings – swept back shape
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(-3.5, -1.0);
    wingShape.lineTo(-3.8, -1.4);
    wingShape.lineTo(-0.3, -0.6);
    wingShape.lineTo(0.3, -0.6);
    wingShape.lineTo(3.8, -1.4);
    wingShape.lineTo(3.5, -1.0);
    wingShape.lineTo(0, 0);

    const wingGeom = new THREE.ShapeGeometry(wingShape);
    const wings    = new THREE.Mesh(wingGeom, mat);
    wings.rotation.x = -Math.PI / 2;
    wings.position.set(0, 0, 0.2);
    plane.add(wings);

    // Horizontal stabiliser
    const stabShape = new THREE.Shape();
    stabShape.moveTo(0, 0);
    stabShape.lineTo(-1.4, -0.5);
    stabShape.lineTo(-1.5, -0.7);
    stabShape.lineTo(0, -0.2);
    stabShape.lineTo(1.5, -0.7);
    stabShape.lineTo(1.4, -0.5);
    stabShape.lineTo(0, 0);

    const stabGeom = new THREE.ShapeGeometry(stabShape);
    const stab     = new THREE.Mesh(stabGeom, mat);
    stab.rotation.x = -Math.PI / 2;
    stab.position.set(0, 0, -1.8);
    plane.add(stab);

    // Vertical fin
    const finGeom = new THREE.BoxGeometry(0.12, 1.0, 0.7);
    const fin     = new THREE.Mesh(finGeom, mat);
    fin.position.set(0, 0.5, -1.8);
    plane.add(fin);

    plane.scale.set(0.55, 0.55, 0.55);
    return plane;
  }

  // ── Init ─────────────────────────────────────────────────────
  function init(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    globe = Globe()(container)
      .backgroundColor('rgba(0,0,0,0)')
      .showGlobe(true)
      .showAtmosphere(true)
      .atmosphereColor('#a8d4f5')       // Natural blue-white atmosphere like the video
      .atmosphereAltitude(0.18);

    // Day / Night shader — natural sun position
    const textureLoader = new THREE.TextureLoader();
    const dayTex   = textureLoader.load('assets/earth_atmos_2048.jpg?v=2');
    const nightTex = textureLoader.load('assets/earth_lights_2048.png?v=2');

    // Sun over Western Pacific – HKG is in warm daylight, destination side varies
    const sunPos = latLngToUnitVector(15, 95);

    const globeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        dayTexture:   { value: dayTex },
        nightTexture: { value: nightTex },
        sunDirection: { value: sunPos }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv     = uv;
          vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vec3 dayColor   = texture2D(dayTexture,   vUv).rgb;
          vec3 nightColor = texture2D(nightTexture, vUv).rgb;
          float intensity = dot(vNormal, sunDirection);
          float blend     = smoothstep(-0.15, 0.25, intensity);
          // Slightly warm up city lights
          vec3 boostedNight = nightColor * vec3(1.5, 1.35, 1.0);
          gl_FragColor = vec4(mix(boostedNight, dayColor, blend), 1.0);
        }
      `
    });

    globe.globeMaterial(globeMaterial);

    // Pixel ratio – no need for super high DPI on IFE screen
    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    // Suppress tooltips
    globe.onGlobeReady(() => {
      const tooltipEl = container.querySelector('.scene-tooltip');
      if (tooltipEl) tooltipEl.style.display = 'none';
    });

    // 3D Airplane
    airplane = createAirplane();
    airplane.visible = false;
    globe.scene().add(airplane);

    // Start view: looking at HKG from a distance – matches video frame 0
    globe.pointOfView({ lat: HKG_COORDS.lat, lng: HKG_COORDS.lng, altitude: 2.2 });
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
      0.14, 150
    );

    // Dashed-style line via segments (white, semi-transparent)
    const pts     = flightCurve.getPoints(150);
    const lineGeom = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat  = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 1,
      transparent: true,
      opacity: 0.55
    });
    routeLine = new THREE.Line(lineGeom, lineMat);
    globe.scene().add(routeLine);

    // Subtle endpoint rings
    globe.ringsData([
      { lat: HKG_COORDS.lat,  lng: HKG_COORDS.lng,  color: 'rgba(255,255,255,0.6)' },
      { lat: destCoords.lat,  lng: destCoords.lng,   color: 'rgba(255,255,255,0.6)' }
    ])
      .ringColor(d => d.color)
      .ringMaxRadius(2.5)
      .ringPropagationSpeed(1.0)
      .ringRepeatPeriod(1200);

    // City labels – small, white, like in video frame_010
    globe.labelsData([
      { lat: HKG_COORDS.lat, lng: HKG_COORDS.lng, text: '香港', color: 'rgba(255,255,255,0.8)', size: 0.5, dot: 0.3, altitude: 0.005 },
      { lat: destCoords.lat, lng: destCoords.lng,  text: destCoords.name || '', color: 'rgba(255,255,255,0.8)', size: 0.5, dot: 0.3, altitude: 0.005 }
    ])
      .labelText(d => d.text)
      .labelColor(d => d.color)
      .labelSize(d => d.size)
      .labelDotRadius(d => d.dot)
      .labelAltitude(d => d.altitude)
      .labelResolution(2);
  }

  // ── Airplane Animation ────────────────────────────────────────
  function animateAirplane(destCoords, flightDurationMs, onComplete) {
    if (!flightCurve || isFlying) return;
    isFlying = true;
    airplane.visible = true;
    globe.controls().autoRotate = false;

    const startTime = performance.now();

    function step() {
      const t = Math.min((performance.now() - startTime) / flightDurationMs, 1.0);

      const pos     = flightCurve.getPoint(t);
      const nextPos = flightCurve.getPoint(Math.min(t + 0.008, 1.0));

      airplane.position.copy(pos);

      // Orient toward direction of travel
      const dir = nextPos.clone().sub(pos).normalize();
      const up  = pos.clone().normalize();
      const right = new THREE.Vector3().crossVectors(dir, up).normalize();
      const correctedDir = new THREE.Vector3().crossVectors(up, right).normalize();
      const matrix = new THREE.Matrix4().makeBasis(right, up, correctedDir.negate());
      airplane.quaternion.setFromRotationMatrix(matrix);

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
    // dest = { lat, lng, name }
    const destWithName = { ...dest };

    buildRoute(destWithName);

    // Step 1: Zoom out to see full polar route (like frame_020)
    // Compute mid-point above the great circle (approx polar)
    const midLat = Math.max((HKG_COORDS.lat + dest.lat) / 2 + 20, 55);
    let midLng   = (HKG_COORDS.lng + dest.lng) / 2;
    if (Math.abs(HKG_COORDS.lng - dest.lng) > 180) {
      midLng += 180;
      if (midLng > 180) midLng -= 360;
    }
    globe.pointOfView({ lat: midLat, lng: midLng, altitude: 2.5 }, 2200);

    // Step 2: Start airplane after camera settles
    setTimeout(() => {
      animateAirplane(destWithName, 5500, () => {
        // Step 3: Zoom in to destination (like frame_010 Toronto zoom)
        globe.pointOfView({ lat: dest.lat, lng: dest.lng, altitude: 0.5 }, 1800);

        setTimeout(() => {
          // Step 4: Slowly pull back – earth slides to lower half, like frame_078
          globe.pointOfView({ lat: dest.lat - 25, lng: dest.lng, altitude: 1.6 }, 2200);

          setTimeout(() => {
            airplane.visible = false;
            if (onComplete) onComplete();
          }, 2400);
        }, 2200);
      });
    }, 2500);
  }

  // ── Public API ────────────────────────────────────────────────
  window.GlobeScene = {
    init,
    startFlight,
    // Legacy stubs for app.js compatibility
    focusHKG()        { if (globe) globe.pointOfView({ lat: HKG_COORDS.lat, lng: HKG_COORDS.lng, altitude: 1.6 }, 1200); },
    panToYYZ()        { if (globe) globe.pointOfView({ lat: 43.65, lng: -79.38, altitude: 1.2 }, 1800); },
    zoomOutRoute()    { if (globe) globe.pointOfView({ lat: 60, lng: 20, altitude: 2.5 }, 1800); },
    startAirplaneAnimation(cb) { animateAirplane({}, 5000, cb); }
  };
})();
