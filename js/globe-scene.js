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
    const mat      = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });

    // Fuselage – smooth cylinder
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4.2, 16), mat);
    fuselage.rotation.x = Math.PI / 2;
    plane.add(fuselage);

    // Nose cone – tapered
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.0, 16), mat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 2.6;
    plane.add(nose);

    // Tail cone – tapered rear
    const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 16), mat);
    tailCone.rotation.x = -Math.PI / 2;
    tailCone.position.z = -2.5;
    plane.add(tailCone);

    // Main wings – swept-back shape with proper proportions
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0);
    wingShape.lineTo(-3.8, -0.8);
    wingShape.lineTo(-4.0, -1.2);
    wingShape.lineTo(-3.6, -1.3);
    wingShape.lineTo(-0.4, -0.5);
    wingShape.lineTo(0.4, -0.5);
    wingShape.lineTo(3.6, -1.3);
    wingShape.lineTo(4.0, -1.2);
    wingShape.lineTo(3.8, -0.8);
    wingShape.lineTo(0, 0);

    const wingGeom = new THREE.ShapeGeometry(wingShape);
    const wings    = new THREE.Mesh(wingGeom, mat);
    wings.rotation.x = -Math.PI / 2;
    wings.position.set(0, 0, 0.1);
    plane.add(wings);

    // Horizontal stabiliser
    const stabShape = new THREE.Shape();
    stabShape.moveTo(0, 0);
    stabShape.lineTo(-1.5, -0.4);
    stabShape.lineTo(-1.6, -0.6);
    stabShape.lineTo(-1.4, -0.65);
    stabShape.lineTo(0, -0.15);
    stabShape.lineTo(1.4, -0.65);
    stabShape.lineTo(1.6, -0.6);
    stabShape.lineTo(1.5, -0.4);
    stabShape.lineTo(0, 0);

    const stabGeom = new THREE.ShapeGeometry(stabShape);
    const stab     = new THREE.Mesh(stabGeom, mat);
    stab.rotation.x = -Math.PI / 2;
    stab.position.set(0, 0, -2.0);
    plane.add(stab);

    // Vertical fin – taller, more realistic
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(0, 1.2);
    finShape.lineTo(-0.15, 1.3);
    finShape.lineTo(-0.3, 0.8);
    finShape.lineTo(-0.35, 0);
    finShape.lineTo(0, 0);

    const finGeom = new THREE.ShapeGeometry(finShape);
    const fin     = new THREE.Mesh(finGeom, mat);
    fin.position.set(0, 0.3, -2.0);
    fin.rotation.y = 0;
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
      .atmosphereColor('#3b82f6')       // Natural blue atmosphere like Google Earth
      .atmosphereAltitude(0.25);

    // Day / Night shader — natural sun position
    const textureLoader = new THREE.TextureLoader();
    const dayTex   = textureLoader.load('assets/earth_daymap_8k.jpg');
    const nightTex = textureLoader.load('assets/earth_nightmap_8k.jpg');

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
        varying vec3 vPosition;
        void main() {
          vUv       = uv;
          vNormal   = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
          vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 dayColor   = texture2D(dayTexture,   vUv).rgb;
          vec3 nightColor = texture2D(nightTexture, vUv).rgb;

          // Fresnel-like rim lighting for atmosphere edge glow
          vec3 viewDir = normalize(cameraPosition - vPosition);
          float fresnel = 1.0 - max(dot(viewDir, vNormal), 0.0);
          fresnel = pow(fresnel, 3.0);

          float intensity = dot(vNormal, sunDirection);
          float blend     = smoothstep(-0.1, 0.3, intensity);

          // Boost city lights on night side
          vec3 boostedNight = nightColor * vec3(1.6, 1.4, 1.0);

          // Blue atmosphere rim on day side
          vec3 rimColor = mix(vec3(0.2, 0.5, 0.9), dayColor, 0.3);
          vec3 finalColor = mix(boostedNight, dayColor, blend);
          finalColor = mix(finalColor, rimColor, fresnel * 0.4 * blend);

          gl_FragColor = vec4(finalColor, 1.0);
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
    // 适配 3.5 寸小屏幕：将高度大幅拉近至 0.9，并微调经纬度以保证香港正好在屏幕左侧偏中位置
    globe.pointOfView({ lat: HKG_COORDS.lat, lng: HKG_COORDS.lng + 20, altitude: 0.9 });
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
    // 强制关闭自转，释放相机控制权以执行拉远/拉近动画
    globe.controls().autoRotate = false;

    // dest = { lat, lng, name }
    const destWithName = { ...dest };

    buildRoute(destWithName);

    // Step 1: Zoom out to see full polar route (like frame_040)
    // Compute mid-point above the great circle (approx polar)
    const midLat = Math.max((HKG_COORDS.lat + dest.lat) / 2 + 20, 55);
    let midLng   = (HKG_COORDS.lng + dest.lng) / 2;
    if (Math.abs(HKG_COORDS.lng - dest.lng) > 180) {
      midLng += 180;
      if (midLng > 180) midLng -= 360;
    }
    globe.pointOfView({ lat: midLat, lng: midLng, altitude: 3.2 }, 2200);

    // Step 2: Start airplane after camera settles
    setTimeout(() => {
      animateAirplane(destWithName, 5500, () => {
        // Step 3: Zoom in to destination (like frame_010 Toronto zoom)
        globe.pointOfView({ lat: dest.lat, lng: dest.lng, altitude: 0.4 }, 1800);

        setTimeout(() => {
          // Step 4: Slowly pull back – earth slides to lower half, like frame_078
          globe.pointOfView({ lat: dest.lat - 20, lng: dest.lng, altitude: 1.5 }, 2200);

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
