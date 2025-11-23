import { CITIES } from "./cities.js";

// ZÁKLADNÍ NASTAVENÍ MAPY
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const mapImage = new Image();
let mapLoaded = false;
mapImage.src = "assets/usa_sil.png"; // cesta k silhouetě USA

mapImage.addEventListener("load", () => {
  mapLoaded = true;
  console.log("Map image loaded");
});

const TILE_SIZE = 8;
const GRID_COLS = 128; // 1024 / 8
const GRID_ROWS = 72;  // 576 / 8

const LAND_MIN_X = 3;
const LAND_MAX_X = 941;
const LAND_MIN_Y = 53;
const LAND_MAX_Y = 568;

// extrémy z tvého seznamu měst
const MIN_LON = -122.675;   // západ (Portland)
const MAX_LON = -71.0589;   // východ (Boston)
const MIN_LAT = 25.7617;    // jih (Miami)
const MAX_LAT = 47.6062;    // sever (Seattle)

document.getElementById("mapSize").textContent =
  `${GRID_COLS} × ${GRID_ROWS} polí`;

// ----------------------------------------
// POST-APO MLHA – základní systém
// ----------------------------------------

const fogSpreadSpeed = 0.001; // rychlost šíření mlhy
let fogTiles = new Set();     // tile indexy mlhy

// Pomocná funkce pro index tile
function tileIndex(x, y) {
  return y * GRID_COLS + x;
}

// Inicializace – mlha začíná náhodně
function initFog() {
  for (let i = 0; i < 15; i++) {
    const x = Math.floor(Math.random() * GRID_COLS);
    const y = Math.floor(Math.random() * GRID_ROWS);
    fogTiles.add(tileIndex(x, y));
  }
}

function projectToPixel(lat, lon) {
  const xNorm = (lon - MIN_LON) / (MAX_LON - MIN_LON);
  const yNorm = 1 - (lat - MIN_LAT) / (MAX_LAT - MIN_LAT);

  const px = LAND_MIN_X + xNorm * (LAND_MAX_X - LAND_MIN_X);
  const py = LAND_MIN_Y + yNorm * (LAND_MAX_Y - LAND_MIN_Y);

  return { px, py };
}

const cities = CITIES.map((c) => {
  const { px, py } = projectToPixel(c.lat, c.lon);

  const x = Math.round(px / TILE_SIZE);
  const y = Math.round(py / TILE_SIZE);

  return { ...c, px, py, x, y };
});

// Šíření mlhy
function spreadFog() {
  // náhodné šíření podle rychlosti
  if (Math.random() > fogSpreadSpeed) return;

  const newFog = new Set(fogTiles);

  fogTiles.forEach((index) => {
    const x = index % GRID_COLS;
    const y = Math.floor(index / GRID_COLS);

    const neighbors = [
      { x: x + 1, y: y },
      { x: x - 1, y: y },
      { x: x,     y: y + 1 },
      { x: x,     y: y - 1 },
    ];

    neighbors.forEach((n) => {
      if (
        n.x >= 0 &&
        n.x < GRID_COLS &&
        n.y >= 0 &&
        n.y < GRID_ROWS
      ) {
        const idx = tileIndex(n.x, n.y);
        newFog.add(idx);
      }
    });
  });

  fogTiles = newFog;
}

// Kontrola, jestli je město pohlceno mlhou
function isCityInFog(city) {
  return fogTiles.has(tileIndex(city.x, city.y));
}

// Najde město na dané pozici v gridu
function getCityAt(x, y) {
  return cities.find((c) => c.x === x && c.y === y);
}

// ----------------------------------------
// Vlakové trasy mezi městy
// ----------------------------------------

const trainLines = [
  ["Seattle", "Portland"],
  ["Portland", "San Francisco"],
  ["San Francisco", "Los Angeles"],
  ["Los Angeles", "San Diego"],

  ["Los Angeles", "Las Vegas"],
  ["Las Vegas", "Salt Lake City"], // POZOR: pokud Salt Lake City nebude v CITIES, trasa se prostě nevykreslí
  ["Salt Lake City", "Denver"],

  ["Denver", "Chicago"],
  ["Chicago", "St. Louis"],
  ["St. Louis", "Dallas"],
  ["Dallas", "Houston"],
  ["Houston", "San Antonio"],

  ["Chicago", "Minneapolis"],
  ["Chicago", "Atlanta"],
  
  ["Atlanta", "Miami"],
  ["Atlanta", "Washington"],

  ["Washington", "Philadelphia"],
  ["Philadelphia", "New York"],
  ["New York", "Boston"]
];

// Najde všechny sousední města, na která vede vlak z daného města
function getConnections(cityName) {
  const connectedNames = trainLines
    .filter(
      (line) => line[0] === cityName || line[1] === cityName
    )
    .map((line) => (line[0] === cityName ? line[1] : line[0]));

  return connectedNames
    .map((name) => cities.find((c) => c.name === name))
    .filter(Boolean);
}

// Čištění města agentem
function cleanCity() {
  const city = getCityAt(agent.x, agent.y);
  if (!city) return;

  // Odstraníme mlhu z okolí města
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const nx = city.x + dx;
      const ny = city.y + dy;
      if (nx >= 0 && ny >= 0 && nx < GRID_COLS && ny < GRID_ROWS) {
        fogTiles.delete(tileIndex(nx, ny));
      }
    }
  }

  console.log("Město vyčištěno:", city.name);
}

// ----------------------------------------
// AGENT + ZÁKLADNÍ GRID
// ----------------------------------------

const agent = {
  x: 60,
  y: 20,
  color: "#38bdf8"
};

// Náhodně "infikovaná" pole – jen vizuální ukázka
const infectedTiles = [];
for (let i = 0; i < 40; i++) {
  infectedTiles.push({
    x: Math.floor(Math.random() * GRID_COLS),
    y: Math.floor(Math.random() * GRID_ROWS),
  });
}

function moveAgent(dx, dy) {
  const newX = agent.x + dx;
  const newY = agent.y + dy;

  if (newX >= 0 && newX < GRID_COLS && newY >= 0 && newY < GRID_ROWS) {
    agent.x = newX;
    agent.y = newY;
    document.getElementById("agentPos").textContent = `${agent.x},${agent.y}`;
  }
}

// ----------------------------------------
// Vstup z klávesnice
// ----------------------------------------

window.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "ArrowUp":
      moveAgent(0, -1);
      e.preventDefault();
      break;
    case "ArrowDown":
      moveAgent(0, 1);
      e.preventDefault();
      break;
    case "ArrowLeft":
      moveAgent(-1, 0);
      e.preventDefault();
      break;
    case "ArrowRight":
      moveAgent(1, 0);
      e.preventDefault();
      break;
    case " ":
      // mezerník – čistit město
      cleanCity();
      e.preventDefault();
      break;
    case "c":
    case "C":
      // cestování vlakem
      travelFromCurrentCity();
      e.preventDefault();
      break;
  }
});

// Cestování vlakem z aktuálního města
function travelFromCurrentCity() {
  const currentCity = getCityAt(agent.x, agent.y);
  if (!currentCity) {
    console.log("Agent není ve městě – nelze cestovat.");
    return;
  }

  const connections = getConnections(currentCity.name);
  if (connections.length === 0) {
    console.log("Z tohoto města nevede žádná trať.");
    return;
  }

  const choicesText = connections
    .map((city, index) => `${index + 1}) ${city.name}`)
    .join("\n");

  const input = prompt(
    `Cestování vlakem z ${currentCity.name}:\n${choicesText}\n\nZadej číslo cílového města:`
  );

  const choiceIndex = parseInt(input, 10) - 1;
  if (isNaN(choiceIndex) || choiceIndex < 0 || choiceIndex >= connections.length) {
    console.log("Neplatná volba cestování.");
    return;
  }

  const destination = connections[choiceIndex];
  agent.x = destination.x;
  agent.y = destination.y;

  document.getElementById("agentPos").textContent = `${agent.x},${agent.y}`;
  console.log(`Přesun vlakem do: ${destination.name}`);
}

// ----------------------------------------
// Vykreslení měst (čtverečky + labely)
// ----------------------------------------

function drawCities(ctx) {
  cities.forEach((city) => {
    // bod města
    ctx.fillStyle = isCityInFog(city) ? "#DC2626" : "#22c55e";
    ctx.beginPath();
    ctx.arc(city.px, city.py, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // popisky
  ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  cities.forEach((city) => {
    const label = city.name;
    const px = city.px + 8;
    const py = city.py;
    const paddingX = 3;
    const paddingY = 2;
    const textWidth = ctx.measureText(label).width;

    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(
      px - paddingX,
      py - 6 - paddingY,
      textWidth + paddingX * 2,
      12 + paddingY * 2
    );

    ctx.fillStyle = "#e5e7eb";
    ctx.fillText(label, px, py);
  });
}

// ----------------------------------------
// Vykreslení vlakových tras
// ----------------------------------------

function drawTrainLines(ctx) {
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;

  trainLines.forEach((line) => {
    const a = cities.find((c) => c.name === line[0]);
    const b = cities.find((c) => c.name === line[1]);

    // pokud některé město v CITIES není (třeba Salt Lake City), trasu přeskočíme
    if (!a || !b) return;

    ctx.beginPath();
    ctx.moveTo(
      a.x * TILE_SIZE + TILE_SIZE / 2,
      a.y * TILE_SIZE + TILE_SIZE / 2
    );
    ctx.lineTo(
      b.x * TILE_SIZE + TILE_SIZE / 2,
      b.y * TILE_SIZE + TILE_SIZE / 2
    );
    ctx.stroke();
  });
}

// ----------------------------------------
// LOGIKA POHYBU – jednoduchý krokový pohyb
// ----------------------------------------

function update() {
  // Sem může časem přijít logika pro AI, eventy atd.
}

// ----------------------------------------
// VYKRESLENÍ GRIDU + POLE + AGENT
// ----------------------------------------

function drawGrid() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (mapLoaded) {
    ctx.save();

    // 1) Nejprve vyplníme celé plátno emerald barvou
    ctx.fillStyle = "rgba(16, 185, 129, 0.45)"; // emerald, průhledný
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2) Pomocí silhouety USA necháme emerald jen tam, kde je mapa
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mapImage, 0, 0, canvas.width, canvas.height);

    // 3) Tmavé pozadí pod mapu
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.restore();
  } else {
    // fallback – když se mapa ještě nenačetla
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Grid
  ctx.strokeStyle = "#1f2933";
  ctx.lineWidth = 1;

  for (let x = 0; x <= GRID_COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * TILE_SIZE, 0);
    ctx.lineTo(x * TILE_SIZE, GRID_ROWS * TILE_SIZE);
    ctx.stroke();
  }

  for (let y = 0; y <= GRID_ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * TILE_SIZE);
    ctx.lineTo(GRID_COLS * TILE_SIZE, y * TILE_SIZE);
    ctx.stroke();
  }

  // Infikovaná pole
  infectedTiles.forEach((tile) => {
    ctx.fillStyle = "rgba(239, 68, 68, 0.7)"; // červená
    ctx.fillRect(
      tile.x * TILE_SIZE + 4,
      tile.y * TILE_SIZE + 4,
      TILE_SIZE - 8,
      TILE_SIZE - 8
    );
  });

  // MLHA
  fogTiles.forEach((index) => {
    const x = index % GRID_COLS;
    const y = Math.floor(index / GRID_COLS);

    ctx.fillStyle = "rgba(120, 30, 200, 0.35)"; // fialová mlha (post-apo vibe)
    ctx.fillRect(
      x * TILE_SIZE,
      y * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE
    );
  });

  // MĚSTA + POPISKY
  drawCities(ctx);

  // VLAKOVÉ TRASY
  drawTrainLines(ctx);

  // Agent
  ctx.fillStyle = agent.color;
  ctx.fillRect(
    agent.x * TILE_SIZE + 4,
    agent.y * TILE_SIZE + 4,
    TILE_SIZE - 8,
    TILE_SIZE - 8
  );
}

// HERNI SMYČKA
function gameLoop() {
  update();
  spreadFog();
  drawGrid();
  requestAnimationFrame(gameLoop);
}

// Start
initFog();
document.getElementById("agentPos").textContent = `${agent.x},${agent.y}`;
gameLoop();
