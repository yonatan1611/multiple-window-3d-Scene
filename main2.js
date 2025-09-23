import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.module.js';
import WindowManager from './WindowManager.js';

// Now THREE is properly imported, so we can use it
const t = THREE;
let camera, scene, renderer, world;
let near, far;
let pixR = window.devicePixelRatio ? window.devicePixelRatio : 1;
let nebulaBalls = [];
let sceneOffsetTarget = {x: 0, y: 0};
let sceneOffset = {x: 0, y: 0};

let today = new Date();
today.setHours(0);
today.setMinutes(0);
today.setSeconds(0);
today.setMilliseconds(0);
today = today.getTime();

let internalTime = getTime();
let windowManager;
let initialized = false;

// Particle system variables
let particleSystems = [];

// get time in seconds since beginning of the day
function getTime() {
    return (new Date().getTime() - today) / 1000.0;
}

if (new URLSearchParams(window.location.search).get("clear")) {
    localStorage.clear();
} else {    
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState != 'hidden' && !initialized) {
            init();
        }
    });

    window.onload = () => {
        if (document.visibilityState != 'hidden') {
            init();
        }
    };

    function init() {
        initialized = true;

        setTimeout(() => {
            setupScene();
            setupWindowManager();
            resize();
            updateWindowShape(false);
            render();
            window.addEventListener('resize', resize);
        }, 500);
    }

    function setupScene() {
        camera = new t.OrthographicCamera(0, 0, window.innerWidth, window.innerHeight, -10000, 10000);
        camera.position.z = 2.5;
        near = camera.position.z - .5;
        far = camera.position.z + 0.5;

        scene = new t.Scene();
        scene.background = new t.Color(0x0a0a1a); // Deep space blue
        scene.add(camera);

        renderer = new t.WebGLRenderer({ 
            antialias: true, 
            depthBuffer: true,
            alpha: true
        });
        renderer.setPixelRatio(pixR);
        
        // Enable transparency for glow effects
        renderer.setClearColor(0x000000, 0);
        
        world = new t.Object3D();
        scene.add(world);

        renderer.domElement.setAttribute("id", "scene");
        document.body.appendChild(renderer.domElement);
        
        // Add some ambient light for the nebula effect
        const ambientLight = new t.AmbientLight(0x404040, 0.6);
        scene.add(ambientLight);
    }

    function setupWindowManager() {
        windowManager = new WindowManager();
        windowManager.setWinShapeChangeCallback(updateWindowShape);
        windowManager.setWinChangeCallback(windowsUpdated);

        let metaData = {type: "nebula"};
        windowManager.init(metaData);
        windowsUpdated();
    }

    function windowsUpdated() {
        updateNebulaBalls();
    }

    function createNebulaBall(win, index) {
        // Create the main nebula sphere
        const radius = 80 + index * 20;
        
        // Create a glowing sphere with gradient colors
        const geometry = new t.SphereGeometry(radius, 32, 32);
        
        // Create a custom shader material for nebula effect
        const nebulaMaterial = new t.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color1: { value: new t.Color().setHSL(index * 0.15, 0.8, 0.6) },
                color2: { value: new t.Color().setHSL(index * 0.15 + 0.3, 0.9, 0.4) },
                glowIntensity: { value: 1.5 }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vNormal;
                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color1;
                uniform vec3 color2;
                uniform float glowIntensity;
                varying vec2 vUv;
                varying vec3 vNormal;
                
                void main() {
                    float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
                    float pulse = sin(time * 2.0) * 0.1 + 0.9;
                    vec3 color = mix(color1, color2, vUv.y);
                    gl_FragColor = vec4(color * intensity * glowIntensity * pulse, intensity * 0.8);
                }
            `,
            transparent: true,
            side: t.DoubleSide
        });

        const nebulaBall = new t.Mesh(geometry, nebulaMaterial);
        
        // Position at window center
        nebulaBall.position.x = win.shape.x + (win.shape.w * 0.5);
        nebulaBall.position.y = win.shape.y + (win.shape.h * 0.5);
        nebulaBall.userData.originalRadius = radius;
        nebulaBall.userData.pulseSpeed = 0.5 + Math.random() * 1.0;

        // Create particle system around the nebula
        createParticleSystem(nebulaBall, index);

        return nebulaBall;
    }

    function createParticleSystem(nebulaBall, index) {
        const particleCount = 200;
        const geometry = new t.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        
        const radius = nebulaBall.userData.originalRadius;
        const color = new t.Color().setHSL(index * 0.15, 0.8, 0.7);

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            
            // Spherical distribution around the nebula
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const r = radius * (1.2 + Math.random() * 0.8);
            
            positions[i3] = Math.sin(phi) * Math.cos(theta) * r;
            positions[i3 + 1] = Math.sin(phi) * Math.sin(theta) * r;
            positions[i3 + 2] = Math.cos(phi) * r;
            
            colors[i3] = color.r;
            colors[i3 + 1] = color.g;
            colors[i3 + 2] = color.b;
        }

        geometry.setAttribute('position', new t.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new t.BufferAttribute(colors, 3));

        const material = new t.PointsMaterial({
            size: 4,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: t.AdditiveBlending
        });

        const particleSystem = new t.Points(geometry, material);
        particleSystem.userData.originalRadius = radius;
        nebulaBall.add(particleSystem);
        
        particleSystems.push(particleSystem);
    }

    function updateNebulaBalls() {
        let wins = windowManager.getWindows();

        // Remove all existing nebula balls
        nebulaBalls.forEach((ball) => {
            world.remove(ball);
        });
        nebulaBalls = [];
        particleSystems = [];

        // Create new nebula balls based on current windows
        for (let i = 0; i < wins.length; i++) {
            let win = wins[i];
            let nebulaBall = createNebulaBall(win, i);
            world.add(nebulaBall);
            nebulaBalls.push(nebulaBall);
        }
    }

    function updateWindowShape(easing = true) {
        sceneOffsetTarget = {x: -window.screenX, y: -window.screenY};
        if (!easing) sceneOffset = sceneOffsetTarget;
    }

    function render() {
        let currentTime = getTime();

        windowManager.update();

        // Smooth scene offset transition
        let falloff = 0.05;
        sceneOffset.x = sceneOffset.x + ((sceneOffsetTarget.x - sceneOffset.x) * falloff);
        sceneOffset.y = sceneOffset.y + ((sceneOffsetTarget.y - sceneOffset.y) * falloff);

        world.position.x = sceneOffset.x;
        world.position.y = sceneOffset.y;

        let wins = windowManager.getWindows();

        // Update nebula balls and particle systems
        for (let i = 0; i < nebulaBalls.length; i++) {
            let nebulaBall = nebulaBalls[i];
            let win = wins[i];
            let _t = currentTime * nebulaBall.userData.pulseSpeed;

            // Update position with smooth transition
            let posTarget = {
                x: win.shape.x + (win.shape.w * 0.5),
                y: win.shape.y + (win.shape.h * 0.5)
            };

            nebulaBall.position.x = nebulaBall.position.x + (posTarget.x - nebulaBall.position.x) * falloff;
            nebulaBall.position.y = nebulaBall.position.y + (posTarget.y - nebulaBall.position.y) * falloff;

            // Pulsating animation
            const scale = 1 + Math.sin(_t) * 0.1;
            nebulaBall.scale.set(scale, scale, scale);

            // Rotate slowly
            nebulaBall.rotation.x = _t * 0.2;
            nebulaBall.rotation.y = _t * 0.3;

            // Update shader uniforms
            if (nebulaBall.material.uniforms) {
                nebulaBall.material.uniforms.time.value = _t;
            }

            // Update particle systems (rotate around nebula)
            if (nebulaBall.children.length > 0) {
                const particles = nebulaBall.children[0];
                particles.rotation.y = _t * 0.1;
                particles.rotation.x = _t * 0.05;
            }
        }

        renderer.render(scene, camera);
        requestAnimationFrame(render);
    }

    function resize() {
        let width = window.innerWidth;
        let height = window.innerHeight;
        
        camera = new t.OrthographicCamera(0, width, 0, height, -10000, 10000);
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
}