// Home hero: the bunsoootchi vs slime scene, drawn live with three.js.
// Front view only (the Nomad camera angle). Shots zoom and slide, and cut like a battle scene.
// Every frame is clamped so the land always runs past both edges (no blank sides).
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {HorizontalBlurShader} from 'three/addons/shaders/HorizontalBlurShader.js';
import {VerticalBlurShader} from 'three/addons/shaders/VerticalBlurShader.js';

const BASE = new URL('./', import.meta.url).href;
const EDGE = 3.8;                 // the island runs from -3.87 to 3.87; stay inside it
const TILT = THREE.MathUtils.degToRad(5.5), CAM_Z = 16.15;
const SKY = 'rgb(51,155,202)';
// x, y = frame center; h = frame height; minW = narrowest width that still shows the subject (for phones);
// dx, dy, dh = slow slide and zoom over the shot; yaw = slow camera turn around the subject, in degrees (from, to).
// One continuous shot, no cuts (cuts made people dizzy). The camera slowly swings back and forth around the fighters.
const SHOTS = [
  {x: 0.25, y: -0.5, h: 3.0, minW: 3.4, dx: 0, dy: 0, dh: 0, t: Infinity, sway: 10, period: 40, wideH: 3.0, phoneX: -0.14},   // up to 10 degrees each way, 40 s per full swing
];
const ease = t => t < .5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;

export async function startHero(box, {offsetForCard = () => 0, raise = () => 0} = {}) {
  const r = new THREE.WebGLRenderer({antialias: true, alpha: false, powerPreference: 'high-performance'});
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 0.8147;   // Nomad: Neutral, exposure 0.8147
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  box.appendChild(r.domElement);

  const scene = new THREE.Scene(); const sky = new THREE.Color(SKY); scene.background = sky;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  cam.rotation.set(-TILT, THREE.MathUtils.degToRad(-0.27), 0, 'YXZ');

  const sun = new THREE.DirectionalLight(new THREE.Color().setRGB(0.95, 0.85, 0.63, THREE.LinearSRGBColorSpace), 2);
  sun.position.set(0, 10, 0); sun.castShadow = true;
  Object.assign(sun.shadow.camera, {left: -6, right: 6, top: 6, bottom: -6, near: 0.1, far: 30});
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/');
  const [hdr, gltf] = await Promise.all([
    new RGBELoader().loadAsync(BASE + 'wooden_lounge_512.hdr'),
    new GLTFLoader().setDRACOLoader(draco).loadAsync(BASE + 'scene.glb')]);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(r);
  scene.environment = pm.fromEquirectangular(hdr).texture; hdr.dispose(); pm.dispose();
  scene.environmentIntensity = 3;                                      // raised from Nomad's 0.6304: three.js has no SSGI bounce light
  scene.environmentRotation.y = THREE.MathUtils.degToRad(89.09);      // Nomad environment rotation

  const box3 = new THREE.Box3();
  gltf.scene.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    if (o.material && o.material.name === 'Material_27') {             // helmet: thin clear glass, keeps the face sharp
      o.material = new THREE.MeshPhysicalMaterial({color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.02,
        metalness: 0, clearcoat: 1, clearcoatRoughness: 0, ior: 1.45, specularIntensity: 1, envMapIntensity: 0.4, depthWrite: false});   // weaker room reflection
      o.castShadow = false; o.renderOrder = 10;
      // shine: a copy that only adds reflections on top (black base + additive = highlights only)
      const shine = new THREE.Mesh(o.geometry, new THREE.MeshPhysicalMaterial({color: 0x000000, roughness: 0.15, metalness: 0,
        clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 0.15, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false}));
      shine.renderOrder = 11; o.add(shine);
    }
    if (o.material && (o.material.name === 'Material_30' || o.material.name === 'Material_31')) {   // slime's eye: keep the shine, hide the room
      o.material = o.material.clone(); o.material.envMapIntensity = 0.4; o.material.roughness = Math.max(o.material.roughness, 0.15);
    }
    box3.setFromObject(o); if (box3.max.z < -2) o.layers.set(1);       // mountains and clouds: drawn blurred (depth of field)
  });
  scene.add(gltf.scene);

  // idle battle animation: bunsoootchi breathes (pivot at the feet), the slime floats and wobbles (pivot at its center)
  const named = (...names) => names.map(n => gltf.scene.getObjectByName(n)).filter(Boolean);
  const pivotFor = (parts) => {
    if (!parts.length) return null;
    const bb = new THREE.Box3(); parts.forEach(p => bb.expandByObject(p));
    return {parts, bb};
  };
  const makePivot = (info, atFeet) => {
    if (!info) return null;
    const c = info.bb.getCenter(new THREE.Vector3());
    const g = new THREE.Group(); g.position.set(c.x, atFeet ? info.bb.min.y : c.y, c.z);
    gltf.scene.add(g); g.updateMatrixWorld(true);
    info.parts.forEach(p => g.attach(p));
    return g;
  };
  const buns = makePivot(pivotFor(named('Tussy', 'Ear.001', 'Ear001', 'Eye.001', 'Eye001', 'Shine.001', 'Shine001')), true);
  const slime = makePivot(pivotFor(named('Monster')), false);
  // bring the slime and the first apple tree closer to bunsoootchi (so part of the tree shows on desktop)
  const SLIME_SHIFT = -0.3, TREE_SHIFT = -0.35, TREE_BACK = 0.45;   // tree sits close to the slime but slightly behind it, so the slime always stays in front
  if (slime) slime.position.x += SLIME_SHIFT;
  const tree = named('Tree')[0]; if (tree) { tree.position.x += TREE_SHIFT; tree.position.z -= TREE_BACK; }
  const slimeY = slime ? slime.position.y : 0;
  const tufts = ['UV Sphere 40','UV Sphere 41','UV Sphere 42','UV Sphere 43','UV Sphere 44','UV Sphere.003']
    .map(n => named(n, n.replace(/ /g, '_'), n.replace(/[ .]/g, '_'), n.replace(/ /g, '_').replace('.', ''))[0]).filter(Boolean)
    .map(o => makePivot(pivotFor([o]), true));
  box.dataset.anim = (buns ? 'breathing' : 'no-breath') + ' ' + (slime ? 'floating' : 'no-float') + ' grass ' + tufts.length;
  const bunsX = buns ? buns.position.x : 0, slimeX = slime ? slime.position.x : 0;
  // interaction state (set by the pointer code further down)
  const act = {jab: -9, squish: -9, look: 0, flee: new THREE.Vector2(), fleeNow: new THREE.Vector2(), lookNow: 0};
  const pulse = (t, start, len) => { const u = (t - start) / len; return u < 0 || u > 1 ? 0 : Math.sin(u * Math.PI); };
  const animate = (t) => {
    act.lookNow += (act.look - act.lookNow) * 0.08;
    act.fleeNow.lerp(act.flee, 0.1);
    if (buns) {                                   // slow breath, about 3.2 seconds per breath
      const b = Math.sin(t * Math.PI * 2 / 3.2);
      const j = pulse(t, act.jab, 0.35);          // click: quick spear jab toward the slime
      buns.scale.set(1 - 0.006 * b, 1 + 0.014 * b, 1 - 0.006 * b);
      buns.position.x = bunsX + 0.22 * j;
      buns.rotation.z = -0.12 * j;
      buns.rotation.y = act.lookNow;               // hover: turns toward the cursor
    }
    if (slime) {                                  // floating jelly: bob, squash and stretch, small tilt
      const f = Math.sin(t * Math.PI * 2 / 1.8), w = Math.sin(t * Math.PI * 2 / 0.9 + 0.6);
      const q = pulse(t, act.squish, 0.6), qb = Math.sin(Math.max(0, Math.min(1, (t - act.squish) / 0.6)) * Math.PI * 3) * q;   // click: squish and bounce
      slime.position.x = slimeX + act.fleeNow.x;
      slime.position.y = slimeY + 0.06 * f + 0.25 * q + act.fleeNow.y;
      slime.scale.set(1 + 0.035 * w + 0.18 * qb, 1 - 0.04 * w - 0.2 * qb, 1 + 0.035 * w + 0.18 * qb);
      slime.rotation.z = 0.05 * Math.sin(t * Math.PI * 2 / 2.6) - act.fleeNow.x * 0.6;
    }
    tufts.forEach((g, i) => { g.rotation.z = 0.045 * Math.sin(t * Math.PI * 2 / 2.4 + i * 1.3); });   // grass: subtle sway
  };

  // depth of field: draw the far layer, blur it, use it as the background
  const rtA = new THREE.WebGLRenderTarget(1, 1, {type: THREE.HalfFloatType}), rtB = rtA.clone();
  const hb = new THREE.ShaderMaterial(HorizontalBlurShader), vb = new THREE.ShaderMaterial(VerticalBlurShader);
  const qh = new FullScreenQuad(hb), qv = new FullScreenQuad(vb);

  let W = 1, H = 1;
  const resize = () => {
    W = box.clientWidth || 1; H = box.clientHeight || 1;
    r.setSize(W, H, false); r.domElement.style.width = '100%'; r.domElement.style.height = '100%';
    const pr = r.getPixelRatio(), bw = Math.round(W * pr / 2), bh = Math.round(H * pr / 2);
    rtA.setSize(bw, bh); rtB.setSize(bw, bh);
    hb.uniforms.h.value = 2.4 / bw; vb.uniforms.v.value = 2.4 / bh;   // background blur strength
  };
  resize(); new ResizeObserver(resize).observe(box);

  const view = (s, p) => {
    const a = W / H, k = ease(p);
    let h = s.h + s.dh * k;
    h = Math.max(h, s.minW / a);                 // phones: zoom out enough to keep the subject
    if (s.wideH && offsetForCard(W)) h = s.wideH;   // desktop: a bit closer, so the fighters can sit right of the card
    h = Math.min(h, (2 * EDGE) / a);             // never wider than the island
    const half = h * a / 2;
    const cx = offsetForCard(W) ? s.x : (s.phoneX ?? s.x);   // phones and tablets: center on the midpoint between the two fighters
    let x = cx + s.dx * k - offsetForCard(W) * h * a;   // wide screens: push the subject right of the card
    x = Math.max(-EDGE + half, Math.min(EDGE - half, x));
    const y = s.y + s.dy * k - raise(W, H) * h;            // phones: lift the fighters above the card
    const yaw = s.sway ? s.sway * Math.sin(clock * Math.PI * 2 / s.period) : s.yaw ? s.yaw[0] + (s.yaw[1] - s.yaw[0]) * k : 0;
    return {h, x, y, yaw};
  };
  const lean = {x: 0, y: 0, nx: 0, ny: 0};          // mouse or phone tilt, -1..1
  const frame = (s, p, out) => {
    const a = W / H, v = view(s, p), w = view(SHOTS[0], 0.5);
    const o = ease(Math.min(1, Math.max(0, out)));  // scroll: ease out to the wide shot as the hero leaves
    let h = v.h + (w.h - v.h) * o, x = v.x + (w.x - v.x) * o, y = v.y + (w.y - v.y) * o;
    const yaw = THREE.MathUtils.degToRad(v.yaw + (w.yaw - v.yaw) * o + lean.nx * 4);   // lean: up to 4 degrees
    const half = h * a / 2;
    x = Math.max(-EDGE + half, Math.min(EDGE - half, x + lean.nx * 0.04 * h));
    y += -lean.ny * 0.03 * h;
    cam.left = -half; cam.right = half; cam.top = h / 2; cam.bottom = -h / 2; cam.updateProjectionMatrix();
    cam.position.set(x + CAM_Z * Math.sin(yaw), y + CAM_Z * Math.tan(TILT), CAM_Z * Math.cos(yaw));
    cam.rotation.set(-TILT, yaw + THREE.MathUtils.degToRad(-0.27), 0, 'YXZ');
  };

  const draw = () => {
    r.toneMapping = THREE.NoToneMapping;
    cam.layers.set(1); scene.background = sky; r.setRenderTarget(rtA); r.render(scene, cam);
    for (let i = 0; i < 3; i++) {
      hb.uniforms.tDiffuse.value = rtA.texture; r.setRenderTarget(rtB); qh.render(r);
      vb.uniforms.tDiffuse.value = rtB.texture; r.setRenderTarget(rtA); qv.render(r);
    }
    r.setRenderTarget(null); r.toneMapping = THREE.NeutralToneMapping;
    scene.background = rtA.texture; cam.layers.set(0); r.render(scene, cam); scene.background = sky;
  };

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), tmp = new THREE.Vector3();
  const hit = (cx, cy) => {
    const rc = r.domElement.getBoundingClientRect();
    ptr.set((cx - rc.left) / rc.width * 2 - 1, -((cy - rc.top) / rc.height) * 2 + 1);
    ray.setFromCamera(ptr, cam); ray.layers.set(0);
    const h = ray.intersectObjects([buns, slime].filter(Boolean), true)[0];
    if (!h) return null;
    let o = h.object; while (o && o !== buns && o !== slime) o = o.parent;
    return o === buns ? 'buns' : o === slime ? 'slime' : null;
  };
  const toScreen = (g) => { g.getWorldPosition(tmp); tmp.project(cam); return tmp; };
  const hero = box.parentElement;
  hero.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') {
      lean.x = (e.clientX / innerWidth) * 2 - 1; lean.y = (e.clientY / innerHeight) * 2 - 1;
    }
    const who = hit(e.clientX, e.clientY);
    hero.style.cursor = who && !e.target.closest('a') ? 'pointer' : '';
    if (buns) {                                     // bunsoootchi turns a little toward the cursor
      const bx = toScreen(buns).x; act.look = Math.max(-0.35, Math.min(0.35, (ptr.x - bx) * 0.6));
    }
    if (slime) {                                    // the slime backs away when the cursor gets close
      const sp = toScreen(slime), dx = ptr.x - sp.x, dy = ptr.y - sp.y, d = Math.hypot(dx, dy);
      const k = d < 0.35 ? (0.35 - d) / 0.35 : 0;
      act.flee.set(Math.min(0, -Math.sign(dx || 1) * 0.18 * k), -Math.sign(dy || 1) * 0.1 * k);   // only backs away to the left, never into the tree
    }
  });
  hero.addEventListener('pointerleave', () => { act.look = 0; act.flee.set(0, 0); lean.x = lean.y = 0; });
  hero.addEventListener('click', e => {
    if (e.target.closest('a')) return;
    const who = hit(e.clientX, e.clientY), t = performance.now() / 1000;
    if (who === 'buns') act.jab = t; else if (who === 'slime') act.squish = t;
    askTilt();
  });
  // phones: tilting the phone leans the view (iPhones ask for permission on the first tap)
  const onTilt = e => { if (e.gamma == null) return; lean.x = Math.max(-1, Math.min(1, e.gamma / 25)); lean.y = Math.max(-1, Math.min(1, ((e.beta || 45) - 45) / 25)); };
  let tiltAsked = false;
  function askTilt() {
    if (tiltAsked || !window.DeviceOrientationEvent) return; tiltAsked = true;
    if (typeof DeviceOrientationEvent.requestPermission === 'function')
      DeviceOrientationEvent.requestPermission().then(s => { if (s === 'granted') addEventListener('deviceorientation', onTilt); }).catch(() => {});
  }
  if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') addEventListener('deviceorientation', onTilt);
  const scrollOut = () => Math.min(1, Math.max(0, scrollY / (box.clientHeight * 0.6)));
  let shot = 0, start = performance.now(), visible = true, running = false, clock = 0;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) loop(); }).observe(box);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { start = performance.now() - 1; loop(); } });
  function tick(now) {
    running = false;
    if (!visible || document.hidden) return;
    let p = (now - start) / 1000 / SHOTS[shot].t;
    if (still) p = 0.5;
    else if (p >= 1) { shot = (shot + 1) % SHOTS.length; start = now; p = 0; }   // hard cut to the next angle
    if (!still) { animate(now / 1000); clock = now / 1000; }
    lean.nx += (lean.x - lean.nx) * 0.05; lean.ny += (lean.y - lean.ny) * 0.05;
    frame(SHOTS[shot], p, still ? 0 : scrollOut()); draw();
    if (!still) loop();
  }
  function loop() { if (!running) { running = true; requestAnimationFrame(tick); } }
  frame(SHOTS[0], 0, 0); draw(); box.classList.add('ready'); loop();
}
