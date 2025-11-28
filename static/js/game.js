
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
const REAL_MS_PER_GAME_MINUTE = 1500; // 1 herní minuta = 1.5 reálné sekundy (rychlejší testování)
let lastFrameMs = performance.now();
let timeAccumulatorMs = 0;

const LAND_MIN_X = 3;
const LAND_MAX_X = 941;
const LAND_MIN_Y = 53;
const LAND_MAX_Y = 568;

let cities = [];
let cityByName = new Map();
let hoveredCity = null;
let pendingTravel = null;
let pendingTravelTimer = null;
let purchasedTicketKey = null;
let travelAnimation = null;
let hoveredLineKey = null;

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

function formatTravelDuration(totalMinutes) {
  if (totalMinutes === undefined || totalMinutes === null) {
    return "-";
  }

  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  return `${hours} h ${minutes} min`;
}


// update size label only if element exists (not present on the current page)
const mapSizeEl = document.getElementById("mapSize");
if (mapSizeEl) {
  mapSizeEl.textContent = `${GRID_COLS} × ${GRID_ROWS} polí`;
}

const travelOverlayEl = document.getElementById("travelOverlay");
const travelFromLabel = document.getElementById("travelFromLabel");
const travelToLabel = document.getElementById("travelToLabel");
const travelLineLabel = document.getElementById("travelLineLabel");
const travelDistanceLabel = document.getElementById("travelDistanceLabel");
const travelDepartLabel = document.getElementById("travelDepartLabel");
const travelArriveLabel = document.getElementById("travelArriveLabel");
const travelClockLabel = document.getElementById("travelClockLabel");
const travelProgressBar = document.getElementById("travelProgressBar");
const travelProgressFrom = document.getElementById("travelProgressFrom");
const travelProgressTo = document.getElementById("travelProgressTo");

if (canvas) {
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    hoveredCity = findCityAtPixel(x, y);
  });

  canvas.addEventListener("mouseleave", () => {
    hoveredCity = null;
  });
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

// Najde město podle pixelů (pro hover)
function findCityAtPixel(px, py) {
  if (!Array.isArray(cities) || cities.length === 0) return null;

  let nearest = null;
  let nearestDist = Infinity;

  for (const city of cities) {
    const baseRadius = city.importance === 1 ? 4.5 : 3;
    const hitRadius = baseRadius + 5; // trochu tolerance pro hover
    const dx = px - city.px;
    const dy = py - city.py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= hitRadius && dist < nearestDist) {
      nearest = city;
      nearestDist = dist;
    }
  }

  return nearest;
}

function findLineAtPixel(px, py) {
  if (!Array.isArray(trainLines) || trainLines.length === 0) return null;

  const currentCity = getCityAt(agent.x, agent.y);
  const currentCityName = currentCity ? currentCity.name : null;
  if (!currentCityName) return null;

  const hitThreshold = 6; // px tolerance

  for (const line of trainLines) {
    const fromName =
      line.from?.name ||
      line.from_name ||
      line.fromCityName ||
      line.from ||
      line.from_city?.name;
    const toName =
      line.to?.name ||
      line.to_name ||
      line.toCityName ||
      line.to ||
      line.to_city?.name;

    const fromCity = cityByName.get(fromName);
    const toCity = cityByName.get(toName);
    if (!fromCity || !toCity) continue;

    const isConnectedToAgent =
      fromCity.name === currentCityName || toCity.name === currentCityName;
    if (!isConnectedToAgent) continue;

    // vzdálenost bodu od úsečky
    const dx = toCity.px - fromCity.px;
    const dy = toCity.py - fromCity.py;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((px - fromCity.px) * dx + (py - fromCity.py) * dy) / len2));
    const projX = fromCity.px + t * dx;
    const projY = fromCity.py + t * dy;
    const dist = Math.hypot(px - projX, py - projY);
    if (dist <= hitThreshold) {
      return `${fromCity.name}__${toCity.name}`;
    }
  }

  return null;
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

function findDepartureToCity(destinationName) {
  if (!destinationName || !Array.isArray(timetableDepartures)) return null;
  const matches = timetableDepartures.filter(
    (dep) =>
      dep?.to_city?.name === destinationName &&
      dep.departure_minutes > gameMinutes
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => a.departure_minutes - b.departure_minutes);
  return matches[0];
}

function makeDepartureKey(dep) {
  if (!dep) return null;
  const from = dep.from_city?.name || dep.from || "";
  const to = dep.to_city?.name || dep.to || "";
  const time = dep.departure_minutes;
  if (from === "" || to === "" || time === undefined || time === null) return null;
  return `${from}__${to}__${time}`;
}

function scheduleTravelFromDeparture(dep) {
  if (!dep) return;
  const destinationName = dep.to_city?.name;
  const destinationCity = destinationName ? cityByName.get(destinationName) : null;
  if (!destinationCity) return;

  scheduleTravel(
    destinationCity,
    dep.departure_minutes,
    dep.travel_minutes,
    {
      fromName: dep.from_city?.name,
      toName: dep.to_city?.name,
      lineType: dep.line_type,
      distance: dep.distance_units,
    }
  );
}

function travelUsingTimetable(targetCity) {
  if (!targetCity) return;
  const depInfo = findDepartureToCity(targetCity.name);
  if (depInfo && depInfo.travel_minutes !== undefined && depInfo.travel_minutes !== null) {
    scheduleTravel(
      targetCity,
      depInfo.departure_minutes,
      depInfo.travel_minutes,
      {
        fromName: depInfo.from_city?.name,
        toName: depInfo.to_city?.name,
        lineType: depInfo.line_type,
        distance: depInfo.distance_units,
      }
    );
  } else {
    travelToCity(targetCity);
  }
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

function travelToCity(targetCity, options = {}) {
  if (!targetCity) return;

  agent.x = targetCity.x;
  agent.y = targetCity.y;
  updateSidebar();
  updateTimetable();
  console.log(`Přesun vlakem do: ${targetCity.name}`);
}

function scheduleTravel(targetCity, departureMinutes, travelMinutes, meta = {}) {
  const currentCity = getCityAt(agent.x, agent.y);
  const fromName = meta.fromName || currentCity?.name || "Neznámé";
  const toName = meta.toName || targetCity?.name || "Neznámé";
  const lineType = meta.lineType || "-";
  const distance = meta.distance || null;

  if (!targetCity || departureMinutes === undefined || departureMinutes === null) {
    return travelToCity(targetCity);
  }
  const travel = {
    city: targetCity,
    departureMinutes,
    travelMinutes: travelMinutes !== undefined && travelMinutes !== null ? travelMinutes : 0,
    fromName,
    toName,
    lineType,
    distance,
  };

  // Pokud už je čas odjezdu, spustíme animaci hned
  if (gameMinutes >= departureMinutes) {
    startTravelAnimation(travel);
    return;
  }

  pendingTravel = travel;
  if (pendingTravelTimer) {
    clearTimeout(pendingTravelTimer);
    pendingTravelTimer = null;
  }
  const delayMs = Math.max(0, (departureMinutes - gameMinutes) * REAL_MS_PER_GAME_MINUTE);
  pendingTravelTimer = setTimeout(() => {
    startTravelAnimation(travel);
    pendingTravel = null;
    pendingTravelTimer = null;
  }, delayMs);
  console.log(
    `Naplánována cesta do ${toName} v ${formatGameTime(departureMinutes)} (doba ${travelMinutes} min)`
  );
}

// ----------------------------------------
// Vstup z klávesnice
// ----------------------------------------

window.addEventListener("keydown", (e) => {
  switch (e.key) {
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

  travelUsingTimetable(destination);
}

// ----------------------------------------
// Vykreslení měst (čtverečky + labely)
// ----------------------------------------

function drawCities(ctx) {
  const currentCity = getCityAt(agent.x, agent.y);
  const currentRegion = currentCity ? currentCity.region : null;
  const reachableNames = new Set();
  if (currentCity) {
    reachableNames.add(currentCity.name);
    const conns = getConnections(currentCity.name);
    conns.forEach((c) => reachableNames.add(c.name));
  }
  const blinkPhase = Math.abs(Math.sin(performance.now() / 900)); // pomalejší pulz

  cities.forEach((city) => {
    const isKeyCity = city.importance === 1;
    const isHovered = hoveredCity && hoveredCity.name === city.name;
    const baseRadius = isKeyCity ? 4.5 : 3;
    const radius = isHovered ? baseRadius + 1 : baseRadius;

    // fill
    ctx.fillStyle = isCityInFog(city) ? "#DC2626" : "#22c55e";
    ctx.beginPath();
    ctx.arc(city.px, city.py, radius, 0, Math.PI * 2);
    ctx.fill();

    // outline – tmavá šedá
    ctx.strokeStyle = "#0f172a";   // slate-900
    ctx.lineWidth = isKeyCity ? 1.2 : 1;
    ctx.stroke();

    // zvýraznění agenta v aktuálním městě
    if (currentCity && city.name === currentCity.name) {
      ctx.beginPath();
      const ringAlpha = 0.35 + 0.65 * blinkPhase;
      ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha.toFixed(2)})`;
      ctx.lineWidth = 2.2;
      ctx.arc(city.px, city.py, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  // popisky
  // větší font pro nejdůležitější města
  ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  cities.forEach((city) => {
    const isHovered = hoveredCity && hoveredCity.name === city.name;
    const reachable = reachableNames.has(city.name);
    const alwaysShow = city.importance === 1 || reachable;
    const shouldShow = alwaysShow || isHovered;

    if (!shouldShow) {
      return; // skryj města mimo dostupné/hlavní, pokud nad nimi není kurzor
    }

    const label = city.name;
    const isKeyCity = city.importance === 1;
    const fontSize = isKeyCity ? 12 : 10;
    ctx.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;

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

  const currentCity = getCityAt(agent.x, agent.y);
  const currentCityName = currentCity ? currentCity.name : null;
  if (!currentCityName) {
    return; // bez aktuálního města nevykresluj žádné trasy
  }

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

    // Filtrace: zobraz pouze linky navázané na aktuální město
    const isConnectedToAgent =
      fromCity.name === currentCityName || toCity.name === currentCityName;
    if (!isConnectedToAgent) {
      continue;
    }

    // 🔹 Styl: zvýrazněné linky z aktuálního města (všechny bílé, lehce průhledné)
    const isExpress = line.line_type === "express";
    const isRare = line.frequency_minutes >= 90;

    const lineKey = `${fromCity.name}__${toCity.name}`;
    const isHovered = hoveredLineKey === lineKey;

    if (isHovered) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.95)"; // silnější bílá
      ctx.lineWidth = 3.2;
    } else {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
      if (isExpress) {
        ctx.lineWidth = 2.2;
      } else if (isRare) {
        ctx.lineWidth = 1.4;
      } else {
        ctx.lineWidth = 1.7;
      }
    }

    ctx.beginPath();
    ctx.moveTo(fromCity.px, fromCity.py);
    ctx.lineTo(toCity.px, toCity.py);
    ctx.stroke();
  }

  ctx.restore();
}

function renderTravelOverlay(progress, currentMinutes) {
  if (!travelOverlayEl || !travelProgressBar) return;
  if (!travelAnimation) {
    travelOverlayEl.classList.remove("visible");
    return;
  }

  travelOverlayEl.classList.add("visible");

  const p = Math.min(1, Math.max(0, progress));
  travelProgressBar.style.width = `${p * 100}%`;

  if (travelClockLabel) {
    const displayMinutes = Math.floor(currentMinutes);
    travelClockLabel.textContent = formatGameTime(displayMinutes);
  }

  if (travelProgressFrom) {
    travelProgressFrom.textContent = travelAnimation.meta.fromName || "-";
  }
  if (travelProgressTo) {
    travelProgressTo.textContent = travelAnimation.meta.toName || "-";
  }
}

function startTravelAnimation(travel) {
  if (!travel) return;
  console.log("Start animace cestovani", travel);

  // zajisti, že případný čekající timer nezůstane viset
  if (pendingTravelTimer) {
    clearTimeout(pendingTravelTimer);
    pendingTravelTimer = null;
  }

  const startMinutes = Math.max(gameMinutes, travel.departureMinutes);
  const durationMinutes = Math.max(0, travel.travelMinutes || 0);
  const arrivalMinutes = startMinutes + durationMinutes;
  const distance = travel.distance || 0;

  // Délka animace podle jízdní doby: 1 h ~ 5s, 7 h ~ 15s, min ~3s
  const travelHours = durationMinutes / 60;
  let durationMs;
  if (travelHours <= 1) {
    durationMs = 3000 + travelHours * (5000 - 3000); // 0–1 h => 3–5 s
  } else {
    const clamped = Math.min(travelHours, 7);
    const extraHours = clamped - 1;
    durationMs = 5000 + (extraHours / 6) * (15000 - 5000); // 1–7 h => 5–15 s
  }
  durationMs = Math.max(3000, Math.min(15000, durationMs));

  travelAnimation = {
    city: travel.city,
    startMinutes,
    arrivalMinutes,
    startMs: performance.now(),
    durationMs,
    meta: {
      fromName: travel.fromName,
      toName: travel.toName,
      lineType: travel.lineType,
      distance: distance,
      departLabel: formatGameTime(travel.departureMinutes),
      arriveLabel: formatGameTime(arrivalMinutes),
    },
  };

  // vyplnit overlay statické údaje
  if (travelFromLabel) travelFromLabel.textContent = travel.fromName || "-";
  if (travelToLabel) travelToLabel.textContent = travel.toName || "-";
  if (travelLineLabel) travelLineLabel.textContent = travel.lineType || "-";
  if (travelDistanceLabel) {
    travelDistanceLabel.textContent = distance ? `${distance.toFixed(1)} mi` : "-";
  }
  if (travelDepartLabel) travelDepartLabel.textContent = travelAnimation.meta.departLabel;
  if (travelArriveLabel) travelArriveLabel.textContent = travelAnimation.meta.arriveLabel;

  renderTravelOverlay(0, startMinutes);
}

function finishTravelAnimation() {
  if (!travelAnimation) return;
  console.log("Dokonceni animace cestovani", travelAnimation);

  // nastavit finální čas a provést přesun
  gameMinutes = travelAnimation.arrivalMinutes;
  const targetCity = travelAnimation.city;
  travelAnimation = null;

  renderTravelOverlay(1, gameMinutes);
  travelOverlayEl?.classList.remove("visible");

  // po dojetí resetni koupený ticket – v nové destinaci nedává smysl
  purchasedTicketKey = null;

  travelToCity(targetCity);
  renderTimetablePage();
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
  const now = performance.now();
  const deltaMs = now - lastFrameMs;
  lastFrameMs = now;

  // Pokud zrovna probíhá animace přesunu, řídí čas animace
  if (travelAnimation) {
    const elapsed = now - travelAnimation.startMs;
    const t = travelAnimation.durationMs > 0 ? Math.min(1, elapsed / travelAnimation.durationMs) : 1;
    const eased = t; // lineární
    gameMinutes = travelAnimation.startMinutes + (travelAnimation.arrivalMinutes - travelAnimation.startMinutes) * eased;

    renderTravelOverlay(eased, gameMinutes);

    if (t >= 1) {
      finishTravelAnimation();
    }
    return;
  }

  timeAccumulatorMs += deltaMs;

  let advancedMinutes = 0;
  while (timeAccumulatorMs >= REAL_MS_PER_GAME_MINUTE) {
    timeAccumulatorMs -= REAL_MS_PER_GAME_MINUTE;
    gameMinutes += 1;
    advancedMinutes += 1;
  }

  if (advancedMinutes > 0) {
    renderTimetablePage();
    // průběžně aktualizujeme tabuli bez resetu stránky
    updateTimetable(false);
  }

  // realizace naplánované cesty ve chvíli odjezdu -> spustit animaci
  if (pendingTravel && gameMinutes >= pendingTravel.departureMinutes) {
    if (pendingTravelTimer) {
      clearTimeout(pendingTravelTimer);
      pendingTravelTimer = null;
    }
    startTravelAnimation(pendingTravel);
    pendingTravel = null;
  }
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
      travelUsingTimetable(targetCity);
    });

    listEl.appendChild(li);
  });
}

function renderTimetablePage() {
  // Nevykresluj tabulku během animace přesunu (čas se řídí animací)
  if (travelAnimation) return;

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

  const departures = (timetableDepartures || []).filter(
    (dep) => dep.departure_minutes > gameMinutes
  );

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
    travelTd.textContent = formatTravelDuration(dep.travel_minutes);

    // Příjezd
    const arrivalTd = document.createElement("td");
    if (dep.travel_minutes !== undefined && dep.travel_minutes !== null) {
      arrivalTd.textContent = formatGameTime(dep.departure_minutes + dep.travel_minutes);
    } else {
      arrivalTd.textContent = "-";
    }

    const destinationName = dep.to_city?.name;
    const destinationCity = destinationName ? cityByName.get(destinationName) : null;
    const depKey = makeDepartureKey(dep);
    const hasTicket = depKey ? purchasedTicketKey === depKey : false;

    if (destinationCity) {
      tr.style.cursor = "pointer";
      tr.title = `Cestovat do ${destinationCity.name}`;
      tr.addEventListener("click", () => {
        scheduleTravelFromDeparture(dep);
      });
      tr.addEventListener("mouseenter", () => {
        const key = `${dep.from_city?.name}__${dep.to_city?.name}`;
        hoveredLineKey = key;
      });
      tr.addEventListener("mouseleave", () => {
        hoveredLineKey = null;
      });
    }

    // Ticket
    const ticketTd = document.createElement("td");
    if (hasTicket) {
      ticketTd.textContent = "🎟️ Koupeno";
    } else {
      const buyBtn = document.createElement("button");
      buyBtn.textContent = "Koupit ticket";
      buyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!depKey) return;

        if (purchasedTicketKey && purchasedTicketKey !== depKey) {
          const confirmNew = window.confirm("Opravdu chceš koupit jinou jízdenku? Původní se tímto stornuje.");
          if (!confirmNew) {
            return;
          }
        }

        purchasedTicketKey = depKey;
        scheduleTravelFromDeparture(dep);
        renderTimetablePage();
      });
      ticketTd.appendChild(buyBtn);
    }

    // Append do řádku
    tr.appendChild(timeTd);
    tr.appendChild(fromTd);
    tr.appendChild(toTd);
    tr.appendChild(typeTd);
    tr.appendChild(distTd);
    tr.appendChild(travelTd);
    tr.appendChild(arrivalTd);
    tr.appendChild(ticketTd);

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

async function updateTimetable(resetPage = true) {
  const city = getCityAt(agent.x, agent.y);

  if (resetPage) {
    timetablePage = 1;
  }

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
