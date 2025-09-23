import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.132.2/build/three.module.js';
import WindowManager from './WindowManager.js';

let camera, scene, renderer, world;
let nebulaBalls = [];
let sceneOffsetTarget = {x: 0, y: 0};
let sceneOffset = {x: 0, y: 0};

// Advanced effects variables
let particleSystems = [];
let connectionLines = [];
let audioContext, analyser;
let gravityPoints = [];
let mousePosition = { x: 0, y: 0 };
let timeUniform = { value: 0 };

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

    function createNebulaBall(win, index) {
        const radius = 80 + index * 20;
        const geometry = new THREE.SphereGeometry(radius, 32, 32);
        
        // Create vibrant colors with HSL
        const mainColor = new THREE.Color().setHSL(index * 0.15, 0.9, 0.6);
        const secondaryColor = new THREE.Color().setHSL(index * 0.15 + 0.3, 0.8, 0.7);

        const material = new THREE.MeshBasicMaterial({
            color: mainColor,
            transparent: true,
            opacity: 0.8,
            wireframe: false,
            blending: THREE.AdditiveBlending
        });

        const nebulaBall = new THREE.Mesh(geometry, material);
        nebulaBall.position.set(
            win.shape.x + win.shape.w * 0.5,
            win.shape.y + win.shape.h * 0.5,
            0
        );

        nebulaBall.userData = {
            originalRadius: radius,
            pulseSpeed: 0.5 + Math.random() * 0.5,
            rotationSpeed: 0.2 + Math.random() * 0.3,
            mainColor: mainColor,
            secondaryColor: secondaryColor
        };

        // Create glowing aura
        createAura(nebulaBall, index);
        // Create orbiting particles
        createParticles(nebulaBall, index);
        
        return nebulaBall;
    }

    function createAura(nebulaBall, index) {
        const auraGeometry = new THREE.SphereGeometry(nebulaBall.userData.originalRadius * 1.3, 16, 16);
        const auraMaterial = new THREE.MeshBasicMaterial({
            color: nebulaBall.userData.secondaryColor,
            transparent: true,
            opacity: 0.3,
            wireframe: true,
            blending: THREE.AdditiveBlending
        });

        const aura = new THREE.Mesh(auraGeometry, auraMaterial);
        nebulaBall.add(aura);
    }

    function createParticles(nebulaBall, index) {
        const particleCount = 100;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const colors = new Float32Array(particleCount * 3);
        
        const radius = nebulaBall.userData.originalRadius;

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            
            // Create particles in a spherical distribution
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const r = radius * (1.1 + Math.random() * 0.5);
            
            positions[i3] = Math.sin(phi) * Math.cos(theta) * r;
            positions[i3 + 1] = Math.sin(phi) * Math.sin(theta) * r;
            positions[i3 + 2] = Math.cos(phi) * r;
            
            // Color variation
            const colorVar = new THREE.Color().setHSL(
                index * 0.15 + Math.random() * 0.1, 
                0.9, 
                0.7 + Math.random() * 0.2
            );
            
            colors[i3] = colorVar.r;
            colors[i3 + 1] = colorVar.g;
            colors[i3 + 2] = colorVar.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 3,
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending
        });

        const particleSystem = new THREE.Points(geometry, material);
        nebulaBall.add(particleSystem);
        particleSystems.push(particleSystem);
    }

    function createConnections() {
        // Remove old connections
        connectionLines.forEach(line => world.remove(line));
        connectionLines = [];

        const wins = windowManager.getWindows();
        if (wins.length < 2) return;
        
        // Create connections between all windows (not just nearby ones)
        for (let i = 0; i < wins.length; i++) {
            for (let j = i + 1; j < wins.length; j++) {
                createEnergyConnection(wins[i], wins[j], i, j);
            }
        }
    }

    function createEnergyConnection(win1, win2, index1, index2) {
        const points = [];
        const numPoints = 10; // Reduced for simplicity
        
        const startX = win1.shape.x + win1.shape.w * 0.5;
        const startY = win1.shape.y + win1.shape.h * 0.5;
        const endX = win2.shape.x + win2.shape.w * 0.5;
        const endY = win2.shape.y + win2.shape.h * 0.5;

        // Create a straight line with slight curve
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            const x = startX + (endX - startX) * t;
            const y = startY + (endY - startY) * t;
            // Add slight wave effect
            const wave = Math.sin(t * Math.PI) * 20;
            points.push(new THREE.Vector3(x, y + wave, 0));
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        
        // Create a vibrant connection color
        const connectionColor = new THREE.Color().setHSL(
            (index1 * 0.15 + index2 * 0.15) * 0.5, 
            0.9, 
            0.7
        );

        const material = new THREE.LineBasicMaterial({
            color: connectionColor,
            transparent: true,
            opacity: 0.6,
            linewidth: 2
        });
        
        const connection = new THREE.Line(geometry, material);
        world.add(connection);
        connectionLines.push(connection);
        
        // Also create a glowing effect line
        const glowMaterial = new THREE.LineBasicMaterial({
            color: connectionColor,
            transparent: true,
            opacity: 0.3,
            linewidth: 4
        });
        
        const glowConnection = new THREE.Line(geometry.clone(), glowMaterial);
        world.add(glowConnection);
        connectionLines.push(glowConnection);
    }

    function updateNebulaBalls() {
        const wins = windowManager.getWindows();

        // Remove all existing nebula balls
        nebulaBalls.forEach(ball => {
            // Remove all children first
            while(ball.children.length > 0) {
                ball.remove(ball.children[0]);
            }
            world.remove(ball);
        });
        nebulaBalls = [];
        particleSystems = [];

        // Create new nebula balls
        wins.forEach((win, index) => {
            const nebulaBall = createNebulaBall(win, index);
            world.add(nebulaBall);
            nebulaBalls.push(nebulaBall);
        });
    }

    function onMouseMove(event) {
        // Convert mouse position to scene coordinates
        mousePosition.x = event.clientX;
        mousePosition.y = event.clientY;
    }

    function onMouseClick(event) {
        // Create a gravity point at mouse position (relative to scene)
        const gravityPoint = {
            x: event.clientX - window.screenX + sceneOffset.x,
            y: event.clientY - window.screenY + sceneOffset.y,
            strength: 500,
            life: 3.0,
            creationTime: getTime()
        };
        gravityPoints.push(gravityPoint);
        
        // Visual effect for click
        createClickEffect(event.clientX, event.clientY);
    }

    function createClickEffect(x, y) {
        // Create a ripple effect at click position
        const rippleGeometry = new THREE.RingGeometry(5, 10, 32);
        const rippleMaterial = new THREE.MeshBasicMaterial({
            color: 0x4fffff,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        
        const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial);
        ripple.position.set(x - window.screenX + sceneOffset.x, y - window.screenY + sceneOffset.y, 0);
        world.add(ripple);
        
        // Animate and remove the ripple
        let scale = 1;
        const animateRipple = () => {
            scale += 0.1;
            ripple.scale.set(scale, scale, 1);
            rippleMaterial.opacity -= 0.05;
            
            if (rippleMaterial.opacity > 0) {
                requestAnimationFrame(animateRipple);
            } else {
                world.remove(ripple);
            }
        };
        animateRipple();
    }

    function updateWindowShape(easing = true) {
        sceneOffsetTarget = {x: -window.screenX, y: -window.screenY};
        if (!easing) sceneOffset = sceneOffsetTarget;
    }

    function render() {
        const currentTime = getTime();
        timeUniform.value = currentTime;

        windowManager.update();

        // Smooth scene transition
        const falloff = 0.08; // Increased for more responsiveness
        sceneOffset.x += (sceneOffsetTarget.x - sceneOffset.x) * falloff;
        sceneOffset.y += (sceneOffsetTarget.y - sceneOffset.y) * falloff;
        world.position.set(sceneOffset.x, sceneOffset.y, 0);

        const wins = windowManager.getWindows();

        // Update gravity points (remove expired ones)
        gravityPoints = gravityPoints.filter(point => {
            point.life -= 0.016;
            return point.life > 0;
        });

        // Update nebula balls with interactive effects
        nebulaBalls.forEach((ball, index) => {
            if (index >= wins.length) return;

            const win = wins[index];
            const ballTime = currentTime * ball.userData.pulseSpeed;
            
            // Target position
            let targetX = win.shape.x + win.shape.w * 0.5;
            let targetY = win.shape.y + win.shape.h * 0.5;

            // Apply gravity points influence for interactive attraction
            gravityPoints.forEach(point => {
                const dx = targetX - point.x;
                const dy = targetY - point.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 300) { // Only affect if close enough
                    const force = point.strength * point.life / (distance + 50);
                    targetX -= dx * force * 0.0005;
                    targetY -= dy * force * 0.0005;
                }
            });

            // Smooth movement towards target
            ball.position.x += (targetX - ball.position.x) * falloff;
            ball.position.y += (targetY - ball.position.y) * falloff;

            // Pulsating scale animation
            const pulse = Math.sin(ballTime * 2) * 0.1 + 1;
            ball.scale.set(pulse, pulse, pulse);

            // Rotation animation
            ball.rotation.x = ballTime * ball.userData.rotationSpeed;
            ball.rotation.y = ballTime * ball.userData.rotationSpeed * 0.7;

            // Rotate particles
            if (ball.children.length > 1) {
                const particles = ball.children[1];
                particles.rotation.y += 0.01;
                particles.rotation.x += 0.005;
            }

            // Pulsate aura
            if (ball.children.length > 0) {
                const aura = ball.children[0];
                aura.rotation.y += 0.02;
                const auraPulse = Math.sin(ballTime * 3) * 0.2 + 1;
                aura.scale.set(auraPulse, auraPulse, auraPulse);
            }
        });

        // Update connection lines to follow current positions
        updateConnectionLines();

        renderer.render(scene, camera);
        requestAnimationFrame(render);
    }

    function updateConnectionLines() {
        const wins = windowManager.getWindows();
        let connectionIndex = 0;

        for (let i = 0; i < wins.length; i++) {
            for (let j = i + 1; j < wins.length; j++) {
                if (connectionIndex >= connectionLines.length) break;

                const win1 = wins[i];
                const win2 = wins[j];
                
                const startX = win1.shape.x + win1.shape.w * 0.5;
                const startY = win1.shape.y + win1.shape.h * 0.5;
                const endX = win2.shape.x + win2.shape.w * 0.5;
                const endY = win2.shape.y + win2.shape.h * 0.5;

                // Calculate distance for dynamic effects
                const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
                const maxDistance = 1500; // Maximum distance for full visibility
                
                // Update the main line
                const points = [];
                const numPoints = 10;
                
                for (let k = 0; k <= numPoints; k++) {
                    const t = k / numPoints;
                    const x = startX + (endX - startX) * t;
                    const y = startY + (endY - startY) * t;
                    const wave = Math.sin(t * Math.PI + getTime() * 2) * (20 * (1 - distance/maxDistance));
                    points.push(new THREE.Vector3(x, y + wave, 0));
                }
                
                connectionLines[connectionIndex].geometry.setFromPoints(points);
                
                // Dynamic opacity based on distance
                const opacity = Math.max(0.1, 0.6 * (1 - distance/maxDistance));
                connectionLines[connectionIndex].material.opacity = opacity;
                
                connectionIndex++;
                
                // Update the glow line (if it exists)
                if (connectionIndex < connectionLines.length) {
                    connectionLines[connectionIndex].geometry.setFromPoints(points);
                    connectionLines[connectionIndex].material.opacity = opacity * 0.5;
                    connectionIndex++;
                }
            }
        }
    }

    function resize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        camera = new THREE.OrthographicCamera(0, width, 0, height, -10000, 10000);
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
}