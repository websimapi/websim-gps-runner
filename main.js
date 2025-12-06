import L from 'leaflet';
import nipplejs from 'nipplejs';
import { getDistance, getRandomPoint } from './utils.js';
import { AudioManager } from './audio.js';

// --- Configuration ---
const CONFIG = {
    spawnRadius: 200, // meters
    collectionDistance: 15, // meters
    updateInterval: 1000,
    itemCount: 5
};

// --- State ---
const state = {
    score: 0,
    isPlaying: false,
    useVirtualGps: true, // Default to true so user can test immediately
    playerPos: { lat: 51.505, lng: -0.09 }, // Default start
    items: [], // { id, lat, lng, marker }
    totalDistance: 0,
    lastPos: null
};

// --- Services ---
const audio = new AudioManager();
let map = null;
let playerMarker = null;
let watchId = null;
let joystick = null;
let joystickInterval = null;

// --- DOM Elements ---
const elScore = document.getElementById('score-display');
const elDist = document.getElementById('dist-display');
const elStartBtn = document.getElementById('start-btn');
const elGpsToggle = document.getElementById('gps-mode-toggle');
const elJoystickZone = document.getElementById('joystick-zone');
const elRecenterBtn = document.getElementById('recenter-btn');
const elMessageArea = document.getElementById('message-area');
const elMsgTitle = document.getElementById('msg-title');
const elMsgBody = document.getElementById('msg-body');

// --- Initialization ---

async function init() {
    // Check initial toggle state
    elGpsToggle.checked = state.useVirtualGps;
    updateControlMode();

    // Load Audio
    await audio.loadSound('collect', 'collect.mp3');

    // Init Map
    map = L.map('map', {
        zoomControl: false,
        attributionControl: false
    }).setView([state.playerPos.lat, state.playerPos.lng], 18);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20
    }).addTo(map);

    // Custom Icons
    const playerIcon = L.icon({
        iconUrl: 'player_icon.png',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    playerMarker = L.marker([state.playerPos.lat, state.playerPos.lng], {
        icon: playerIcon,
        zIndexOffset: 1000
    }).addTo(map);

    // Try to get real location once at startup to center map if available
    navigator.geolocation.getCurrentPosition((pos) => {
        if(!state.isPlaying) {
            updatePlayerPosition(pos.coords.latitude, pos.coords.longitude);
            map.setView([pos.coords.latitude, pos.coords.longitude], 18);
        }
    }, (err) => {
        console.log("GPS not available initially, using default");
    });

    // Event Listeners
    elStartBtn.addEventListener('click', startGame);
    elGpsToggle.addEventListener('change', (e) => {
        state.useVirtualGps = e.target.checked;
        updateControlMode();
    });
    elRecenterBtn.addEventListener('click', () => {
        map.setView(playerMarker.getLatLng(), 18);
    });

    // Main Game Loop (for smooth joystick movement)
    requestAnimationFrame(gameLoop);
}

function updateControlMode() {
    if (state.useVirtualGps) {
        // Enable Joystick
        elJoystickZone.classList.add('active');
        initJoystick();
        // Clear real GPS watch
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
    } else {
        // Disable Joystick
        elJoystickZone.classList.remove('active');
        if (joystick) {
            joystick.destroy();
            joystick = null;
        }
        clearInterval(joystickInterval);
        
        // Start Real GPS Watch
        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    updatePlayerPosition(pos.coords.latitude, pos.coords.longitude);
                },
                (err) => {
                    showMessage("GPS Error", "Could not get location. Try Virtual Mode.");
                    console.error(err);
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: 5000
                }
            );
        }
    }
}

function initJoystick() {
    if (joystick) return;
    
    joystick = nipplejs.create({
        zone: elJoystickZone,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'white'
    });

    let moveVector = { x: 0, y: 0 };

    joystick.on('move', (evt, data) => {
        moveVector = data.vector;
    });

    joystick.on('end', () => {
        moveVector = { x: 0, y: 0 };
    });

    // Joystick movement loop
    joystickInterval = setInterval(() => {
        if (moveVector.x !== 0 || moveVector.y !== 0) {
            // Calculate new position based on vector
            // speed in degrees approx (0.0001 deg is roughly 11 meters)
            const speed = 0.00004; 
            const newLat = state.playerPos.lat + (moveVector.y * speed);
            const newLng = state.playerPos.lng + (moveVector.x * speed);
            updatePlayerPosition(newLat, newLng);
        }
    }, 50); // 20fps updates
}

// --- Game Logic ---

function startGame() {
    if (state.isPlaying) return;
    
    state.isPlaying = true;
    state.score = 0;
    state.totalDistance = 0;
    state.lastPos = null;
    updateUI();

    // Hide Start Button / Show Message
    elStartBtn.style.display = 'none';
    elGpsToggle.parentElement.style.display = 'none'; // Lock mode during game

    showMessage("GO!", `Collect ${CONFIG.itemCount} energy orbs!`);
    setTimeout(hideMessage, 2000);

    spawnItems();
}

function spawnItems() {
    // Clear existing
    state.items.forEach(i => map.removeLayer(i.marker));
    state.items = [];

    const goalIcon = L.icon({
        iconUrl: 'goal_icon.png',
        iconSize: [30, 30],
        className: 'pulse-icon'
    });

    for (let i = 0; i < CONFIG.itemCount; i++) {
        const point = getRandomPoint(state.playerPos.lat, state.playerPos.lng, CONFIG.spawnRadius);
        const marker = L.marker([point.lat, point.lng], { icon: goalIcon }).addTo(map);
        
        state.items.push({
            id: i,
            lat: point.lat,
            lng: point.lng,
            marker: marker
        });
    }
}

function updatePlayerPosition(lat, lng) {
    const prevLat = state.playerPos.lat;
    const prevLng = state.playerPos.lng;

    state.playerPos = { lat, lng };
    playerMarker.setLatLng([lat, lng]);

    // Update rotation of arrow if moving
    if (state.lastPos) {
        // Simple bearing calculation could go here to rotate icon
        // For now, Leaflet marker rotation isn't built-in easily without plugins or CSS transforms
        // We will just move the marker
    }

    // Track Distance
    if (state.isPlaying && state.lastPos) {
        const d = getDistance(state.lastPos.lat, state.lastPos.lng, lat, lng);
        if (d > 0.5) { // Filter noise
            state.totalDistance += d;
            elDist.textContent = Math.floor(state.totalDistance) + 'm';
        }
    }
    state.lastPos = { lat, lng };

    // Check Collisions
    if (state.isPlaying) {
        checkCollisions();
    }
}

function checkCollisions() {
    const toRemove = [];
    
    state.items.forEach(item => {
        const d = getDistance(state.playerPos.lat, state.playerPos.lng, item.lat, item.lng);
        if (d < CONFIG.collectionDistance) {
            // Collected!
            toRemove.push(item);
            collectItem(item);
        }
    });

    // Remove collected items from array
    state.items = state.items.filter(i => !toRemove.includes(i));

    // Check Win Condition
    if (state.items.length === 0) {
        levelUp();
    }
}

function collectItem(item) {
    audio.play('collect');
    map.removeLayer(item.marker);
    state.score += 100;
    elScore.textContent = state.score;
    
    showMessage("Collected!", "+100 Points");
    setTimeout(hideMessage, 1000);
}

function levelUp() {
    showMessage("Level Complete!", "Spawning more...");
    audio.play('collect'); // Play sound twice for effect?
    
    setTimeout(() => {
        CONFIG.itemCount += 2; // Increase difficulty
        CONFIG.spawnRadius += 50;
        spawnItems();
        hideMessage();
    }, 3000);
}

// --- UI Helpers ---

function updateUI() {
    elScore.textContent = state.score;
    elDist.textContent = Math.floor(state.totalDistance) + 'm';
}

function showMessage(title, body) {
    elMsgTitle.textContent = title;
    elMsgBody.textContent = body;
    elMessageArea.classList.remove('hidden');
}

function hideMessage() {
    elMessageArea.classList.add('hidden');
}

function gameLoop() {
    requestAnimationFrame(gameLoop);
    // Smooth camera follow?
    // If we want the camera to always center:
    // map.panTo([state.playerPos.lat, state.playerPos.lng], { animate: true, duration: 0.1 });
    // But let's leave it manual or loose follow to allow looking around.
}

// Start
init();