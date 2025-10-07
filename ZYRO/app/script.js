const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const minimapCanvas = document.getElementById('minimapCanvas');
const minimapCtx = minimapCanvas.getContext('2d');

// --- [CONFIGURAÇÕES GLOBAIS] ---
const WORLD_WIDTH = 50000;
const WORLD_HEIGHT = 46000;
const CHUNKS_X = 5;
const CHUNKS_Y = 5;
const CHUNK_SIZE_X = WORLD_WIDTH / CHUNKS_X; 
const CHUNK_SIZE_Y = WORLD_HEIGHT / CHUNKS_Y; 

const MINIMAP_SIZE = 150;
const MINIMAP_RANGE = 15000;
minimapCanvas.width = MINIMAP_SIZE;
minimapCanvas.height = MINIMAP_SIZE;

// Player e sistema de sobrevivência
let player = {
    x: 5000, 
    y: 5000,
    r: 1500, 
    speed: 20000, 
    inventory: [],
    maxInventory: 10,
    backpack: null, 
    health: 100,
    energy: 70, 
    thirst: 60,
    oxygen: 90,
    input: { dx: 0, dy: 0 },
    hasAntennaRepaired: false
};

let gameState = {
    lastSurvivalUpdate: Date.now(),
    world: null, 
    ancestralTreeHealed: false
};

let missions = [
    { id: 1, text: "Reparar Antena da Nave 🛰️ (1x Sucata ⚙️)", completed: false },
    { id: 2, text: "Criar Tônico de Cura (1x Biomaterial 🧬 + 1x Água 💧)", completed: false },
    { id: 3, text: "Curar Árvore Ancestral na Floresta de Lúmen 🌿", completed: false },
    { id: 4, text: "Receber a Mochila Veyari 🎒", completed: false },
];

let lastTime = 0; 

// --- [CLASSES DE MUNDO] ---

class POI {
    constructor(name, icon, type, x, y, color) {
        this.name = name; this.icon = icon; this.type = type; this.x = x; this.y = y; this.color = color;
    }
}

class World {
    constructor() {
        this.chunks = [];
        this.pois = this.generatePOIs();
        this.generateChunks();
    }

    generatePOIs() {
        return [
            new POI("Nave Danificada (QG)", '🚀', 'ship', 5000, 5000, "#ff6b35"), 
            new POI("Mina de Água", '💧', 'water', 12000, 8000, "#4fc3f7"), 
            new POI("Floresta de Lúmen", '🌿', 'lumen_forest', 45000, 3000, "#66bb6a"), 
            new POI("Ruínas (Comida/Mudas)", '🧱', 'ruins', 8000, 20000, "#a78bfa"), 
            new POI("Laboratório Abandonado", '⚗️', 'workshop', 25000, 23000, "#9ca3af"), 
            new POI("Ferro-Velho (Sucata)", '⚙️', 'scrap_mine', 15000, 42000, "#9ca3af"), 
            new POI("Pântano (Biomaterial)", '🧬', 'swamp_bio', 30000, 35000, "#16a085"), 
            new POI("Caverna de Cristais", '💎', 'crystal', 25000, 5000, "#e879f9") 
        ];
    }
    
    // Funções de Chunk (mantidas para otimização do mundo grande)
    generateChunks() {
        for (let r = 0; r < CHUNKS_Y; r++) {
            for (let c = 0; c < CHUNKS_X; c++) {
                const chunk = {
                    id: `C${c + 1}R${r + 1}`, x: c * CHUNK_SIZE_X, y: r * CHUNK_SIZE_Y,
                    width: CHUNK_SIZE_X, height: CHUNK_SIZE_Y,
                    pois: this.pois.filter(poi => 
                        poi.x >= c * CHUNK_SIZE_X && poi.x < (c + 1) * CHUNK_SIZE_X &&
                        poi.y >= r * CHUNK_SIZE_Y && poi.y < (r + 1) * CHUNK_SIZE_Y
                    )
                };
                this.chunks.push(chunk);
            }
        }
    }
    getChunkCoords(x, y) {
        const chunkC = Math.floor(x / CHUNK_SIZE_X);
        const chunkR = Math.floor(y / CHUNK_SIZE_Y);
        return { c: chunkC, r: chunkR };
    }
    getChunksToRender(player) {
        if (!this.pois || this.pois.length === 0) return { activeChunks: [], activePOIs: [] };
        const { c: playerC, r: playerR } = this.getChunkCoords(player.x, player.y);
        const activeChunks = [];
        const activePOIs = [];
        // Renderiza o chunk atual e os 8 vizinhos
        for (let r = playerR - 1; r <= playerR + 1; r++) {
            for (let c = playerC - 1; c <= playerC + 1; c++) {
                if (c >= 0 && c < CHUNKS_X && r >= 0 && r < CHUNKS_Y) {
                    const index = r * CHUNKS_X + c;
                    if (this.chunks[index]) {
                        const chunk = this.chunks[index];
                        activeChunks.push(chunk);
                        activePOIs.push(...chunk.pois); 
                    }
                }
            }
        }
        return { activeChunks, activePOIs };
    }
}


// --- [MECÂNICA JOYSTICK (ESTÁVEL)] ---

const joystick = document.getElementById("joystick");
const stick = document.getElementById("stick");
let joy = { active: false, x: 0, y: 0 };

joystick.addEventListener("touchstart", handleJoystickStart, { passive: false });
joystick.addEventListener("touchend", handleJoystickEnd);
joystick.addEventListener("touchmove", handleJoystickMove, { passive: false });
joystick.addEventListener("mousedown", handleJoystickStart, { passive: false });
document.addEventListener("mouseup", handleJoystickEnd);
document.addEventListener("mousemove", handleJoystickMove, { passive: false });

function handleJoystickStart(e) { 
    e.preventDefault(); 
    joy.active = true; 
    if (navigator.vibrate) navigator.vibrate(10); 
    if (e.touches) handleJoystickMove(e); 
}

function handleJoystickEnd(e) { 
    e.preventDefault(); 
    joy.active = false; 
    stick.style.left = "50%"; 
    stick.style.top = "50%"; 
    joy.x = 0; 
    joy.y = 0; 
}

function handleJoystickMove(e) { 
    e.preventDefault();
    if (!joy.active) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const rect = joystick.getBoundingClientRect();
    let dx = clientX - (rect.left + rect.width / 2);
    let dy = clientY - (rect.top + rect.height / 2);

    const dist = Math.min(Math.hypot(dx, dy), rect.width / 2 - 10);
    const angle = Math.atan2(dy, dx);
    
    stick.style.left = rect.width / 2 + dist * Math.cos(angle) + "px";
    stick.style.top = rect.height / 2 + dist * Math.sin(angle) + "px";
    
    joy.x = Math.cos(angle) * (dist / (rect.width / 2 - 10));
    joy.y = Math.sin(angle) * (dist / (rect.width / 2 - 10));
}


// --- [FUNÇÕES DE LÓGICA E HUD] ---

function getItemName(icon) {
    switch(icon) {
        case "💧": return "Água"; case "🌿": return "Mudas O²"; case "💎": return "Cristal Raro";
        case "⚙️": return "Sucata"; case "🧬": return "Biomaterial"; case "🥔": return "Batata";
        case "🧪": return "Tônico de Cura Veyari"; case "🩹": return "Medkit"; case "💨": return "Filtro O²";
        case "⚡": return "Painel Solar";
        default: return "Item Desconhecido";
    }
}

function updateMissions() {
    const missionPanel = document.getElementById("mission-panel");
    missionPanel.innerHTML = "<b>📜 Missões</b><br>";
    missions.forEach(m => {
        missionPanel.innerHTML += (m.completed ? "✅ " : "🔸 ") + m.text + "<br>";
    });
}

function showMessage(text) {
    const msgPanel = document.getElementById("message-panel");
    msgPanel.textContent = text;
}

function closeInterface(id) { 
    document.getElementById(id).style.display = "none"; 
    updateShipInterface(); 
}

function updateShipInterface() {
    document.getElementById("inv-count").textContent = player.inventory.length;
    
    const backpackSlot = document.getElementById("backpack-slot");
    if (player.backpack === 'veyari') {
        backpackSlot.innerHTML = `<div>Mochila Veyari: ✅ (20 Slots, +HP Regen)</div>`;
        document.getElementById("inv-max").textContent = 20;
        player.maxInventory = 20;
    } else {
        backpackSlot.innerHTML = `<div>Mochila Padrão: 10 Slots</div>`;
        document.getElementById("inv-max").textContent = 10;
        player.maxInventory = 10;
    }
    
    // Atualiza o Grid de Inventário (simplificado)
    const invGrid = document.getElementById("ship-inventory");
    invGrid.innerHTML = "";
    for (let i = 0; i < player.maxInventory; i++) {
        const slot = document.createElement('div');
        slot.className = 'inventory-slot';
        if (player.inventory[i]) {
            slot.textContent = player.inventory[i];
            slot.title = getItemName(player.inventory[i]);
        }
        invGrid.appendChild(slot);
    }
}

// [CRAFTING]
function craftItem(recipe) {
    if (player.inventory.length >= player.maxInventory) { showMessage("❌ Inventário cheio! Não é possível criar."); return; }
    
    let required = {};
    let product = "";
    
    switch (recipe) {
        case 'medkit': required = { "💧": 1, "🥔": 1 }; product = "🩹"; break;
        case 'filter': required = { "🌿": 1, "💧": 1 }; product = "💨"; break;
        case 'solar': required = { "💎": 2, "⚙️": 1 }; product = "⚡"; break;
        case 'tonic': 
            required = { "🧬": 1, "💧": 1 }; 
            product = "🧪"; 
            missions[1].completed = true; 
            break; 
        default: return;
    }

    let canCraft = true;
    for (const [item, count] of Object.entries(required)) {
        if (player.inventory.filter(i => i === item).length < count) {
            canCraft = false;
            showMessage(`❌ Falta ${count}x ${getItemName(item)}.`);
            break;
        }
    }

    if (canCraft) {
        // Remove ingredientes e Adiciona o produto
        for (const [item, count] of Object.entries(required)) {
            for(let i = 0; i < count; i++) {
                const index = player.inventory.findIndex(invItem => invItem === item);
                if (index !== -1) player.inventory.splice(index, 1);
            }
        }
        player.inventory.push(product);
        showMessage(`✅ Criou ${product} ${getItemName(product)}!`);
    }
    updateShipInterface();
    updateMissions();
}

// [INTERAÇÃO COM POIs]
function interactWithNearestPOI() {
    let nearestPOI = null;
    const interactDistance = 3000;
    
    if (!gameState.world) { showMessage("Aguardando inicialização do mundo."); return; }
    
    const { activePOIs } = gameState.world.getChunksToRender(player);

    activePOIs.forEach(poi => {
        let distance = Math.hypot(player.x - poi.x, player.y - poi.y);
        if (distance < interactDistance) {
            nearestPOI = poi;
        }
    });
    
    if (nearestPOI) {
        handlePOIInteraction(nearestPOI);
    } else {
        showMessage("❌ Nenhum ponto de interesse próximo");
    }
}

function handlePOIInteraction(poi) {
    switch(poi.type) {
        case "ship":
            if (!player.hasAntennaRepaired) {
                if (player.inventory.includes("⚙️")) {
                    player.inventory.splice(player.inventory.indexOf("⚙️"), 1);
                    player.hasAntennaRepaired = true;
                    missions[0].completed = true;
                    showMessage("✅ Antena Reparada! Sinal Veyari detectado em Lúmen (🌿).");
                    updateMissions();
                } else {
                    showMessage("⚙️ Antena danificada. Requer 1x Sucata para reparo.");
                }
            } else {
                document.getElementById("ship-interface").style.display = "block";
                updateShipInterface();
            }
            break;
            
        case "water": collectResource("💧", "Água Cristalina"); break;
        case "scrap_mine": collectResource("⚙️", "Sucata"); break;
        case "swamp_bio": collectResource("🧬", "Biomaterial Veyari"); break;
        case "crystal": collectResource("💎", "Cristal Raro"); break;
        case "ruins": collectResource("🥔", "Batata"); collectResource("🌿", "Mudas O²"); break;
        
        case "lumen_forest":
            if (!gameState.ancestralTreeHealed) {
                if (player.inventory.includes("🧪")) {
                    player.inventory.splice(player.inventory.indexOf("🧪"), 1); 
                    gameState.ancestralTreeHealed = true;
                    missions[2].completed = true; 
                    missions[3].completed = true; 
                    player.backpack = "veyari";
                    showMessage("🌳 Árvore curada! Guardião Veyari te presenteou com a **Mochila Veyari**!");
                    updateMissions();
                } else {
                    showMessage("🌿 Árvore Ancestral ferida. Requer Tônico de Cura (🧪).");
                }
            } else {
                collectResource("🧬", "Biomaterial da Floresta (Recurso)");
            }
            break;
            
        default: showMessage(`Interagiu com ${poi.icon} ${poi.name}.`); break;
    }
}

function collectResource(icon, name) {
    if (player.inventory.length < player.maxInventory) {
        player.inventory.push(icon);
        showMessage(`✅ Coletou ${icon} ${name}.`);
    } else { showMessage("❌ Inventário cheio!"); }
}

// [SOBREVIVÊNCIA]
function updateSurvival() {
    const now = Date.now();
    const elapsed = now - gameState.lastSurvivalUpdate;

    if (elapsed >= 1000) {
        player.thirst = Math.max(0, player.thirst - 0.2); 
        player.energy = Math.max(0, player.energy - 0.2); 
        player.oxygen = Math.max(0, player.oxygen - 0.1); 
        
        if (player.backpack === 'veyari' && player.health < 100) {
             player.health = Math.min(100, player.health + 0.5); 
        }

        if (player.thirst < 10 || player.energy < 10) { player.health = Math.max(0, player.health - 0.1); }
        if (player.oxygen < 10) { player.health = Math.max(0, player.health - 0.5); }
        
        gameState.lastSurvivalUpdate = now;
    }
}

function updateSurvivalHUD() { 
    document.getElementById("health-text").textContent = `${player.health.toFixed(0)}%`;
    document.getElementById("health-bar").style.width = `${player.health}%`;
    document.getElementById("energy-text").textContent = `${player.energy.toFixed(0)}%`;
    document.getElementById("energy-bar").style.width = `${player.energy}%`;
    document.getElementById("thirst-text").textContent = `${player.thirst.toFixed(0)}%`;
    document.getElementById("thirst-bar").style.width = `${player.thirst}%`;
    document.getElementById("oxygen-text").textContent = `${player.oxygen.toFixed(0)}%`;
    document.getElementById("oxygen-bar").style.width = `${player.oxygen}%`;
}


// --- [GAME LOOP E DRAW (VISUALIZAÇÃO DE MAPA GRANDE)] ---

// Função auxiliar para desenhar texto no mapa (POI Names)
function drawTextOnWorld(text, x, y, size, color = 'white', outline = false) {
    ctx.font = `${size}px Space Mono`;
    ctx.textAlign = 'center';

    if (outline) {
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 300;
        ctx.strokeText(text, x, y);
    }
    
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
}


function drawMinimap(allPOIs) { 
    minimapCtx.fillStyle = '#0a0a0a';
    minimapCtx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    const scale = MINIMAP_SIZE / MINIMAP_RANGE;

    allPOIs.forEach(poi => {
        const mapX = MINIMAP_SIZE / 2 + (poi.x - player.x) * scale;
        const mapY = MINIMAP_SIZE / 2 + (poi.y - player.y) * scale;
        
        if (mapX >= 0 && mapX <= MINIMAP_SIZE && mapY >= 0 && mapY <= MINIMAP_SIZE) {
            minimapCtx.fillStyle = poi.color;
            minimapCtx.beginPath();
            minimapCtx.arc(mapX, mapY, 5, 0, Math.PI * 2); 
            minimapCtx.fill();
            
            minimapCtx.fillStyle = 'white';
            minimapCtx.font = "8px Arial";
            minimapCtx.fillText(poi.icon, mapX + 5, mapY + 3);
        }
    });

    // Player no Minimapa
    minimapCtx.fillStyle = '#ffffff';
    minimapCtx.beginPath();
    minimapCtx.arc(MINIMAP_SIZE / 2, MINIMAP_SIZE / 2, 6, 0, Math.PI * 2); 
    minimapCtx.fill();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    const camX = player.x - canvas.width / 2;
    const camY = player.y - canvas.height / 2;
    ctx.translate(-camX, -camY);
    
    if (!gameState.world) return; 

    const { activeChunks, activePOIs } = gameState.world.getChunksToRender(player);

    // 1. Desenha Chunks/Terreno
    activeChunks.forEach(chunk => {
        ctx.strokeStyle = '#444'; 
        ctx.lineWidth = 1000;
        ctx.strokeRect(chunk.x, chunk.y, chunk.width, chunk.height);
    });
    
    // 2. Desenha POIs Ativos (Estruturas/Mapa Grande)
    activePOIs.forEach(poi => {
        let poiColor = poi.color;
        if (poi.type === 'lumen_forest' && gameState.ancestralTreeHealed) {
            poiColor = "#00ff00"; 
        }
        
        // Desenha o círculo do POI
        ctx.fillStyle = poiColor;
        ctx.beginPath();
        ctx.arc(poi.x, poi.y, 2500, 0, Math.PI * 2);
        ctx.fill();
        
        // Desenha o ÍCONE do POI
        drawTextOnWorld(poi.icon, poi.x, poi.y + 500, 1500, 'white');
        
        // Calcula e desenha o NOME e DISTÂNCIA
        const distanceMeters = Math.hypot(player.x - poi.x, player.y - poi.y);
        const distanceKm = (distanceMeters / 1000).toFixed(1);

        drawTextOnWorld(poi.name, poi.x, poi.y - 1500, 1000, 'white', true);
        
        // Desenha a DISTÂNCIA (visível se estiver a menos de 20 km)
        if (distanceMeters < 20000) {
            drawTextOnWorld(`${distanceKm} km`, poi.x, poi.y + 2500, 800, poiColor, true);
        }
    });

    // 3. Desenha o Player
    ctx.fillStyle = player.backpack === 'veyari' ? "#00ff99" : "#00bfff";
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
    ctx.fill();
    drawTextOnWorld("ZYRO", player.x, player.y + 500, 1000, 'black');
    
    ctx.restore();
    
    drawMinimap(gameState.world.pois);
}

function update(deltaTime) {
    player.x += joy.x * player.speed * deltaTime;
    player.y += joy.y * player.speed * deltaTime;
    player.x = Math.max(player.r, Math.min(WORLD_WIDTH - player.r, player.x));
    player.y = Math.max(player.r, Math.min(WORLD_HEIGHT - player.r, player.y));
    updateSurvival();
    updateSurvivalHUD();
    if (player.health <= 0) { 
        alert("GAME OVER! Você sucumbiu às hostilidades de ZYRO."); 
        location.reload(); 
    }
}

function gameLoop(timestamp) {
    const deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    update(deltaTime);
    draw();
    requestAnimationFrame(gameLoop);
}

// --- [INICIALIZAÇÃO DO JOGO] ---

function init() {
    // 1. Configuração do Canvas (Mobile-friendly)
    const resizeCanvas = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); 

    // 2. Inicialização do Mundo
    gameState.world = new World();
    
    // 3. Estado Inicial do Player (recursos iniciais)
    player.inventory.push("⚙️", "🧬", "💧", "🥔"); 
    updateMissions();
    updateSurvivalHUD();
    showMessage("Bem-vindo a ZYRO! Repare a antena (🚀) para começar a Missão Veyari.");
    
    // 4. Inicia o Game Loop
    requestAnimationFrame(gameLoop);
}

init();
