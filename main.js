window.addEventListener('error', e => {
  console.error('[Global error]', e.message, e.error);
});
window.addEventListener('unhandledrejection', e => {
  console.error('[Unhandled promise rejection]', e.reason);
});
console.log('[main] script start');

/* ========== Imports (CDN) ========== */
import * as THREE from "https://unpkg.com/three@0.180.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.180.0/examples/jsm/controls/OrbitControls.js";
import { RGBELoader } from "https://unpkg.com/three@0.180.0/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer } from "https://unpkg.com/three@0.180.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://unpkg.com/three@0.180.0/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "https://unpkg.com/three@0.180.0/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SSAOPass } from "https://unpkg.com/three@0.180.0/examples/jsm/postprocessing/SSAOPass.js";
import { SMAAPass } from "https://unpkg.com/three@0.180.0/examples/jsm/postprocessing/SMAAPass.js";
import WindowManager from "./WindowManager.js";

/* ========== Config & globals ========== */
const DPR = Math.min(window.devicePixelRatio || 1, 2);
let renderer, scene, camera, controls, world;
let composer = null;
let windowManager = null;
let objects = [];
let sceneOffset = { x: 0, y: 0 }, sceneOffsetTarget = { x: 0, y: 0 };
let initialized = false;

/* small helpers */
const lerp = (a,b,t) => a + (b - a) * t;
function nowSeconds() {
  const d = new Date(); d.setHours(0,0,0,0); return (Date.now() - d.getTime()) / 1000;
}

/* ========== Bootstrapping - ensure document.body exists ========== */
function safeAppendCanvas(domElement) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(domElement));
  } else {
    document.body.appendChild(domElement);
  }
}

/* ========== Init (public) ========== */
init();

async function init() {
  if (initialized) return;
  initialized = true;
  console.log('[main] init');

  try {
    setupRenderer();
    setupSceneAndCamera();
    setupLightsAndGround();
  } catch (e) {
    console.error('[main] fatal during setup:', e);
    // If we can't even create the renderer/camera, bail early
    return;
  }

  // Try to load HDRI environment (non-blocking fallback)
  try {
    await tryLoadHDRI('/assets/hdr/studio_small_01_1k.hdr');
    console.log('[main] HDR load attempt finished');
  } catch (e) {
    console.warn('[main] HDR load failed (continuing with fallback):', e);
  }

  // WindowManager (guarded)
  try {
    windowManager = new WindowManager();
    windowManager.setWinShapeChangeCallback(onWindowShapeChange);
    windowManager.setWinChangeCallback(onWindowsChanged);
    windowManager.init({ realistic: true });
  } catch (e) {
    console.warn('[main] WindowManager failed, falling back to single-window mode:', e);
    windowManager = {
      getWindows: () => [{ id: 1, shape: { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight } }],
      update: () => {},
      setWinShapeChangeCallback: () => {},
      setWinChangeCallback: () => {},
    };
  }

  // Postprocessing - create but tolerate failures
  try {
    setupPostProcessing();
  } catch (e) {
    console.warn('[main] postprocessing setup failed (fallback to raw renderer):', e);
    composer = null;
  }

  // create our objects for windows
  onWindowsChanged();

  // final sizing + listeners
  onResize();
  window.addEventListener('resize', onResize);

  // start loop
  requestAnimationFrame(loop);
}

/* ========== Renderer, scene, camera ========== */
function setupRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(DPR);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.id = 'three-canvas';
  safeAppendCanvas(renderer.domElement);
  console.log('[main] renderer created');
}

function setupSceneAndCamera() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0d);

  const w = window.innerWidth, h = window.innerHeight;
  camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
  camera.position.set(0, 2, 6);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.49;

  world = new THREE.Object3D();
  scene.add(world);

  console.log('[main] scene & camera set up');
}

/* ========== Lighting & ground ========== */
function setupLightsAndGround() {
  // key light
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(6, 8, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 6;
  key.shadow.camera.left = -10; key.shadow.camera.right = 10;
  key.shadow.camera.top = 10; key.shadow.camera.bottom = -10;
  scene.add(key);

  // fill
  const hemi = new THREE.HemisphereLight(0xbfbfbf, 0x222222, 0.6);
  scene.add(hemi);

  // rim
  const rim = new THREE.DirectionalLight(0xffffff, 0.25);
  rim.position.set(-6, 6, -4);
  scene.add(rim);

  // ground
  const groundMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f0f10, metalness: 0.0, roughness: 0.6, reflectivity: 0.2
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), groundMat);
  ground.rotation.x = -Math.PI/2;
  ground.position.y = -1.05;
  ground.receiveShadow = true;
  scene.add(ground);

  console.log('[main] lights and ground created');
}

/* ========== HDRI load (non-fatal) ========== */
async function tryLoadHDRI(hdrPath) {
  if (!RGBELoader) {
    console.warn('[main] RGBELoader not available');
    return;
  }
  console.log('[main] attempting HDRI load:', hdrPath);
  const pmremGen = new THREE.PMREMGenerator(renderer);
  pmremGen.compileEquirectangularShader();

  return new Promise((resolve, reject) => {
    const loader = new RGBELoader();
    loader.setDataType(THREE.UnsignedByteType);

    loader.load(hdrPath, (tex) => {
      try {
        const env = pmremGen.fromEquirectangular(tex).texture;
        scene.environment = env;
        // do not set background to env by default (can be heavy)
        tex.dispose();
        pmremGen.dispose();
        console.log('[main] HDRI applied to scene.environment');
        resolve(true);
      } catch (err) {
        console.warn('[main] HDR processing failed:', err);
        try { tex.dispose(); } catch(e){}
        try { pmremGen.dispose(); } catch(e){}
        reject(err);
      }
    }, undefined, err => {
      console.warn('[main] HDRI load failed (network or path):', err);
      try { pmremGen.dispose(); } catch(e){}
      reject(err);
    });
  });
}

/* ========== Postprocessing (try/catch tolerant) ========== */
function setupPostProcessing() {
  composer = new EffectComposer(renderer);
  composer.setSize(window.innerWidth, window.innerHeight);

  const rp = new RenderPass(scene, camera);
  composer.addPass(rp);

  // SSAO (if available)
  try {
    const ssao = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ssao.kernelRadius = 16;
    ssao.minDistance = 0.001;
    ssao.maxDistance = 0.1;
    composer.addPass(ssao);
    console.log('[main] SSAO pass added');
  } catch (e) {
    console.warn('[main] SSAOPass failed to initialize:', e);
  }

  // Bloom
  try {
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.5, 0.85);
    bloom.threshold = 0.9; bloom.strength = 0.2;
    composer.addPass(bloom);
    console.log('[main] Bloom pass added');
  } catch (e) {
    console.warn('[main] UnrealBloomPass failed:', e);
  }

  // SMAA antialiasing (optional)
  try {
    const smaa = new SMAAPass(window.innerWidth * DPR, window.innerHeight * DPR);
    composer.addPass(smaa);
    console.log('[main] SMAA pass added');
  } catch (e) {
    console.warn('[main] SMAAPass failed or not supported:', e);
  }
}

/* ========== Windows -> scene objects mapping ========== */
function onWindowsChanged() {
  console.log('[main] windows changed: rebuilding objects');
  // clear
  objects.forEach(o => {
    try { world.remove(o.group); } catch(e){}
  });
  objects = [];

  const wins = (windowManager && windowManager.getWindows) ? (windowManager.getWindows() || []) : [{ id:1, shape: { x:0,y:0,w:window.innerWidth,h:window.innerHeight}}];

  // create a modern object per-window
  wins.forEach((win, idx) => {
    const scale = 0.8 + idx * 0.12;
    const group = new THREE.Object3D();

    // main body
    const geom = new THREE.BoxGeometry(scale, scale * 0.7, scale * 0.6, 8,8,8);
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL((idx*0.08) % 1, 0.6, 0.5),
      metalness: 0.05, roughness: 0.45, clearcoat: 0.07
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.castShadow = true;
    mesh.position.y = 0;
    group.add(mesh);

    // base / pedestal
    const base = new THREE.Mesh(new THREE.CylinderGeometry(scale*0.45, scale*0.5, 0.12, 28),
      new THREE.MeshPhysicalMaterial({ color:0x0b0b0d, roughness:0.6 }));
    base.position.y = - (scale*0.35) - 0.06;
    base.receiveShadow = true;
    group.add(base);

    // contact shadow plane
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(scale * 1.6, scale * 1.0),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
    shadow.rotation.x = -Math.PI/2;
    shadow.position.y = - (scale*0.7) - 0.02;
    group.add(shadow);

    // initial layout - we space them across X axis (visual layout independent of window positions)
    group.position.set((idx - wins.length/2) * 1.6, 0, 0);

    world.add(group);
    objects.push({ id: win.id, group, shadow });
  });

  console.log('[main] created', objects.length, 'objects');
}

/* ========== Window shape -> scene offset (parallax) ========== */
function onWindowShapeChange() {
  const sx = (typeof window.screenX === 'number') ? window.screenX : window.screenLeft;
  const sy = (typeof window.screenY === 'number') ? window.screenY : window.screenTop;
  // very small parallax factor so subtle motion if windows move
  sceneOffsetTarget.x = -sx * 0.01;
  sceneOffsetTarget.y = -sy * 0.01;
}

/* ========== Main loop ========== */
function loop() {
  try {
    requestAnimationFrame(loop);

    if (windowManager && typeof windowManager.update === 'function') {
      try { windowManager.update(); } catch (e) { /* swallow */ }
    }

    // lerp world offset
    sceneOffset.x = lerp(sceneOffset.x, sceneOffsetTarget.x, 0.06);
    sceneOffset.y = lerp(sceneOffset.y, sceneOffsetTarget.y, 0.06);
    world.position.x = sceneOffset.x;
    world.position.y = sceneOffset.y;

    // animate slightly
    const t = nowSeconds();
    objects.forEach((o, i) => {
      o.group.rotation.y = Math.sin(t * 0.35 + i) * 0.06;
      o.group.position.y += Math.sin(t * 0.6 + i) * 0.0008;
    });

    controls.update();

    // prefer composer if available, otherwise raw render
    if (composer && typeof composer.render === 'function') {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  } catch (e) {
    console.error('[main] runtime loop error (continuing):', e);
  }
}

/* ========== Resize handling ========== */
function onResize() {
  try {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (composer && typeof composer.setSize === 'function') composer.setSize(w, h);
  } catch (e) {
    console.warn('[main] onResize error:', e);
  }
}
