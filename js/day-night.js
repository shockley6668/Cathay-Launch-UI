// Day/Night cycle for Globe.gl (adapted from official example)
// Exposes window.installDayNightCycle(globe)
(function() {
  const dayNightShader = {
    vertexShader: `
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      #define PI 3.141592653589793
      uniform sampler2D dayTexture;
      uniform sampler2D nightTexture;
      uniform vec2 sunPosition;
      uniform vec2 globeRotation;
      varying vec3 vNormal;
      varying vec2 vUv;

      float toRad(in float a) {
        return a * PI / 180.0;
      }

      vec3 Polar2Cartesian(in vec2 c) {
        float theta = toRad(90.0 - c.x);
        float phi = toRad(90.0 - c.y);
        return vec3(
          sin(phi) * cos(theta),
          cos(phi),
          sin(phi) * sin(theta)
        );
      }

      void main() {
        float invLon = toRad(globeRotation.x);
        float invLat = -toRad(globeRotation.y);
        mat3 rotX = mat3(
          1, 0, 0,
          0, cos(invLat), -sin(invLat),
          0, sin(invLat), cos(invLat)
        );
        mat3 rotY = mat3(
          cos(invLon), 0, sin(invLon),
          0, 1, 0,
          -sin(invLon), 0, cos(invLon)
        );
        vec3 rotatedSunDirection = rotX * rotY * Polar2Cartesian(sunPosition);
        float intensity = dot(normalize(vNormal), normalize(rotatedSunDirection));
        vec4 dayColor = texture2D(dayTexture, vUv);
        vec4 nightColor = texture2D(nightTexture, vUv);
        float blendFactor = smoothstep(-0.1, 0.1, intensity);
        gl_FragColor = mix(nightColor, dayColor, blendFactor);
      }
    `
  };

  // Velocity: how many minutes of "world time" pass per real frame
  const VELOCITY = 30; // 每帧推进 30 现实分钟，~80 秒一圈昼夜

  function installDayNightCycle(globe) {
    const loader = new THREE.TextureLoader();
    Promise.all([
      loader.loadAsync('assets/earth_daymap_8k.jpg'),
      loader.loadAsync('assets/earth_nightmap_8k.jpg')
    ]).then(([dayTex, nightTex]) => {
      const material = new THREE.ShaderMaterial({
        uniforms: {
          dayTexture:    { value: dayTex },
          nightTexture:  { value: nightTex },
          sunPosition:   { value: new THREE.Vector2() },
          globeRotation: { value: new THREE.Vector2() }
        },
        vertexShader: dayNightShader.vertexShader,
        fragmentShader: dayNightShader.fragmentShader
      });

      globe.globeMaterial(material)
        .onZoom(({ lng, lat }) => {
          material.uniforms.globeRotation.value.set(lng, lat);
        });

      // 太阳固定在香港正午、夏至：经度 ~114° (HKG), 纬度 +23.5° (夏至)
      material.uniforms.sunPosition.value.set(114.17, 23.5);
    });
  }

  window.installDayNightCycle = installDayNightCycle;
})();
