
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
let timetableRaised = false;

// Jednoduchá lokální reprezentace agenta (pro UI panel nahoře)
let levelConfig = [];
let agentStats = {
  level: 1,
  xp: 0,
  energy_current: 5,
};

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

function formatGameTimeHHMM(totalMinutes) {
  const minutesNorm = ((totalMinutes % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
  const minuteOfDay = minutesNorm % MINUTES_PER_DAY;
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");

  return `${hh}:${mm}`;
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

function formatLineTypeLabel(lineType) {
  const t = (lineType || "").toLowerCase();
  if (t === "express") return "Express";
  if (t === "intercity" || t === "ic" || t === "regional") return "Regional";
  return "Local";
}

function getLineTypeInfo(lineType) {
  const t = (lineType || "").toLowerCase();
  if (t === "express") {
    return {
      key: "express",
      symbol: "Ex",
      badgeClasses: "bg-red-900/70 border border-red-600/60 text-red-100",
    };
  }
  if (t === "intercity" || t === "ic" || t === "regional") {
    return {
      key: "regional",
      symbol: "Reg",
      badgeClasses: "bg-blue-900/60 border border-blue-500/60 text-blue-100 text-[11px] px-[6px] py-[2px]",
    };
  }
  return {
    key: "local",
    symbol: "Loc",
    badgeClasses: "bg-green-900/70 border border-green-600/60 text-green-100 text-[10px] px-[6px] py-[2px]",
  };
}

function formatCityLabel(name) {
  if (!name) return "-";
  const city = cityByName.get(name);
  if (city) {
    const state = city.state_shortcut || city.state;
    if (state) return `${city.name}, ${state}`;
    return city.name;
  }
  return name;
}

function getTrainLevel(lineType) {
  const t = (lineType || "").toLowerCase();
  if (t === "express") return 1;
  if (t === "intercity" || t === "ic" || t === "regional") return 2;
  return 3;
}

function getTrainSpeedMph(level) {
  if (level === 1) return 190;
  if (level === 2) return 100;
  return 60;
}

let lastSkyPhase = null;
function applySkyGradientForMinutes(totalMinutes) {
  if (!skyGradientEl) return;
  const minutesNorm = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(minutesNorm / 60);
  let phase = "day";
  if (hour >= 20 || hour < 6) {
    phase = "night";
  } else if (hour >= 18 && hour < 20) {
    phase = "dusk";
  } else if (hour >= 6 && hour < 8) {
    phase = "dawn";
  } else {
    phase = "day";
  }

  if (phase === lastSkyPhase) return;
  lastSkyPhase = phase;

  const gradients = {
    day: "linear-gradient(180deg, rgba(44,86,176,0.92) 0%, rgba(64,138,210,0.88) 50%, rgba(28,94,170,0.88) 100%)",
    dusk: "linear-gradient(180deg, rgba(255,196,128,0.9) 0%, rgba(255,134,136,0.84) 42%, rgba(92,88,168,0.78) 100%)",
    night: "linear-gradient(180deg, rgba(8,12,28,0.95) 0%, rgba(6,18,44,0.9) 50%, rgba(4,12,28,0.9) 100%)",
    dawn: "linear-gradient(180deg, rgba(255,226,189,0.85) 0%, rgba(245,191,211,0.75) 45%, rgba(154,205,255,0.7) 100%)",
  };

  skyGradientEl.style.background = gradients[phase] || gradients.day;
  if (nightOverlayEl) {
    nightOverlayEl.style.opacity = phase === "night" ? "0.75" : "0";
  }
  if (daySunOverlayEl) {
    daySunOverlayEl.style.opacity = phase === "day" ? "0.45" : "0";
  }
}

function travelProgressProfile(t, totalMinutes) {
  // Trapezový profil rychlosti: pomalý rozjezd (až 60 min), střed konstantní, delší dojezd se zpomalováním (až 60 min).
  const total = Math.max(totalMinutes || 0, 1);
  let accelFrac = Math.min(60 / total, 0.4);
  let decelFrac = Math.min(60 / total, 0.4);
  // ponecháme min. 20 % na střed
  const maxSum = 0.8;
  if (accelFrac + decelFrac > maxSum) {
    const scale = maxSum / (accelFrac + decelFrac);
    accelFrac *= scale;
    decelFrac *= scale;
  }
  const midFrac = Math.max(0.2, 1 - accelFrac - decelFrac);

  if (t <= 0) return 0;
  if (t >= 1) return 1;

  // Spočteme normalizační konstantu (plocha pod rychlostí = 1)
  const denom = 0.5 * accelFrac * accelFrac + accelFrac * midFrac + 0.5 * accelFrac * decelFrac;
  const a = denom > 0 ? 1 / denom : 0; // zrychlení
  const vCruise = a * accelFrac;       // rychlost v konstantní fázi

  if (t < accelFrac) {
    // fáze rozjezdu (kvadratický nárůst rychlosti)
    return 0.5 * a * t * t;
  }

  if (t < accelFrac + midFrac) {
    // konstantní rychlost
    const tau = t - accelFrac;
    const distAccel = 0.5 * a * accelFrac * accelFrac;
    return distAccel + vCruise * tau;
  }

  // fáze dojezdu (kvadratické zpomalování)
  const tau = t - accelFrac - midFrac;
  const distBeforeDecel = 0.5 * a * accelFrac * accelFrac + vCruise * midFrac;
  const decel = vCruise / decelFrac;
  const distDecel = vCruise * tau - 0.5 * decel * tau * tau;
  return Math.min(1, distBeforeDecel + distDecel);
}

function slugifyCityName(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

async function findCityImageUrl(city) {
  if (!city || !city.name) return null;
  const baseNames = [
    slugifyCityName(city.name),                      // např. "new_york"
    city.name.replace(/\s+/g, "_"),                  // zachová velká písmena: "New_York"
  ].filter(Boolean);
  const exts = ["webp", "jpg", "jpeg", "png"];

  for (const base of baseNames) {
    for (const ext of exts) {
      const url = `/static/assets/cities/${base}.${ext}`;
      const exists = await imageExists(url);
      if (exists) return url;
    }
  }
  return null;
}

function imageExists(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function setFrameAspectFromImage(img) {
  if (!img || !visualFrameEl) return;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w > 0 && h > 0) {
    visualFrameEl.style.aspectRatio = `${w} / ${h}`;
  }
}


// update size label only if element exists (not present on the current page)
const mapSizeEl = document.getElementById("mapSize");
if (mapSizeEl) {
  mapSizeEl.textContent = `${GRID_COLS} × ${GRID_ROWS} polí`;
}

const canvasBlock = document.getElementById("canvasBlock");
const cityBackdropEl = document.getElementById("cityBackdrop");
const visualFrameEl = document.getElementById("visualFrame");
const skyGradientEl = document.getElementById("skyGradient");
const nightOverlayEl = document.getElementById("nightOverlay");
const daySunOverlayEl = document.getElementById("daySunOverlay");
const timetableCardEl = document.getElementById("timetableCard");
const cityHubBtn = document.getElementById("cityHubBtn");
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
const travelTrainImg = document.getElementById("travelTrainImg");
const travelTopType = document.getElementById("travelTopType");
const travelTopSpeed = document.getElementById("travelTopSpeed");
const travelDurationLabel = document.getElementById("travelDurationLabel");
const infoCenterBtn = document.getElementById("infoCenterBtn");
const cityInfoPanel = document.getElementById("cityInfoPanel");
const cityInfoNameEl = document.getElementById("cityInfoName");
const cityInfoMetaEl = document.getElementById("cityInfoMeta");
const cityInfoDescEl = document.getElementById("cityInfoDesc");
const agentLevelEl = document.getElementById("agentLevel");
const agentXpLabelEl = document.getElementById("agentXpLabel");
const agentXpToNextEl = document.getElementById("agentXpToNext");
const agentXpBarFillEl = document.getElementById("agentXpBarFill");
const agentEnergyLabelEl = document.getElementById("agentEnergyLabel");
const agentEnergyBarFillEl = document.getElementById("agentEnergyBarFill");

if (canvas) {
  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    // přepočet pro případ, že je canvas vykreslen v jiném rozměru než jeho vnitřní bitmapa
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    hoveredCity = findCityAtPixel(x, y);
  });

  canvas.addEventListener("mouseleave", () => {
    hoveredCity = null;
  });
}

// ----------------------------------------
// POST-APO MLHA – základní systém
// ----------------------------------------

const fogSpreadSpeed = 0.001; // základní rychlost šíření mlhy
let fogTiles = new Set();     // tile indexy mlhy
let fogFrontier = [];         // fronta okrajových tileů pro nerovnoměrné šíření

// vlakové linky z backendu
let trainLines = []; // naplní se v init()
let connectionsByCityName = new Map();
let timetableDepartures = [];
const TIMETABLE_LIMIT = 10;

// Pomocná funkce pro index tile
function tileIndex(x, y) {
  return y * GRID_COLS + x;
}

// Inicializace – mlha začíná náhodně
function initFog() {
  fogTiles.clear();
  fogFrontier = [];
  const seeds = 3;
  for (let i = 0; i < seeds; i++) {
    const x = Math.floor(Math.random() * GRID_COLS);
    const y = Math.floor(Math.random() * GRID_ROWS);
    const idx = tileIndex(x, y);
    fogTiles.add(idx);
    fogFrontier.push({ x, y });
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
  const newFrontier = [];

  // mírně náhodný výběr z frontier, aby bylo šíření nerovnoměrné
  const samples = Math.max(1, Math.floor(fogFrontier.length * 0.35));
  for (let i = 0; i < samples; i++) {
    if (fogFrontier.length === 0) break;
    const idx = Math.floor(Math.random() * fogFrontier.length);
    const cell = fogFrontier.splice(idx, 1)[0];

    const neighbors = [
      { x: cell.x + 1, y: cell.y },
      { x: cell.x - 1, y: cell.y },
      { x: cell.x,     y: cell.y + 1 },
      { x: cell.x,     y: cell.y - 1 },
    ];

    neighbors.forEach((n) => {
      if (
        n.x >= 0 &&
        n.x < GRID_COLS &&
        n.y >= 0 &&
        n.y < GRID_ROWS
      ) {
        const tidx = tileIndex(n.x, n.y);
        if (!newFog.has(tidx)) {
          // s menší pravděpodobností – nerovnoměrné rozšiřování
          if (Math.random() < 0.6) {
            newFog.add(tidx);
            newFrontier.push({ x: n.x, y: n.y });
          }
        }
      }
    });
  }

  fogTiles = newFog;
  fogFrontier.push(...newFrontier);
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
      dep?.to_city?.name === destinationName
  );
  if (matches.length === 0) return null;
  matches.sort((a, b) => {
    const aNext = normalizeDepartureMinutes(a.departure_minutes, gameMinutes);
    const bNext = normalizeDepartureMinutes(b.departure_minutes, gameMinutes);
    return aNext - bNext;
  });
  const first = matches[0];
  const firstTime = normalizeDepartureMinutes(first?.departure_minutes, gameMinutes);
  return firstTime ? { ...first, _next_departure: firstTime } : first;
}

function normalizeDepartureMinutes(baseMinutes, nowMinutes) {
  if (baseMinutes === undefined || baseMinutes === null) return null;
  let candidate = baseMinutes;
  if (candidate <= nowMinutes) {
    const daysAhead = Math.floor((nowMinutes - candidate) / MINUTES_PER_DAY) + 1;
    candidate += daysAhead * MINUTES_PER_DAY;
  }
  return candidate;
}

function makeDepartureKey(dep, overrideDepartureMinutes) {
  if (!dep) return null;
  const from = dep.from_city?.name || dep.from || "";
  const to = dep.to_city?.name || dep.to || "";
  const time = overrideDepartureMinutes !== undefined ? overrideDepartureMinutes : dep.departure_minutes;
  if (from === "" || to === "" || time === undefined || time === null) return null;
  return `${from}__${to}__${time}`;
}

function setTimetableRaised(raised) {
  timetableRaised = !!raised;
  if (timetableCardEl) {
    timetableCardEl.classList.toggle("timetable-raised", timetableRaised);
  }
}

function scheduleTravelFromDeparture(dep) {
  if (!dep) return;
  const destinationName = dep.to_city?.name;
  const destinationCity = destinationName ? cityByName.get(destinationName) : null;
  if (!destinationCity) return;
  const departureMinutes = dep._next_departure ?? normalizeDepartureMinutes(dep.departure_minutes, gameMinutes);
  const effectiveDepMinutes = departureMinutes ?? dep.departure_minutes;

  scheduleTravel(
    destinationCity,
    effectiveDepMinutes,
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
  const depMinutes = depInfo?._next_departure || normalizeDepartureMinutes(depInfo?.departure_minutes, gameMinutes);
  if (depInfo && depMinutes !== null && depInfo.travel_minutes !== undefined && depInfo.travel_minutes !== null) {
    scheduleTravel(
      targetCity,
      depMinutes,
      depInfo.travel_minutes,
      {
        fromName: depInfo.from_city?.name,
        toName: depInfo.to_city?.name,
        lineType: depInfo.line_type,
        distance: depInfo.distance_units,
      }
    );
  } else {
    completeTravel(targetCity);
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
  showTimetablePanel(false); // po přesunu zpět na úvodní pohled s obrázkem
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

function showTimetablePanel(show) {
  if (!timetableCardEl || !canvasBlock) return;
  if (show) {
    timetableCardEl.classList.remove("hidden");
    canvasBlock.classList.add("hidden");
    if (cityInfoPanel) {
      cityInfoPanel.classList.add("hidden");
    }
  } else {
    timetableCardEl.classList.add("hidden");
    canvasBlock.classList.remove("hidden");
  }
  setTimetableRaised(false);
}

function getLevelCfg(level) {
  return levelConfig.find((c) => c.level === level);
}

function cumulativeXpForLevel(level) {
  const cfg = levelConfig;
  if (!cfg || cfg.length === 0) return 0;
  let total = 0;
  for (const entry of cfg) {
    if (entry.level > level) break;
    total += entry._xp_total_add || entry.xp_required || 0;
  }
  return total;
}

function normalizeLevelConfig(raw) {
  const sorted = Array.isArray(raw) ? [...raw].sort((a, b) => (a.level || 0) - (b.level || 0)) : [];
  let runningTotal = 0;
  sorted.forEach((cfg) => {
    const inc = cfg?.xp_required || 0;
    runningTotal += inc;
    cfg._xp_total = runningTotal;
    cfg._xp_total_add = inc;
  });
  return sorted;
}

function updateAgentHeader() {
  if (!agentLevelEl) return;

  const currentCfg = getLevelCfg(agentStats.level) || { xp_required: 0, energy_max: 5, _xp_total: 0 };
  const nextCfg = getLevelCfg(agentStats.level + 1);

  const prevXpThreshold = currentCfg._xp_total ?? cumulativeXpForLevel(agentStats.level);
  const nextXpThreshold = nextCfg ? nextCfg._xp_total ?? cumulativeXpForLevel(agentStats.level + 1) : prevXpThreshold;
  const stepTotal = Math.max(1, nextXpThreshold - prevXpThreshold);
  const xpInStep = Math.max(0, agentStats.xp - prevXpThreshold);
  const xpPct = Math.min(100, (xpInStep / stepTotal) * 100);
  const xpRemaining = Math.max(0, nextXpThreshold - agentStats.xp);

  agentLevelEl.textContent = agentStats.level;
  if (agentXpLabelEl) {
    const capValue = nextCfg ? nextXpThreshold : agentStats.xp;
    agentXpLabelEl.textContent = `${agentStats.xp} / ${capValue}`;
  }
  if (agentXpToNextEl) {
    agentXpToNextEl.textContent = nextCfg ? `Do L${nextCfg.level}: ${xpRemaining} XP` : "Max level";
  }
  if (agentXpBarFillEl) {
    agentXpBarFillEl.style.width = `${xpPct}%`;
  }

  const energyMax = currentCfg.energy_max || 5;
  const energyCur = Math.min(agentStats.energy_current ?? energyMax, energyMax);
  if (agentEnergyLabelEl) {
    agentEnergyLabelEl.textContent = `${energyCur} / ${energyMax}`;
  }
  if (agentEnergyBarFillEl) {
    const energyPct = Math.min(100, (energyCur / energyMax) * 100);
    agentEnergyBarFillEl.style.width = `${energyPct}%`;
  }
}

function grantTravelXp(amount = 50) {
  if (!amount || amount <= 0) return;
  agentStats.xp = Math.max(0, (agentStats.xp || 0) + amount);

  // postupné level-upy dle configu
  while (true) {
    const nextCfg = getLevelCfg(agentStats.level + 1);
    if (!nextCfg) break;
    const nextThreshold = nextCfg._xp_total ?? cumulativeXpForLevel(nextCfg.level);
    if (agentStats.xp < nextThreshold) break;
    agentStats.level = nextCfg.level;
    agentStats.energy_current = nextCfg.energy_max;
  }

  // po level-upu/XP vždy srovnej energii na maximum aktuálního levelu
  const curCfg = getLevelCfg(agentStats.level) || { energy_max: 5 };
  if (agentStats.energy_current === undefined || agentStats.energy_current === null) {
    agentStats.energy_current = curCfg.energy_max;
  } else {
    agentStats.energy_current = Math.min(agentStats.energy_current, curCfg.energy_max);
  }

  updateAgentHeader();
}

async function loadAgentAndLevels() {
  try {
    const res = await fetch("/api/agent");
    if (!res.ok) throw new Error("Failed to fetch agent");
    const data = await res.json();

    if (Array.isArray(data.levels) && data.levels.length > 0) {
      levelConfig = data.levels;
    }

    if (data.agent) {
      agentStats = {
        level: data.agent.level ?? 1,
        xp: data.agent.xp ?? 0,
        energy_current: data.agent.energy_current ?? (data.agent.energy_max || 5),
      };
    }
  } catch (err) {
    console.error("Agent load failed, using defaults:", err);
  }

  updateAgentHeader();
}

function showCanvasView() {
  if (canvasBlock) {
    canvasBlock.classList.remove("hidden");
  }
  if (canvas) {
    canvas.classList.remove("hidden");
  }
  if (cityBackdropEl) {
    cityBackdropEl.classList.add("opacity-0");
  }
  if (visualFrameEl) {
    visualFrameEl.style.aspectRatio = "";
  }
}

function renderCityInfo() {
  if (!cityInfoPanel || !cityInfoNameEl || !cityInfoMetaEl || !cityInfoDescEl) return;

  const city = getCityAt(agent.x, agent.y);
  if (!city) {
    cityInfoNameEl.textContent = "Neznámé město";
    cityInfoMetaEl.textContent = "Agent není ve městě";
    cityInfoDescEl.textContent = "Přesuň se do města pro detailní přehled.";
    return;
  }

  const importanceLabels = {
    1: "Hlavní uzel",
    2: "Regionální centrum",
    3: "Místní město",
  };

  const statePart = city.state ? (city.state_shortcut ? `${city.state} (${city.state_shortcut})` : city.state) : null;
  const regionPart = city.region || null;
  const importancePart = importanceLabels[city.importance] || null;

  cityInfoNameEl.textContent = city.name;
  const metaParts = [statePart, regionPart, importancePart].filter(Boolean);
  cityInfoMetaEl.textContent = metaParts.join(" • ") || "-";
  cityInfoDescEl.textContent = city.description || "Chybí popis pro toto město.";
}

function showCityInfoPanel(show) {
  if (!cityInfoPanel) return;
  const shouldShow = !!show;
  cityInfoPanel.classList.toggle("hidden", !shouldShow);
  if (cityBackdropEl) {
    cityBackdropEl.classList.toggle("hidden", shouldShow);
  }
  if (shouldShow) {
    showTimetablePanel(false);
    showCanvasView();
    renderCityInfo();
  }
}

function hideCityInfoPanel() {
  showCityInfoPanel(false);
  if (cityBackdropEl) {
    cityBackdropEl.classList.remove("hidden");
  }
  maybeShowCityImage(getCityAt(agent.x, agent.y));
}

async function maybeShowCityImage(city) {
  if (!canvas || !cityBackdropEl) return;
  const imgUrl = await findCityImageUrl(city);
  const infoPanelVisible = cityInfoPanel && !cityInfoPanel.classList.contains("hidden");

  if (imgUrl) {
    cityBackdropEl.onload = () => setFrameAspectFromImage(cityBackdropEl);
    cityBackdropEl.src = imgUrl;
    if (infoPanelVisible) {
      cityBackdropEl.classList.add("opacity-0");
      canvas.classList.remove("hidden");
      if (visualFrameEl) {
        visualFrameEl.style.aspectRatio = "";
      }
    } else {
      cityBackdropEl.classList.remove("opacity-0");
      canvas.classList.add("hidden");
    }
  } else {
    cityBackdropEl.src = "";
    cityBackdropEl.classList.add("opacity-0");
    canvas.classList.remove("hidden");
    if (visualFrameEl) {
      visualFrameEl.style.aspectRatio = "";
    }
  }
}

// Vysunutí tabule při nákupu jízdenek, schování po kliknutí na mapu
const ticketToggleBtn = document.getElementById("ticketToggleBtn");
if (ticketToggleBtn) {
  ticketToggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    showTimetablePanel(true);
  });
}
if (cityHubBtn) {
  cityHubBtn.addEventListener("click", (e) => {
    e.preventDefault();
    showTimetablePanel(false);
    hideCityInfoPanel();
    maybeShowCityImage(getCityAt(agent.x, agent.y));
  });
}
if (infoCenterBtn) {
  infoCenterBtn.addEventListener("click", (e) => {
    e.preventDefault();
    showCityInfoPanel(true);
  });
}
if (canvas) {
  canvas.addEventListener("click", () => showTimetablePanel(false));
}

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
    const baseRadius =
      city.importance === 1 ? 6 : city.importance === 2 ? 4.5 : 3;
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
    const fontSize =
      city.importance === 1 ? 14 : city.importance === 2 ? 12 : 10;
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
    travelOverlayEl.classList.add("hidden");
    return;
  }

  travelOverlayEl.classList.remove("hidden");

  const p = Math.min(1, Math.max(0, progress));
  travelProgressBar.style.width = `${p * 100}%`;

  if (travelClockLabel) {
    const displayMinutes = Math.floor(currentMinutes);
    travelClockLabel.textContent = formatGameTime(displayMinutes);
  }

  if (travelProgressFrom) {
    travelProgressFrom.textContent = formatCityLabel(travelAnimation.meta.fromName);
  }
  if (travelProgressTo) {
    travelProgressTo.textContent = formatCityLabel(travelAnimation.meta.toName);
  }
}

function completeTravel(targetCity) {
  if (!targetCity) return;
  grantTravelXp(50);
  travelToCity(targetCity);
  renderTimetablePage();
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
  const totalMinutes = Math.max(arrivalMinutes - startMinutes, 1);

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
    totalMinutes,
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
  if (travelLineLabel) travelLineLabel.textContent = formatLineTypeLabel(travel.lineType);
  if (travelTrainImg) {
    const level = getTrainLevel(travel.lineType);
    const speed = getTrainSpeedMph(level);
    if (travelTopType) travelTopType.textContent = formatLineTypeLabel(travel.lineType);
    if (travelTopSpeed) travelTopSpeed.textContent = `${speed} mph`;
    if (level === 1) {
      travelTrainImg.src = "/static/assets/train_1.png";
    } else if (level === 2) {
      travelTrainImg.src = "/static/assets/train_2.png";
    } else {
      travelTrainImg.src = "/static/assets/train_3.png";
    }
  }
  if (travelDistanceLabel) {
    travelDistanceLabel.textContent = distance ? `${distance.toFixed(1)} mi` : "-";
  }
  if (travelDurationLabel) {
    travelDurationLabel.textContent = formatTravelDuration(travel.travelMinutes);
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
  travelOverlayEl?.classList.add("hidden");

  // po dojetí resetni koupený ticket – v nové destinaci nedává smysl
  purchasedTicketKey = null;

  completeTravel(targetCity);
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
    const eased = travelProgressProfile(t, travelAnimation.totalMinutes);
    gameMinutes = travelAnimation.startMinutes + (travelAnimation.arrivalMinutes - travelAnimation.startMinutes) * eased;

    renderTravelOverlay(eased, gameMinutes);
    applySkyGradientForMinutes(gameMinutes);

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
    applySkyGradientForMinutes(gameMinutes);
  }

  if (advancedMinutes > 0) {
    renderTimetablePage();
    // průběžně aktualizujeme tabuli
    updateTimetable();
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

  // Grid – téměř neviditelný
  ctx.strokeStyle = "rgba(31, 41, 51, 0.08)";
  ctx.lineWidth = 0.3;

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

    ctx.fillStyle = "rgba(200, 32, 32, 0.42)"; // temně červená mlha (nebezpečnější vibe)
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
  const cityNameEl = document.getElementById("currentCityName");
  const cityDescEl = document.getElementById("currentCityDescription");
  const cityStateEl = document.getElementById("currentCityState");
  const posEl = document.getElementById("agentPos"); // může, ale nemusí existovat

  if (!cityNameEl) return;

  const city = getCityAt(agent.x, agent.y);

  if (posEl) {
    posEl.textContent = `${agent.x},${agent.y}`;
  }

  if (!city) {
    cityNameEl.textContent = "-";
    if (cityStateEl) cityStateEl.textContent = "-";
    if (cityDescEl) {
      cityDescEl.textContent = "Agent nestojí ve městě.";
    }
    renderCityInfo();
    maybeShowCityImage(null);
    return;
  }

  cityNameEl.textContent = city.name;
  if (cityStateEl) {
    const stateText = city.state ? `${city.state}${city.state_shortcut ? " (" + city.state_shortcut + ")" : ""}` : "-";
    cityStateEl.textContent = stateText;
  }
  if (cityDescEl) {
    const regionText = city.region ? `Region: ${city.region}` : "";
    const descText = city.description || "";
    const parts = [regionText, descText].filter(Boolean);
    cityDescEl.textContent = parts.join(" \u2022 ");
  }
  renderCityInfo();
  maybeShowCityImage(city);
}

function renderTimetablePage() {
  // Nevykresluj tabulku během animace přesunu (čas se řídí animací)
  if (travelAnimation) return;

  const timeEl = document.getElementById("currentTimeLabel");
  const tbody = document.getElementById("timetableBody");
  if (!timeEl || !tbody) return;

  // Aktualizace zobrazeného času
  timeEl.textContent = formatGameTime(gameMinutes);
  tbody.innerHTML = "";

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

  const departures = (timetableDepartures || [])
    .map((dep) => ({
      ...dep,
      _next_departure: normalizeDepartureMinutes(dep.departure_minutes, gameMinutes),
    }))
    .filter((dep) => dep._next_departure !== null && dep._next_departure > gameMinutes);

  if (!departures || departures.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "Z tohoto města nejedou žádné vlaky.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const pageItems = departures.slice(0, TIMETABLE_LIMIT);

  // Vykreslení výsledků
  pageItems.forEach((dep) => {
    const tr = document.createElement("tr");
    tr.classList.add("tabular-nums");
    const depMinutes = dep._next_departure ?? normalizeDepartureMinutes(dep.departure_minutes, gameMinutes);
    const typeInfo = getLineTypeInfo(dep.line_type);

    // Odjezd
    const timeTd = document.createElement("td");
    timeTd.innerHTML = `<span class="text-base font-semibold text-slate-100 tabular-nums">${formatGameTimeHHMM(depMinutes ?? dep.departure_minutes)}</span>`;

    // Do
    const toTd = document.createElement("td");
    const toName = dep.to_city?.name || "-";
    const cityMeta = cityByName.get(toName);
    const toState = cityMeta?.state_shortcut || cityMeta?.state || dep.to_city?.state_shortcut || dep.to_city?.state;
    const toLabel = `<span class="font-semibold text-sky-100 text-sm leading-tight">${toName}</span>`;
    const stateLabel = toState ? `<span class="ml-1 text-xs text-slate-300 align-middle">(${toState})</span>` : "";
    toTd.innerHTML = `${toLabel}${stateLabel}`;

    // Typ linky
    const typeTd = document.createElement("td");
    const badgeSizeClass =
      typeInfo.key === "express"
        ? "min-w-[2.8rem] px-3 py-1 text-xs"
        : "min-w-[2.1rem] px-2 py-0.5 text-[11px]";
    typeTd.innerHTML = `<span class="inline-flex items-center justify-center rounded-md ${badgeSizeClass} ${typeInfo.badgeClasses} font-semibold uppercase tracking-wide" title="${formatLineTypeLabel(dep.line_type)}">${typeInfo.symbol}</span>`;

    // Vzdálenost
    const distTd = document.createElement("td");
    distTd.textContent = dep.distance_units !== undefined && dep.distance_units !== null
      ? Math.round(dep.distance_units) + " mi"
      : "-";

    // Doba cestování
    const travelTd = document.createElement("td");
    travelTd.textContent = formatTravelDuration(dep.travel_minutes);

    // Příjezd
    const arrivalTd = document.createElement("td");
    if (dep.travel_minutes !== undefined && dep.travel_minutes !== null) {
      const arrivalMinutes = (depMinutes ?? dep.departure_minutes) + dep.travel_minutes;
      arrivalTd.innerHTML = `<span class="font-semibold text-slate-100 text-base tabular-nums">${formatGameTime(arrivalMinutes)}</span>`;
    } else {
      arrivalTd.textContent = "-";
    }

    const destinationName = dep.to_city?.name;
    const destinationCity = destinationName ? cityByName.get(destinationName) : null;
    const depKey = makeDepartureKey(dep, depMinutes ?? dep.departure_minutes);
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
      ticketTd.innerHTML = `<span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-900/60 border border-emerald-500/60 text-emerald-100 text-xs font-semibold" title="Jízdenka koupena">✅ Ticket</span>`;
    } else {
      const buyBtn = document.createElement("button");
      buyBtn.className = "inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-sky-900/40 border border-sky-500/60 text-sky-100 text-xs font-semibold hover:bg-sky-800/60 hover:border-sky-300 transition";
      buyBtn.innerHTML = "🎟️ Koupit";
      buyBtn.setAttribute("title", "Koupit ticket");
      buyBtn.setAttribute("aria-label", "Koupit ticket");
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
    tr.appendChild(toTd);
    tr.appendChild(typeTd);
    tr.appendChild(distTd);
    tr.appendChild(travelTd);
    tr.appendChild(arrivalTd);
    tr.appendChild(ticketTd);

    tbody.appendChild(tr);
  });

}

async function updateTimetable() {
  const city = getCityAt(agent.x, agent.y);

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

  await loadAgentAndLevels();

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

  // 4) vybereme startovní město – dočasně může být libovolné
  const startCity = cities[Math.floor(Math.random() * cities.length)];

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
  updateAgentHeader();
  maybeShowCityImage(getCityAt(agent.x, agent.y));
  applySkyGradientForMinutes(gameMinutes);
  await updateTimetable();

  gameLoop();
}



init();
