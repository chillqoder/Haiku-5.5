import * as THREE from 'three';

// 64 strings wound into a twisted rope. Each one is a standing wave
// with fixed ends; the cursor strums them, and every movement re-tunes
// the whole rope (mode count, speed, colour, spin).
const STRINGS = 64;
const SEGMENTS = 180;
const LENGTH = 10;
const TWIST = 0.42;
const STRUM_RADIUS = 0.16;
const SAMPLES = [30, 60, 90, 120, 150];
const BASE_BPM = 96;

export const MOODS = {
  tuning:     { modes: 1, speed: 1.0, hue: 0.16, spin: 0.05,  radius: 2.1, amp: 0.22 },
  pieces:     { modes: 2, speed: 1.6, hue: 0.52, spin: 0.12,  radius: 2.3, amp: 0.30 },
  method:     { modes: 3, speed: 0.8, hue: 0.07, spin: -0.09, radius: 2.0, amp: 0.26 },
  rack:       { modes: 5, speed: 2.2, hue: 0.36, spin: 0.21,  radius: 2.4, amp: 0.18 },
  commission: { modes: 1, speed: 0.4, hue: 0.94, spin: 0.02,  radius: 2.8, amp: 0.34 },

  // Op. 01–03: each piece has its own tuning, reached with "Listen"
  ledger:     { modes: 4, speed: 1.3, hue: 0.60, spin: 0.16,  radius: 2.2, amp: 0.20 },
  kettle:     { modes: 2, speed: 2.6, hue: 0.03, spin: -0.20, radius: 2.5, amp: 0.40 },
  lowlight:   { modes: 6, speed: 0.5, hue: 0.78, spin: 0.04,  radius: 2.9, amp: 0.15 },
};

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOTION = reduceMotion ? 0.3 : 1;

export function createField(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const pivot = new THREE.Group();
  scene.add(pivot);

  const tmp = new THREE.Vector3();
  const strings = [];

  for (let i = 0; i < STRINGS; i++) {
    const attr = new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', attr);

    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const line = new THREE.Line(geometry, material);
    pivot.add(line);

    strings.push({
      line,
      material,
      attr,
      angle: (i / STRINGS) * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      rate: 0.6 + Math.random() * 1.4,
      clock: 0,
      energy: 0,
    });
  }

  const mood = { ...MOODS.tuning };
  const target = { ...MOODS.tuning };
  const tint = new THREE.Color();
  const parallax = { x: 0, y: 0 };
  let tempo = 1;
  let last = performance.now();

  function writeString(s) {
    const pos = s.attr.array;
    const amp = mood.amp + s.energy * 1.5;
    const wob = Math.sin(s.clock + s.phase);
    const shimmer = Math.cos(s.clock * 1.7 + s.phase * 0.5);

    for (let k = 0; k <= SEGMENTS; k++) {
      const u = k / SEGMENTS;
      const x = (u - 0.5) * LENGTH;
      const theta = s.angle + TWIST * x;
      const bend = Math.sin(Math.PI * mood.modes * u) * wob
                 + 0.35 * Math.sin(Math.PI * (mood.modes + 2) * u) * shimmer;
      const r = mood.radius + amp * bend;

      pos[k * 3] = x;
      pos[k * 3 + 1] = r * Math.cos(theta);
      pos[k * 3 + 2] = r * Math.sin(theta);
    }
    s.attr.needsUpdate = true;
  }

  // Cursor strum: nearby strings gain energy in proportion to how close
  // their projected sample points are to the pointer (in NDC).
  function strum(nx, ny, power) {
    for (const s of strings) {
      let best = Infinity;
      for (const k of SAMPLES) {
        tmp.fromBufferAttribute(s.attr, k).applyMatrix4(s.line.matrixWorld).project(camera);
        const d = Math.hypot(tmp.x - nx, tmp.y - ny);
        if (d < best) best = d;
      }
      if (best < STRUM_RADIUS) {
        s.energy = Math.min(1, s.energy + power * (1 - best / STRUM_RADIUS) * 0.9);
      }
    }
  }

  // Movement change: a short, ragged shock through the whole rope.
  function burst(amount = 0.9) {
    for (const s of strings) {
      s.energy = Math.max(s.energy, amount * (0.4 + Math.random() * 0.6));
    }
  }

  function setMood(name) {
    Object.assign(target, MOODS[name] ?? MOODS.tuning);
    burst();
  }

  // Tempo slider, 60–180 bpm. Strings glide to the new speed.
  function setTempo(bpm) {
    tempo = bpm / BASE_BPM;
  }

  function setParallax(nx, ny) {
    parallax.x = nx;
    parallax.y = ny;
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the whole rope inside the frame, portrait or landscape.
    const halfWidth = 6.4;
    const fit = halfWidth / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    camera.position.set(0, 0, Math.max(12, fit));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000) * MOTION;
    last = now;

    for (const key in mood) {
      mood[key] += (target[key] - mood[key]) * 0.035;
    }
    tint.setHSL(mood.hue, 0.9, 0.62);

    pivot.rotation.x += dt * mood.spin;
    pivot.rotation.y += (parallax.x * 0.35 - pivot.rotation.y) * 0.04;
    pivot.rotation.z += (parallax.y * 0.18 - pivot.rotation.z) * 0.04;
    scene.updateMatrixWorld();

    for (const s of strings) {
      s.energy *= 0.965;
      s.clock += dt * mood.speed * tempo * s.rate;
      writeString(s);
      s.material.color.lerp(tint, 0.08);
      s.material.opacity = 0.22 + s.energy * 0.75;
    }

    scene.updateMatrixWorld();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);

  return { setMood, strum, burst, setParallax, setTempo };
}
