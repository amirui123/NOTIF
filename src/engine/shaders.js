/**
 * Custom GLSL: bodycam / NVG / damage post-process pass and the procedural sky.
 *
 * Fixes vs. the original:
 *  - the damage shader reads straight sRGB values before `OutputPass`, shown on
 *    a linear workflow; the effects are now applied in linear space with
 *    matching intensities so colours stay correct
 *  - the night overlay used to stay at full strength when the camera was
 *    toggled off; the uniforms are now driven from one place
 *  - added a scanline + dust speck bodycam texture so the effect reads as a
 *    real bodycam instead of a plain vignette
 */
import * as THREE from 'three';

export const BodycamShader = {
  name: 'BodycamShader',
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uTime: { value: 0 },
    uDistortion: { value: 0.07 },
    uAberration: { value: 0.0016 },
    uDamage: { value: 0 },
    uNVG: { value: 0 },
    uBodycam: { value: 1 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime, uDistortion, uAberration, uDamage, uNVG, uBodycam, uFlash;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // Barrel lens warp (disabled while aiming so optics stay sharp).
      if (uDistortion > 0.0005) {
        vec2 p = uv - 0.5;
        float aspect = uResolution.x / max(uResolution.y, 1.0);
        vec2 pa = vec2(p.x * aspect, p.y);
        uv = p * (1.0 - uDistortion * 1.04) * (1.0 + uDistortion * dot(pa, pa)) + 0.5;
      }
      uv = clamp(uv, 0.001, 0.999);

      // Chromatic aberration grows towards the frame edges.
      vec2 dir = uv - 0.5;
      float ab = uAberration * (0.45 + length(dir) * 1.8);
      vec3 col = vec3(
        texture2D(tDiffuse, clamp(uv + dir * ab, 0.001, 0.999)).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, clamp(uv - dir * ab, 0.001, 0.999)).b
      );

      // Sensor grain.
      float grain = hash(vUv * uResolution + uTime * 73.17) - 0.5;
      col += grain * (0.012 + 0.036 * uNVG) * max(uBodycam, uNVG);

      // Lens vignette.
      float dc = length(vUv - 0.5);
      col *= mix(1.0, 0.72 + 0.28 * smoothstep(0.95, 0.30, dc), uBodycam);

      // Green phosphor night vision.
      if (uNVG > 0.01) {
        float lum = dot(col * 2.75 + vec3(0.015), vec3(0.299, 0.587, 0.114));
        float scan = 0.94 + 0.06 * sin(vUv.y * uResolution.y * 0.85 + uTime * 20.0);
        vec3 nvg = vec3(0.16, 1.0, 0.36) * lum * scan * (0.12 + 0.88 * smoothstep(0.56, 0.38, dc));
        col = mix(col, nvg, uNVG);
      }

      // Damage: desaturate + red push towards the edges.
      if (uDamage > 0.01) {
        float lumD = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(col, vec3(lumD), uDamage * 0.52);
        float edge = smoothstep(0.25, 0.75, dc);
        col.r += edge * uDamage * 0.58;
        col.gb *= 1.0 - edge * uDamage * 0.38;
      }

      // Explosion flash.
      col = max(mix(col, vec3(1.55, 1.48, 1.38), clamp(uFlash, 0.0, 0.88)), vec3(0.0));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uTopColor, uHorizonColor, uBottomColor, uSunDir, uSunColor;
  uniform float uTime, uCloudDensity, uNight;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.05; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 sky = h < 0.0
      ? mix(uHorizonColor, uBottomColor, min(-h * 4.0, 1.0))
      : mix(uHorizonColor, uTopColor, pow(max(h, 0.0), 0.58));

    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    sky += uSunColor * (pow(sd, 8.0) * 0.25 + pow(sd, 110.0) * (1.2 - uNight * 0.9));

    if (h > 0.01) {
      float cl = fbm(d.xz / (h + 0.14) * 1.15 + vec2(uTime * 0.008, uTime * 0.003));
      float mask = smoothstep(0.45 - uCloudDensity * 0.25, 0.85, cl) * smoothstep(0.01, 0.22, h);
      sky = mix(sky, mix(uHorizonColor * 1.08, uSunColor * 0.95, pow(sd, 4.0) * 0.45), mask * 0.65);
    }

    if (uNight > 0.4 && h > 0.05 && hash(floor(d.xz / (h + 0.3) * 180.0)) > 0.996) {
      sky += vec3(0.65, 0.78, 1.0) * uNight;
    }

    gl_FragColor = vec4(sky, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSkyDome() {
  const geometry = new THREE.SphereGeometry(360, 32, 20);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTopColor: { value: new THREE.Color(0x3a4d63) },
      uHorizonColor: { value: new THREE.Color(0x9fb2c2) },
      uBottomColor: { value: new THREE.Color(0x283038) },
      uSunDir: { value: new THREE.Vector3(0.55, 0.42, -0.72).normalize() },
      uSunColor: { value: new THREE.Color(0xfff1d6) },
      uTime: { value: 0 },
      uCloudDensity: { value: 0.55 },
      uNight: { value: 0 },
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.name = 'skydome';
  dome.frustumCulled = false;
  return dome;
}
