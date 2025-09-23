import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.module.js';
import WindowManager from './WindowManager.js';

// Use THREE directly instead of 't' to avoid conflicts
let camera, scene, renderer, world;
let nebulaBalls = [];
let sceneOffsetTarget = {x: 0, y: 0};
let sceneOffset = {x: 0, y: 0};

// Advanced effects variables
let particleSystems = [];
let connectionLines = [];
let audioContext, analyser, audioSource;
let gravityPoints = [];
let mousePosition = { x: 0, y: 0 };
let timeUniform = { value: 0 };

// Shader includes for advanced effects (same as before)
const noiseShader = `
// Simplex 3D Noise by Ian McEwan, Ashima Arts
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    
    i = mod289(i);
    vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

let today = new Date();
today.setHours(0);
today.setMinutes(0);
today.setSeconds(0);
today.setMilliseconds(0);
today = today.getTime();

let windowManager;
let initialized = false;

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
            setupAudio();
            setupScene();
            setupWindowManager();
            resize();
            updateWindowShape(false);
            render();
            window.addEventListener('resize', resize);
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('click', onMouseClick);
        }, 500);
    }

    function setupAudio() {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
        } catch (e) {
            console.log('Audio not supported:', e);
        }
    }

    function setupScene() {
        camera = new THREE.OrthographicCamera(0, 0, window.innerWidth, window.innerHeight, -10000, 10000);
        camera.position.z = 2.5;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0a0a1a);
        scene.add(camera);

        renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            depthBuffer: true,
            alpha: true
        });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setClearColor(0x000000, 0);
        
        world = new THREE.Object3D();
        scene.add(world);

        renderer.domElement.setAttribute("id", "scene");
        document.body.appendChild(renderer.domElement);
        
        // Enhanced lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(1, 1, 1);
        scene.add(directionalLight);
    }

    function setupWindowManager() {
        windowManager = new WindowManager();
        windowManager.setWinShapeChangeCallback(updateWindowShape);
        windowManager.setWinChangeCallback(windowsUpdated);

        let metaData = {type: "nebula", creationTime: Date.now()};
        windowManager.init(metaData);
        windowsUpdated();
    }

    function windowsUpdated() {
        updateNebulaBalls();
        createConnections();
    }

    function createAdvancedNebulaBall(win, index) {
        const radius = 60 + index * 15;
        const geometry = new THREE.SphereGeometry(radius, 64, 64);
        
        const nebulaMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: timeUniform,
                color1: { value: new THREE.Color().setHSL(index * 0.15, 0.9, 0.7) },
                color2: { value: new THREE.Color().setHSL(index * 0.15 + 0.4, 0.8, 0.5) },
                glowIntensity: { value: 2.0 },
                audioData: { value: 0.0 },
                mousePosition: { value: new THREE.Vector2() }
            },
            vertexShader: `
                ${noiseShader}
                uniform float time;
                uniform float audioData;
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vPosition;
                
                void main() {
                    vUv = uv;
                    vNormal = normalize(normalMatrix * normal);
                    vPosition = position;
                    
                    // Animate vertices with noise and audio
                    float noise = snoise(vec3(position * 0.1 + time));
                    float pulse = sin(time * 2.0) * 0.5 + 0.5;
                    vec3 newPosition = position + normal * (noise * 10.0 + audioData * 20.0) * pulse;
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
                }
            `,
            fragmentShader: `
                ${noiseShader}
                uniform float time;
                uniform vec3 color1;
                uniform vec3 color2;
                uniform float glowIntensity;
                uniform float audioData;
                uniform vec2 mousePosition;
                varying vec2 vUv;
                varying vec3 vNormal;
                varying vec3 vPosition;
                
                void main() {
                    // Advanced noise-based coloring
                    float noise1 = snoise(vec3(vPosition * 0.5 + time));
                    float noise2 = snoise(vec3(vPosition * 0.3 + time * 1.5));
                    
                    vec3 baseColor = mix(color1, color2, vUv.y + noise1 * 0.3);
                    baseColor = mix(baseColor, vec3(1.0, 1.0, 1.5), noise2 * 0.2);
                    
                    // Glow effect
                    float intensity = pow(1.0 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
                    intensity += audioData * 0.5;
                    
                    // Mouse interaction
                    float mouseDist = length(vUv - mousePosition);
                    float mouseEffect = 1.0 - smoothstep(0.0, 0.5, mouseDist);
                    intensity += mouseEffect * 0.3;
                    
                    // Pulsing
                    float pulse = sin(time * 3.0) * 0.1 + 0.9;
                    
                    vec3 finalColor = baseColor * intensity * glowIntensity * pulse;
                    float alpha = intensity * 0.9;
                    
                    gl_FragColor = vec4(finalColor, alpha);
                }
            `,
            transparent: true,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });

        const nebulaBall = new THREE.Mesh(geometry, nebulaMaterial);
        nebulaBall.position.set(
            win.shape.x + win.shape.w * 0.5,
            win.shape.y + win.shape.h * 0.5,
            0
        );

        nebulaBall.userData = {
            originalRadius: radius,
            pulseSpeed: 0.3 + Math.random() * 0.4,
            rotationSpeed: 0.1 + Math.random() * 0.2,
            audioReactivity: 0.5 + Math.random() * 0.5
        };

        createOrbitingParticles(nebulaBall, index);
        createEnergyField(nebulaBall, index);
        
        return nebulaBall;
    }

    function createOrbitingParticles(nebulaBall, index) {
        const particleCount = 150; // Reduced for performance
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        const sizes = new Float32Array(particleCount);
        
        const radius = nebulaBall.userData.originalRadius;
        const mainColor = new THREE.Color().setHSL(index * 0.15, 0.8, 0.7);

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            const angle = Math.random() * Math.PI * 2;
            const distance = radius * (1.3 + Math.random() * 0.7);
            const height = (Math.random() - 0.5) * radius * 0.5;
            
            positions[i3] = Math.cos(angle) * distance;
            positions[i3 + 1] = Math.sin(angle) * distance;
            positions[i3 + 2] = height;
            
            // Color variation
            const hueVariation = (Math.random() - 0.5) * 0.2;
            const particleColor = new THREE.Color().setHSL(
                index * 0.15 + hueVariation, 
                0.9, 
                0.6 + Math.random() * 0.3
            );
            
            colors[i3] = particleColor.r;
            colors[i3 + 1] = particleColor.g;
            colors[i3 + 2] = particleColor.b;
            
            sizes[i] = 2 + Math.random() * 4;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.PointsMaterial({
            size: 3,
            vertexColors: true,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true
        });

        const particleSystem = new THREE.Points(geometry, material);
        nebulaBall.add(particleSystem);
        particleSystems.push(particleSystem);
    }

    function createEnergyField(nebulaBall, index) {
        const fieldGeometry = new THREE.SphereGeometry(nebulaBall.userData.originalRadius * 1.5, 32, 32);
        const fieldMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: timeUniform,
                baseColor: { value: new THREE.Color().setHSL(index * 0.15, 0.6, 0.5) }
            },
            vertexShader: `
                uniform float time;
                varying vec3 vNormal;
                void main() {
                    vNormal = normal;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 baseColor;
                varying vec3 vNormal;
                
                void main() {
                    float intensity = abs(sin(dot(vNormal, vec3(1.0)) * 5.0 + time * 2.0));
                    gl_FragColor = vec4(baseColor, intensity * 0.1);
                }
            `,
            transparent: true,
            wireframe: true,
            blending: THREE.AdditiveBlending
        });

        const energyField = new THREE.Mesh(fieldGeometry, fieldMaterial);
        nebulaBall.add(energyField);
    }

    function createConnections() {
        // Remove old connections
        connectionLines.forEach(line => world.remove(line));
        connectionLines = [];

        const wins = windowManager.getWindows();
        if (wins.length < 2) return;
        
        // Create connections between nearby windows
        for (let i = 0; i < wins.length; i++) {
            for (let j = i + 1; j < wins.length; j++) {
                const win1 = wins[i];
                const win2 = wins[j];
                
                const distance = Math.sqrt(
                    Math.pow(win1.shape.x - win2.shape.x, 2) + 
                    Math.pow(win1.shape.y - win2.shape.y, 2)
                );
                
                if (distance < 800) { // Only connect nearby windows
                    createEnergyConnection(win1, win2, i, j);
                }
            }
        }
    }

    function createEnergyConnection(win1, win2, index1, index2) {
        const points = [];
        const numPoints = 20;
        
        for (let i = 0; i <= numPoints; i++) {
            const interpolation = i / numPoints; // Changed variable name from 't' to avoid conflict
            // Simple curve between points
            const x = win1.shape.x + win1.shape.w * 0.5 + (win2.shape.x + win2.shape.w * 0.5 - win1.shape.x - win1.shape.w * 0.5) * interpolation;
            const y = win1.shape.y + win1.shape.h * 0.5 + (win2.shape.y + win2.shape.h * 0.5 - win1.shape.y - win1.shape.h * 0.5) * interpolation;
            points.push(new THREE.Vector3(x, y, 0)); // Use THREE directly
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: new THREE.Color().setHSL((index1 * 0.15 + index2 * 0.15) * 0.5, 0.8, 0.7),
            transparent: true,
            opacity: 0.3,
            linewidth: 2
        });
        
        const connection = new THREE.Line(geometry, material);
        world.add(connection);
        connectionLines.push(connection);
    }

    function updateNebulaBalls() {
        const wins = windowManager.getWindows();

        nebulaBalls.forEach(ball => world.remove(ball));
        nebulaBalls = [];
        particleSystems = [];

        wins.forEach((win, index) => {
            const nebulaBall = createAdvancedNebulaBall(win, index);
            world.add(nebulaBall);
            nebulaBalls.push(nebulaBall);
        });
    }

    function onMouseMove(event) {
        mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
        mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    function onMouseClick(event) {
        // Create a gravity point at mouse position
        const gravityPoint = {
            x: event.clientX - window.screenX,
            y: event.clientY - window.screenY,
            strength: 1000,
            life: 5.0 // seconds
        };
        gravityPoints.push(gravityPoint);
    }

    function updateWindowShape(easing = true) {
        sceneOffsetTarget = {x: -window.screenX, y: -window.screenY};
        if (!easing) sceneOffset = sceneOffsetTarget;
    }

    function render() {
        const currentTime = getTime();
        timeUniform.value = currentTime;

        windowManager.update();

        // Audio reactivity
        let audioData = 0;
        if (analyser) {
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(dataArray);
            audioData = dataArray[10] / 255; // Use mid-frequency range
        }

        // Update gravity points
        gravityPoints = gravityPoints.filter(point => {
            point.life -= 0.016; // ~60fps
            return point.life > 0;
        });

        // Smooth scene transition
        const falloff = 0.05;
        sceneOffset.x += (sceneOffsetTarget.x - sceneOffset.x) * falloff;
        sceneOffset.y += (sceneOffsetTarget.y - sceneOffset.y) * falloff;
        world.position.set(sceneOffset.x, sceneOffset.y, 0);

        const wins = windowManager.getWindows();

        // Update nebula balls with advanced effects
        nebulaBalls.forEach((ball, index) => {
            if (index >= wins.length) return;

            const win = wins[index];
            const ballTime = currentTime * ball.userData.pulseSpeed;
            
            // Advanced positioning with gravity points
            let targetX = win.shape.x + win.shape.w * 0.5;
            let targetY = win.shape.y + win.shape.h * 0.5;

            // Apply gravity points influence
            gravityPoints.forEach(point => {
                const dx = targetX - point.x;
                const dy = targetY - point.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const force = point.strength * point.life / (distance * distance + 1);
                
                targetX += dx * force * 0.001;
                targetY += dy * force * 0.001;
            });

            ball.position.x += (targetX - ball.position.x) * falloff;
            ball.position.y += (targetY - ball.position.y) * falloff;

            // Advanced animations
            const scale = 1 + Math.sin(ballTime) * 0.15 + audioData * 0.1;
            ball.scale.setScalar(scale);

            ball.rotation.x = ballTime * ball.userData.rotationSpeed;
            ball.rotation.y = ballTime * ball.userData.rotationSpeed * 0.7;

            // Update shader uniforms
            if (ball.material.uniforms) {
                ball.material.uniforms.audioData.value = audioData * ball.userData.audioReactivity;
                ball.material.uniforms.mousePosition.value.set(mousePosition.x, mousePosition.y);
            }

            // Animate orbiting particles
            if (ball.children[0]) {
                ball.children[0].rotation.y = ballTime * 0.5;
                ball.children[0].rotation.x = ballTime * 0.3;
            }
        });

        // Animate connection lines
        connectionLines.forEach((line, index) => {
            if (line.material) {
                line.material.opacity = 0.3 + Math.sin(currentTime + index) * 0.1;
            }
        });

        renderer.render(scene, camera);
        requestAnimationFrame(render);
    }

    function resize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        camera = new THREE.OrthographicCamera(0, width, 0, height, -10000, 10000);
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
}