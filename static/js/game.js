
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const mapImage = new Image();
let mapLoaded = false;
mapImage.src = "/static/assets/usa_sil.png"; // cesta k silhouetě USA

mapImage.addEventListener("load", () => {
  mapLoaded = true;
  console.log("Map image loaded");
});

const TILE_SIZE = 8;
const GRID_COLS = 128; // 1024 / 8
const GRID_ROWS = 72;  // 576 / 8

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = MINUTES_PER_DAY * 7;

// Po 08:00 = start
let gameMinutes = 8 * 60; // 8:00 první den (Po)

const LAND_MIN_X = 3;
const LAND_MAX_X = 941;
const LAND_MIN_Y = 53;
const LAND_MAX_Y = 568;

let cities = [];
let cityByName = new Map();

function formatGameTime(totalMinutes) {
  const dayNames = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
  const minutesNorm = ((totalMinutes % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;

  const dayIndex = Math.floor(minutesNorm / MINUTES_PER_DAY);
  const minuteOfDay = minutesNorm % MINUTES_PER_DAY;
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");

  return `${dayNames[dayIndex]} ${hh}:${mm}`;
}


// update size label only if element exists (not present on the current page)
const mapSizeEl = document.getElementById("mapSize");
if (mapSizeEl) {
  mapSizeEl.textContent = `${GRID_COLS} × ${GRID_ROWS} polí`;
}

// ----------------------------------------
// POST-APO MLHA – základní systém
// ----------------------------------------

const fogSpreadSpeed = 0.001; // rychlost šíření mlhy
let fogTiles = new Set();     // tile indexy mlhy

// vlakové linky z backendu
let trainLines = []; // naplní se v init()
let connectionsByCityName = new Map();
let timetableDepartures = [];
let timetablePage = 1;
const TIMETABLE_PAGE_SIZE = 10;
const TIMETABLE_LIMIT = 30;

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

// Města – používáme přímo px/py z cities.js
// const cities = CITIES.map((c) => {
//   const px = c.px;
//   const py = c.py;

//   // x,y dopočítáme z px/py, aby vždy seděly s TILE_SIZE
//   const x = Math.round(px / TILE_SIZE);
//   const y = Math.round(py / TILE_SIZE);

//   return {
//     ...c,
//     px,
//     py,
//     x,
//     y,
//   };
// });

// rychlé lookupy podle názvu města
// const cityByName = new Map(cities.map((c) => [c.name, c]));


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

// Postaví mapu spojů: název města -> pole cílových měst (lokální objekty z cities)
function buildConnectionsMap() {
  connectionsByCityName = new Map();

  if (!Array.isArray(trainLines) || trainLines.length === 0) {
    return;
  }

  for (const line of trainLines) {
    // ❗ Stejná logika jako v drawTrainLines
    const fromName =
      line.from?.name ||
      line.from_name ||
      line.fromCityName ||
      line.from_city?.name ||
      line.from_city_name ||
      line.from;

    const toName =
      line.to?.name ||
      line.to_name ||
      line.toCityName ||
      line.to_city?.name ||
      line.to_city_name ||
      line.to;

    if (!fromName || !toName) continue;

    const fromCity = cityByName.get(fromName);
    const toCity   = cityByName.get(toName);
    if (!fromCity || !toCity) continue;

    // obousměrné spojení
    if (!connectionsByCityName.has(fromCity.name)) {
      connectionsByCityName.set(fromCity.name, []);
    }
    if (!connectionsByCityName.has(toCity.name)) {
      connectionsByCityName.set(toCity.name, []);
    }

    connectionsByCityName.get(fromCity.name).push(toCity);
    connectionsByCityName.get(toCity.name).push(fromCity);
  }

  // Odstranění duplicit (kdyby byla linka tam i zpět)
  for (const [name, arr] of connectionsByCityName.entries()) {
    const seen = new Set();
    const unique = [];
    for (const c of arr) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      unique.push(c);
    }
    connectionsByCityName.set(name, unique);
  }
}

// Spočítá nejbližší odjezdy vlaků z daného města
function computeNextDeparturesFromCity(city, limit = 5) {
  if (!city || !Array.isArray(trainLines) || trainLines.length === 0) {
    return [];
  }

  const departures = [];

  for (const line of trainLines) {
    const fromName =
      line.from?.name ||
      line.from_name ||
      line.fromCityName ||
      line.from;

    const toName =
      line.to?.name ||
      line.to_name ||
      line.toCityName ||
      line.to;

    if (!fromName || !toName) continue;

    let originName = null;
    let destName = null;

    if (fromName === city.name) {
      originName = fromName;
      destName = toName;
    } else if (toName === city.name) {
      originName = toName;
      destName = fromName;
    } else {
      continue; // tato linka z aktuálního města nevede
    }

    const destCity = cityByName.get(destName);
    if (!destCity) continue;

    const freq = line.frequency_minutes || 60;

    // první odjezd >= aktuální čas
    const base = Math.ceil(gameMinutes / freq) * freq;

    // vygenerujeme pár dalších odjezdů dopředu
    for (let i = 0; i < 5; i++) {
      const depMinutes = base + i * freq;
      departures.push({
        departureMinutes: depMinutes,
        fromCity: city,
        toCity: destCity,
        line,
      });
    }
  }

  // seřadíme podle nejbližšího odjezdu
  departures.sort((a, b) => a.departureMinutes - b.departureMinutes);

  // vezmeme jen prvních N
  return departures.slice(0, limit);
}


// Vrátí pole měst, na která vede spoj z daného města
function getConnections(cityName) {
  return connectionsByCityName.get(cityName) || [];
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
    updateSidebar();
    updateTimetable();
  } 
}

function travelToCity(targetCity) {
  if (!targetCity) return;
  agent.x = targetCity.x;
  agent.y = targetCity.y;
  updateSidebar();
  updateTimetable();
  console.log(`Přesun vlakem do: ${targetCity.name}`);
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

  // tady bychom časově mohli posunout gameMinutes na depature/time travel,
  // zatím necháme jen „teleport“, ať to nezkomplikuju
  travelToCity(destination);
}

// ----------------------------------------
// Vykreslení měst (čtverečky + labely)
// ----------------------------------------

function drawCities(ctx) {
  cities.forEach((city) => {
    // fill
    ctx.fillStyle = isCityInFog(city) ? "#DC2626" : "#22c55e";
    ctx.beginPath();
    ctx.arc(city.px, city.py, 3, 0, Math.PI * 2);
    ctx.fill();

    // outline – tmavá šedá
    ctx.strokeStyle = "#0f172a";   // slate-900
    ctx.lineWidth = 1;
    ctx.stroke();
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

    ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
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

// Vykreslení měst načtených z backendu

async function fetchCities() {
  const res = await fetch("/api/cities");
  if (!res.ok) {
    console.error("Nepodařilo se načíst města.");
    return [];
  }
  return await res.json();
}

// ----------------------------------------
// Vykreslení vlakových tras
// ----------------------------------------

async function fetchTrainLines() {
  try {
    const res = await fetch("/api/trainlines");
    if (!res.ok) {
      console.error("Failed to load trainlines");
      return [];
    }
    const data = await res.json();
    console.log(`Načteno ${data.length} vlakových linek.`);
    return data;
  } catch (err) {
    console.error("Error loading trainlines:", err);
    return [];
  }
}

function drawTrainLines(ctx, trainLines) {
  if (!Array.isArray(trainLines) || trainLines.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";

  for (const line of trainLines) {
    // snažíme se získat jméno města z různých možných formátů
    const fromName =
      line.from?.name ||
      line.from_name ||
      line.fromCityName ||
      line.from; // fallback

    const toName =
      line.to?.name ||
      line.to_name ||
      line.toCityName ||
      line.to; // fallback

    const fromCity = cityByName.get(fromName);
    const toCity = cityByName.get(toName);

    if (!fromCity || !toCity) {
      // když backend pošle něco, co nespárujeme, přeskočíme
      continue;
    }

    const isExpress = line.line_type === "express";
    const isRare = line.frequency_minutes >= 90;

    // 🔹 Styl: všechno šedé, ale trochu odlišné
    if (isExpress) {
      // výraznější express linky
      ctx.strokeStyle = "rgba(148, 163, 184, 0.9)"; // slate-400
      ctx.lineWidth = 2;
    } else if (isRare) {
      // zřídkavé linky = tenké a tmavší
      ctx.strokeStyle = "rgba(75, 85, 99, 0.4)"; // slate-600
      ctx.lineWidth = 1;
    } else {
      // běžné regionální linky
      ctx.strokeStyle = "rgba(107, 114, 128, 0.6)"; // slate-500
      ctx.lineWidth = 1.3;
    }

    ctx.beginPath();
    ctx.moveTo(fromCity.px, fromCity.py);
    ctx.lineTo(toCity.px, toCity.py);
    ctx.stroke();
  }

  ctx.restore();
}

async function fetchTimetableForCurrentCity(limit = TIMETABLE_LIMIT) {
  const city = getCityAt(agent.x, agent.y);
  if (!city) {
    return null;
  }

  const res = await fetch(`/api/timetable?city_id=${city.id}&minutes=${gameMinutes}&limit=${limit}`);
  if (!res.ok) {
    console.error("Nepodařilo se načíst jízdní řád.");
    return null;
  }
  return await res.json();
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

    // nejdřív tmavé pozadí
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // potom přímo obrázek mapy tak, jak je
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(mapImage, 0, 0, canvas.width, canvas.height);

    ctx.restore();
  } else {
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Grid
  ctx.strokeStyle = "rgba(31, 41, 51, 0.3)";  // slabší viditelnost
  ctx.lineWidth = 0.4;

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

  // VLAKOVÉ TRASY (pod městy, nad mlhou)
  drawTrainLines(ctx, trainLines);

  // MĚSTA + POPISKY
  drawCities(ctx);

  // AGENT
  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  const agentSize = 6; // viditelná velikost agenta v px
  const agentScreenX = agent.x * TILE_SIZE + (TILE_SIZE - agentSize) / 2;
  const agentScreenY = agent.y * TILE_SIZE + (TILE_SIZE - agentSize) / 2;

  // vnitřní barva agenta
  ctx.fillStyle = agent.color;
  ctx.fillRect(agentScreenX, agentScreenY, agentSize, agentSize);

  // bílý rámeček
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(agentScreenX, agentScreenY, agentSize, agentSize);

  ctx.restore();
}

// Ovládací panel
function updateSidebar() {
  const posEl = document.getElementById("agentPos");
  const cityNameEl = document.getElementById("currentCityName");
  const listEl = document.getElementById("connectionsList");
  const noteEl = document.getElementById("noConnectionsNote");

  if (!posEl || !cityNameEl || !listEl || !noteEl) return;

  // souřadnice agenta
  posEl.textContent = `${agent.x},${agent.y}`;

  // zjistíme, jestli stojí ve městě
  const city = getCityAt(agent.x, agent.y);

  // vyčistíme seznam spojů
  listEl.innerHTML = "";
  noteEl.textContent = "";

  if (!city) {
    cityNameEl.textContent = "-";
    noteEl.textContent = "Agent nestojí ve městě.";
    return;
  }

  cityNameEl.textContent = city.name;

  const connections = getConnections(city.name);

  if (!connections || connections.length === 0) {
    noteEl.textContent = "Z tohoto města nevedou žádné vlakové spoje.";
    return;
  }

  // 🔹 Vytvoříme klikatelné položky – klik = přesun agenta do města
  connections.forEach((targetCity) => {
    const li = document.createElement("li");
    li.textContent = targetCity.name;
    li.style.cursor = "pointer";

    li.addEventListener("click", () => {
      travelToCity(targetCity);
    });

    listEl.appendChild(li);
  });
}

function renderTimetablePage() {
  const timeEl = document.getElementById("currentTimeLabel");
  const tbody = document.getElementById("timetableBody");
  const paginationEl = document.getElementById("timetablePagination");
  if (!timeEl || !tbody) return;

  // Aktualizace zobrazeného času
  timeEl.textContent = formatGameTime(gameMinutes);
  tbody.innerHTML = "";
  if (paginationEl) paginationEl.innerHTML = "";

  const city = getCityAt(agent.x, agent.y);

  // Pokud agent nestojí ve městě
  if (!city) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "Agent nestojí ve městě.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const departures = timetableDepartures;

  if (!departures || departures.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "Z tohoto města nejedou žádné vlaky.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(departures.length / TIMETABLE_PAGE_SIZE));
  if (timetablePage > totalPages) timetablePage = totalPages;

  const start = (timetablePage - 1) * TIMETABLE_PAGE_SIZE;
  const end = start + TIMETABLE_PAGE_SIZE;
  const pageItems = departures.slice(start, end);

  // Vykreslení výsledků
  pageItems.forEach((dep) => {
    const tr = document.createElement("tr");

    // Odjezd
    const timeTd = document.createElement("td");
    timeTd.textContent = formatGameTime(dep.departure_minutes);

    // Z
    const fromTd = document.createElement("td");
    fromTd.textContent = dep.from_city.name;

    // Do
    const toTd = document.createElement("td");
    toTd.textContent = dep.to_city.name;

    // Typ linky
    const typeTd = document.createElement("td");
    typeTd.textContent = dep.line_type;

    // Vzdálenost
    const distTd = document.createElement("td");
    distTd.textContent = dep.distance_units !== undefined
      ? dep.distance_units.toFixed(1) + " mi"
      : "-";

    // Doba cestování
    const travelTd = document.createElement("td");
    travelTd.textContent = dep.travel_minutes !== undefined
      ? dep.travel_minutes + " min"
      : "-";

    // Příjezd
    const arrivalTd = document.createElement("td");
    if (dep.travel_minutes !== undefined && dep.travel_minutes !== null) {
      arrivalTd.textContent = formatGameTime(dep.departure_minutes + dep.travel_minutes);
    } else {
      arrivalTd.textContent = "-";
    }

    const destinationName = dep.to_city?.name;
    const destinationCity = destinationName ? cityByName.get(destinationName) : null;

    if (destinationCity) {
      tr.style.cursor = "pointer";
      tr.title = `Cestovat do ${destinationCity.name}`;
      tr.addEventListener("click", () => {
        travelToCity(destinationCity);
      });
    }

    // Append do řádku
    tr.appendChild(timeTd);
    tr.appendChild(fromTd);
    tr.appendChild(toTd);
    tr.appendChild(typeTd);
    tr.appendChild(distTd);
    tr.appendChild(travelTd);
    tr.appendChild(arrivalTd);

    tbody.appendChild(tr);
  });

  if (paginationEl) {
    const info = document.createElement("span");
    info.textContent = `Strana ${timetablePage}/${totalPages}`;

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "←";
    prevBtn.disabled = timetablePage <= 1;
    prevBtn.addEventListener("click", () => {
      if (timetablePage > 1) {
        timetablePage -= 1;
        renderTimetablePage();
      }
    });

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "→";
    nextBtn.disabled = timetablePage >= totalPages;
    nextBtn.addEventListener("click", () => {
      if (timetablePage < totalPages) {
        timetablePage += 1;
        renderTimetablePage();
      }
    });

    paginationEl.appendChild(prevBtn);
    paginationEl.appendChild(info);
    paginationEl.appendChild(nextBtn);
  }
}

async function updateTimetable() {
  const city = getCityAt(agent.x, agent.y);

  // reset page on city change
  timetablePage = 1;

  // Načteme odjezdy z backendu
  timetableDepartures = await fetchTimetableForCurrentCity();

  renderTimetablePage();
}



// HERNI SMYČKA
function gameLoop() {
  update();
  spreadFog();
  drawGrid();
  requestAnimationFrame(gameLoop);
}

// Start – načtení mlhy, vlakových linek a pak teprve loop
async function init() {
  initFog();

  // 1) načteme města z backendu
  let rawCities = await fetchCities();

  // 2) dopočítáme x,y z px,py podle TILE_SIZE
  cities = rawCities.map((c) => {
    const px = c.px;
    const py = c.py;

    const x = Math.round(px / TILE_SIZE);
    const y = Math.round(py / TILE_SIZE);

    return {
      ...c,
      px,
      py,
      x,
      y,
    };
  });

  // 3) vytvoříme mapu podle jména
  cityByName = new Map(cities.map((c) => [c.name, c]));

  // 4) vybereme startovní město importance 3
  const importantCities = cities.filter((c) => c.importance === 3);
  const startCity =
    importantCities.length > 0
      ? importantCities[Math.floor(Math.random() * importantCities.length)]
      : cities[Math.floor(Math.random() * cities.length)];

  if (startCity) {
    agent.x = startCity.x;
    agent.y = startCity.y;
    console.log("Startovní město:", startCity.name);
  }

  // 5) načteme vlakové trasy
  trainLines = await fetchTrainLines();

  // 6) postavíme mapu spojů podle názvu města
  buildConnectionsMap();

  // 7) UI – sidebar + tabulka
  updateSidebar();
  await updateTimetable();

  gameLoop();
}



init();
