
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const BASE_MAP_WIDTH = canvas?.width || 1024;
const BASE_MAP_HEIGHT = canvas?.height || 576;

const mapImage = new Image();
let mapLoaded = false;
mapImage.src = "/static/assets/usa_sil.png"; // cesta k silhouetě USA

mapImage.addEventListener("load", () => {
  mapLoaded = true;
  console.log("Map image loaded");
  renderCityInfoMap(getCityAt(agent.x, agent.y));
});

const TILE_SIZE = 8;
const GRID_COLS = 128; // 1024 / 8
const GRID_ROWS = 72;  // 576 / 8

const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = MINUTES_PER_DAY * 7;
const DAY_NAMES = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

// Po 08:00 = start
let gameMinutes = 8 * 60; // 8:00 první den (Po)
const REAL_MS_PER_GAME_MINUTE = 1000; // 1 herní minuta = 1 reálná sekunda pro rychlejší postup
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
let labOverview = null;
let labOverviewLoading = false;
let labStoryConfirmHandler = null;
let storyDialogs = [];
let storyDialogsLoading = false;
let storyDialogsPromise = null;

// Jednoduchá lokální reprezentace agenta (pro UI panel nahoře)
let levelConfig = [];
let agentStats = {
  level: 1,
  xp: 0,
  energy_current: 5,
};

let agentTasks = [];
let activeTaskId = null;
const pendingObjectiveRequests = new Set();
const objectiveCompletionPromises = new Map();

let agentCurrentCityId = null;
let agentCurrentCityName = null;
let serverKnownCityId = null;
const RANDOM_START_FLAG_KEY = "agent_force_random_spawn";
let pendingTaskCelebration = null;
let taskCelebrationTimeout = null;

function formatGameTime(totalMinutes) {
  const minutesNorm = ((totalMinutes % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;

  const dayIndex = Math.floor(minutesNorm / MINUTES_PER_DAY);
  const minuteOfDay = minutesNorm % MINUTES_PER_DAY;
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");

  return `${DAY_NAMES[dayIndex]} ${hh}:${mm}`;
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

function formatWeekAndTime(totalMinutes) {
  const weekIndex = Math.floor(totalMinutes / MINUTES_PER_WEEK);
  const weekLabel = Math.max(1, weekIndex + 1);
  return {
    weekText: `Týden ${weekLabel}`,
    timeText: formatGameTime(totalMinutes),
  };
}

function buildGameTimeSnapshot(totalMinutes) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes ?? 0));
  const rawWeekIndex = Math.floor(safeMinutes / MINUTES_PER_WEEK) + 1;
  const minuteOfWeek = ((safeMinutes % MINUTES_PER_WEEK) + MINUTES_PER_WEEK) % MINUTES_PER_WEEK;
  const dayIndex = Math.floor(minuteOfWeek / MINUTES_PER_DAY);
  const minuteOfDay = minuteOfWeek % MINUTES_PER_DAY;
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;

  return {
    minutes: safeMinutes,
    weekIndex: Math.max(1, rawWeekIndex),
    weekLabel: `Týden ${Math.max(1, rawWeekIndex)}`,
    dayIndex,
    dayLabel: DAY_NAMES[dayIndex] || DAY_NAMES[0],
    timeLabel: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
  };
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

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
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
      badgeClasses: "bg-gradient-to-r from-pink-500/40 to-violet-500/40 border border-pink-300/45 text-pink-50 text-[11px] px-[8px] py-[2px]",
    };
  }
  if (t === "intercity" || t === "ic" || t === "regional") {
    return {
      key: "regional",
      symbol: "Reg",
      badgeClasses: "bg-gradient-to-r from-sky-500/35 to-indigo-500/40 border border-sky-300/40 text-sky-50 text-[11px] px-[6px] py-[2px]",
    };
  }
  return {
    key: "local",
    symbol: "Loc",
    badgeClasses: "bg-gradient-to-r from-emerald-500/35 to-teal-500/40 border border-emerald-300/40 text-emerald-50 text-[10px] px-[6px] py-[2px]",
  };
}

function formatCityLabel(name) {
  if (!name) return "-";
  const city = getCityByNameInsensitive(name);
  if (city) {
    const state = city.state_shortcut || city.state;
    if (state) return `${city.name}, ${state}`;
    return city.name;
  }
  return name;
}

function formatPopulation(population) {
  if (population === null || population === undefined) {
    return "-";
  }

  if (population >= 1_000_000) {
    const roundedMillions = Math.round((population / 1_000_000) * 10) / 10;
    const label = roundedMillions.toString().replace(".", ",");
    return `${label} mil.`;
  }

  const thousands = Math.round(population / 1000);
  const label = thousands.toString().replace(".", ",");
  return `${label} tis.`;
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

function getCityByNameInsensitive(name) {
  if (!name) return null;
  const direct = cityByName.get(name);
  if (direct) return direct;
  return cityByName.get(name.toLowerCase()) || null;
}

function isAgentInCityByName(name) {
  if (!name) return false;
  const target = getCityByNameInsensitive(name);
  if (!target) {
    const normalized = name.toLowerCase();
    const fallbackName = (agentCurrentCityName || "").toLowerCase();
    if (fallbackName && fallbackName === normalized) {
      return true;
    }
    const currentCity = getCityAt(agent.x, agent.y);
    if (currentCity && (currentCity.name || "").toLowerCase() === normalized) {
      return true;
    }
    return false;
  }

  if (agentCurrentCityId && target.id === agentCurrentCityId) {
    return true;
  }
  const currentCity = getCityAt(agent.x, agent.y);
  if (currentCity && currentCity.id === target.id) {
    return true;
  }
  if ((currentCity?.name || "").toLowerCase() === (name || "").toLowerCase()) {
    return true;
  }
  if ((agentCurrentCityName || "").toLowerCase() === (name || "").toLowerCase()) {
    return true;
  }
  return false;
}

function getCurrentCitySnapshot() {
  const currentCity = getCityAt(agent.x, agent.y);
  if (currentCity) return currentCity;
  if (agentCurrentCityName) {
    const fallback = getCityByNameInsensitive(agentCurrentCityName);
    if (fallback) {
      return fallback;
    }
  }
  return null;
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
    day: "linear-gradient(180deg, #3f7fd8 0%, #8fcfff 55%, #f4fbff 100%)",
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

// DOM references
const canvasBlock = document.getElementById("canvasBlock");
const cityBackdropEl = document.getElementById("cityBackdrop");
const skyGradientEl = document.getElementById("skyGradient");
const nightOverlayEl = document.getElementById("nightOverlay");
const daySunOverlayEl = document.getElementById("daySunOverlay");
const timetableCardEl = document.getElementById("timetableCard");
const restartButton = document.getElementById("restartButton");
const cityHubBtn = document.getElementById("cityHubBtn");
const travelOverlayEl = document.getElementById("travelOverlay");
const travelDistanceLabel = document.getElementById("travelDistanceLabel");
const travelClockLabel = document.getElementById("travelClockLabel");
const travelTrainImg = document.getElementById("travelTrainImg");
const travelTopType = document.getElementById("travelTopType");
const travelTopSpeed = document.getElementById("travelTopSpeed");
const travelDurationLabel = document.getElementById("travelDurationLabel");
const travelMapCanvas = document.getElementById("travelMapCanvas");
const travelMapCtx = travelMapCanvas ? travelMapCanvas.getContext("2d") : null;
const infoCenterBtn = document.getElementById("infoCenterBtn");
const labBtn = document.getElementById("labBtn");
const bankBtn = document.getElementById("bankBtn");
const hqBtn = document.getElementById("hqBtn");
const workshopBtn = document.getElementById("workshopBtn");
const cityInfoPanel = document.getElementById("cityInfoPanel");
const cityInfoNameEl = document.getElementById("cityInfoName");
const cityInfoMetaEl = document.getElementById("cityInfoMeta");
const cityInfoPopulationEl = document.getElementById("cityInfoPopulation");
const cityInfoDescEl = document.getElementById("cityInfoDesc");
const labPanelEl = document.getElementById("labPanel");
const workshopPanelEl = document.getElementById("workshopPanel");
const labActionElements = document.querySelectorAll("[data-action-code]");
const labFogLevelLabel = document.getElementById("labFogLevelLabel");
const labFogLevelDesc = document.getElementById("labFogLevelDesc");
const labFogLevelBar = document.getElementById("labFogLevelBar");
const labStoryNoticeEl = document.getElementById("labStoryNotice");
const labStoryTitleEl = document.getElementById("labStoryTitle");
const labStoryBodyEl = document.getElementById("labStoryBody");
const labStoryConfirmEl = document.getElementById("labStoryConfirm");
const cityInfoMapCanvas = document.getElementById("cityInfoMap");
const cityInfoMapCtx = cityInfoMapCanvas ? cityInfoMapCanvas.getContext("2d") : null;
const cityInfoMapWrapper = document.getElementById("cityInfoMapWrapper");
const cityInfoMapTooltip = document.getElementById("cityInfoMapTooltip");
let cityInfoMapTargets = [];

function hideLabStoryNotice() {
  if (labStoryNoticeEl) {
    labStoryNoticeEl.classList.add("hidden");
  }
  labStoryConfirmHandler = null;
  if (labStoryConfirmEl) {
    labStoryConfirmEl.disabled = false;
  }
}

function showLabStoryNotice(options = {}) {
  if (!labStoryNoticeEl) return;
  const { title, body, confirmLabel = "Pokračovat", onConfirm } = options;
  if (labStoryTitleEl) {
    labStoryTitleEl.textContent = title || "Laboratorní briefing";
  }
  if (labStoryBodyEl) {
    labStoryBodyEl.textContent =
      body ||
      "Dr. Rook sdílí aktuální data o mlze. Potvrď, že pokračujete společně v další fázi mise.";
  }
  if (labStoryConfirmEl) {
    labStoryConfirmEl.textContent = confirmLabel;
  }
  labStoryConfirmHandler = typeof onConfirm === "function" ? onConfirm : null;
  labStoryNoticeEl.classList.remove("hidden");
}

if (labStoryConfirmEl) {
  labStoryConfirmEl.addEventListener("click", (e) => {
    e.preventDefault();
    const handler = labStoryConfirmHandler;
    if (typeof handler === "function") {
      handler();
    }
  });
}

function getStoryDialogForPanel(panel) {
  return storyDialogs.find((dialog) => dialog.panel === panel);
}

async function loadStoryDialogs(force = false) {
  if (storyDialogsLoading) return storyDialogsPromise;
  if (!force && storyDialogs.length > 0) {
    renderLabStoryDialog();
    return Promise.resolve();
  }
  storyDialogsLoading = true;
  storyDialogsPromise = (async () => {
    try {
      const res = await fetch("/api/tasks/story-dialogs");
      if (!res.ok) throw new Error("Failed to fetch story dialogs");
      const data = await res.json();
      storyDialogs = Array.isArray(data?.dialogs) ? data.dialogs : [];
    } catch (err) {
      console.error("Story dialog load failed:", err);
      storyDialogs = [];
    } finally {
      storyDialogsLoading = false;
      storyDialogsPromise = null;
      renderLabStoryDialog();
    }
  })();
  return storyDialogsPromise;
}

function renderLabStoryDialog() {
  const dialog = getStoryDialogForPanel("lab");
  if (!dialog) {
    hideLabStoryNotice();
    return;
  }
  showLabStoryNotice({
    title: dialog.title,
    body: dialog.body,
    confirmLabel: dialog.confirm_label || "Pokračovat",
    onConfirm: () => handleStoryDialogConfirm(dialog),
  });
}

async function handleStoryDialogConfirm(dialog) {
  if (!dialog || !dialog.task_id) {
    hideLabStoryNotice();
    return;
  }
  try {
    if (labStoryConfirmEl) {
      labStoryConfirmEl.disabled = true;
    }
    await completeTaskObjective(dialog.task_id, dialog.objective_index);
  } finally {
    if (labStoryConfirmEl) {
      labStoryConfirmEl.disabled = false;
    }
    hideLabStoryNotice();
    await loadStoryDialogs(true);
  }
}
const ticketToggleBtn = document.getElementById("ticketToggleBtn");
const agentLevelEl = document.getElementById("agentLevel");
const agentXpToNextEl = document.getElementById("agentXpToNext");
const agentLevelProgressFillEl = document.getElementById("agentLevelProgress");
const agentEnergyLabelEl = document.getElementById("agentEnergyLabel");
const agentEnergyBarFillEl = document.getElementById("agentEnergyBarFill");
const ticketSound = new Audio("/static/sounds/click/pay.mp3");
const travelSound = new Audio("/static/sounds/travel/travelling.mp3");
const taskCardEl = document.getElementById("taskCard");
const currentTaskTitleEl = document.getElementById("currentTaskTitle");
const currentTaskSummaryEl = document.getElementById("currentTaskSummary");
const currentTaskLocationEl = document.getElementById("currentTaskLocation");
const currentTaskPriorityBadgeEl = document.getElementById("currentTaskPriorityBadge");
const currentTaskRewardEl = document.getElementById("currentTaskReward");
const currentTaskProgressBarEl = document.getElementById("currentTaskProgressBar");
const currentTaskProgressLabelEl = document.getElementById("currentTaskProgressLabel");
const taskCelebrationEl = document.getElementById("taskCelebration");
const taskCelebrationCompletedEl = document.getElementById("taskCelebrationCompleted");
const taskCelebrationXpEl = document.getElementById("taskCelebrationXp");
const taskCelebrationNextEl = document.getElementById("taskCelebrationNext");
const taskDetailPanelEl = document.getElementById("taskDetailPanel");
const taskListContainerEl = document.getElementById("taskListContainer");
const taskDetailTitleEl = document.getElementById("taskDetailTitle");
const taskDetailSubtitleEl = document.getElementById("taskDetailSubtitle");
const taskDetailLocationEl = document.getElementById("taskDetailLocation");
const taskDetailPriorityEl = document.getElementById("taskDetailPriority");
const taskDetailEtaEl = document.getElementById("taskDetailEta");
const taskDetailDescEl = document.getElementById("taskDetailDesc");
const taskObjectiveListEl = document.getElementById("taskObjectiveList");
const taskRewardLabelEl = document.getElementById("taskRewardLabel");
const taskStatusLabelEl = document.getElementById("taskStatusLabel");
const closeTaskDetailBtn = document.getElementById("closeTaskDetailBtn");
const footerButtons = {
  hub: cityHubBtn,
  timetable: ticketToggleBtn,
  info: infoCenterBtn,
  lab: labBtn,
  workshop: workshopBtn,
};
let activeFooterButton = null;

function setActiveFooterButton(key) {
  activeFooterButton = key;
  Object.entries(footerButtons).forEach(([btnKey, btn]) => {
    if (!btn) return;
    const isActive = btnKey === key;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

setActiveFooterButton(null);

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

  canvas.addEventListener("click", () => {
    const timetableWasActive = activeFooterButton === "timetable";
    showTimetablePanel(false);
    showTaskDetailPanel(false);
    if (timetableWasActive) {
      setActiveFooterButton(null);
    }
  });
}
// ----------------------------------------
// POST-APO MLHA – základní systém
// ----------------------------------------

const fogSpreadSpeed = 0.001; // základní rychlost šíření mlhy
let fogTiles = new Set(); // tile indexy mlhy
let fogFrontier = []; // fronta okrajových tileů pro nerovnoměrné šíření

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

function setAgentPositionToCity(city, options = {}) {
  if (!city) return false;
  agent.x = city.x;
  agent.y = city.y;
  agentCurrentCityId = city.id ?? null;
  agentCurrentCityName = city.name ?? null;

  if (options.persist) {
    persistAgentLocation(city.id);
  }

  return true;
}

function persistAgentLocation(cityId) {
  if (!cityId || cityId === serverKnownCityId) {
    return;
  }

  const timeSnapshot = buildGameTimeSnapshot(gameMinutes);
  const payload = {
    city_id: cityId,
    game_minutes: timeSnapshot.minutes,
    game_week: timeSnapshot.weekIndex,
    game_day_index: timeSnapshot.dayIndex,
    game_day_label: timeSnapshot.dayLabel,
    game_time_label: timeSnapshot.timeLabel,
  };

  fetch("/api/agent/location", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to persist agent location (status ${res.status})`);
      }
      return res.json();
    })
    .then((data) => {
      const updatedId = data?.agent?.current_city_id;
      serverKnownCityId = updatedId ?? cityId;
    })
    .catch((err) => {
      console.error("Agent location sync failed:", err);
    });
}

function consumeRandomStartFlag() {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }
  try {
    const flag = window.localStorage.getItem(RANDOM_START_FLAG_KEY);
    if (flag) {
      window.localStorage.removeItem(RANDOM_START_FLAG_KEY);
      return true;
    }
  } catch (err) {
    console.warn("Unable to read random start flag:", err);
  }
  return false;
}

// Náhodně "infikovaná" pole – jen vizuální ukázka
const infectedTiles = [];
for (let i = 0; i < 40; i++) {
  infectedTiles.push({
    x: Math.floor(Math.random() * GRID_COLS),
    y: Math.floor(Math.random() * GRID_ROWS),
  });
}

function playTravelSound() {
  if (!travelSound) return;
  try {
    travelSound.currentTime = 0;
    const playPromise = travelSound.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  } catch (err) {
    console.warn("Travel sound playback failed:", err);
  }
}

function moveAgent(dx, dy) {
  const newX = agent.x + dx;
  const newY = agent.y + dy;

  if (newX >= 0 && newX < GRID_COLS && newY >= 0 && newY < GRID_ROWS) {
    agent.x = newX;
    agent.y = newY;
    updateSidebar();
    updateTimetable();
    notifyTaskLocationChange();
  } 
}

function travelToCity(targetCity, options = {}) {
  if (!targetCity) return;
  const { silent = false } = options;

  if (!silent) {
    playTravelSound();
  }

  setAgentPositionToCity(targetCity, { persist: true });
  showTimetablePanel(false); // po přesunu zpět na úvodní pohled s obrázkem
  updateSidebar();
  updateTimetable();
  console.log(`Přesun vlakem do: ${targetCity.name}`);
  notifyTaskLocationChange();
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
  if (!timetableCardEl) return;
  if (show) {
    timetableCardEl.classList.remove("hidden");
    if (cityInfoPanel) {
      cityInfoPanel.classList.add("hidden");
    }
    if (labPanelEl) {
      labPanelEl.classList.add("hidden");
    }
    if (workshopPanelEl) {
      workshopPanelEl.classList.add("hidden");
    }
    if (taskDetailPanelEl) {
      taskDetailPanelEl.classList.add("hidden");
    }
  } else {
    timetableCardEl.classList.add("hidden");
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
  const xpRemaining = Math.max(0, nextXpThreshold - agentStats.xp);
  const xpProgress = nextCfg ? Math.min(1, Math.max(0, (agentStats.xp - prevXpThreshold) / stepTotal)) : 1;

  agentLevelEl.textContent = agentStats.level;
  if (agentXpToNextEl) {
    agentXpToNextEl.textContent = nextCfg ? `${xpRemaining} XP` : "MAX";
  }
  if (agentLevelProgressFillEl) {
    agentLevelProgressFillEl.style.width = `${xpProgress * 100}%`;
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

function grantTravelXp(amount = 5) {
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
      agentCurrentCityId = data.agent.current_city_id ?? null;
      agentCurrentCityName = data.agent.current_city_name ?? null;
      serverKnownCityId = agentCurrentCityId;
    }
  } catch (err) {
    console.error("Agent load failed, using defaults:", err);
  }

  updateAgentHeader();
}

async function loadAgentTasks() {
  let tasks = [];
  try {
    const res = await fetch("/api/tasks");
    if (!res.ok) throw new Error("Failed to fetch tasks");
    const data = await res.json();
    tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  } catch (err) {
    console.error("Task load failed, using empty list:", err);
  }

  agentTasks = tasks.map((task) => normalizeTaskPayload(task)).filter(Boolean);
  if (!agentTasks.length) {
    activeTaskId = null;
  } else if (!activeTaskId || !agentTasks.some((task) => task.id === activeTaskId)) {
    activeTaskId = agentTasks[0].id;
  }

  renderTaskCard();
  renderTaskDetailPanel();
  notifyTaskLocationChange();
  await loadStoryDialogs(true);
  maybeShowPendingTaskCelebration();
}

function getActiveTask() {
  if (!Array.isArray(agentTasks) || agentTasks.length === 0) {
    return null;
  }

  if (activeTaskId) {
    const found = agentTasks.find((task) => task.id === activeTaskId);
    if (found) {
      return found;
    }
  }

  return agentTasks[0];
}

function setActiveTask(taskId) {
  if (!taskId || taskId === activeTaskId) return;
  const exists = agentTasks.some((task) => task.id === taskId);
  if (!exists) return;
  activeTaskId = taskId;
  renderTaskCard();
  renderTaskDetailPanel();
}

function normalizeTaskPayload(task) {
  if (!task || typeof task !== "object") return null;
  const normalized = { ...task };
  const objectives = Array.isArray(task.objectives) ? task.objectives : [];
  normalized.objectives = objectives;
  const completed = Array.isArray(task.completed_objectives)
    ? task.completed_objectives.slice(0, objectives.length)
    : Array(objectives.length).fill(false);
  normalized.completed_objectives = completed;
  const triggers = Array.isArray(task.objective_triggers) ? task.objective_triggers : [];
  normalized.objective_triggers = triggers;
  if (typeof normalized.progress !== "number") {
    const done = completed.filter(Boolean).length;
    normalized.progress = objectives.length ? done / objectives.length : 0;
  }
  return normalized;
}

function upsertTask(updatedTask) {
  const normalized = normalizeTaskPayload(updatedTask);
  if (!normalized || !normalized.id) return;
  const idx = agentTasks.findIndex((task) => task.id === normalized.id);
  if (idx >= 0) {
    agentTasks[idx] = { ...agentTasks[idx], ...normalized };
  } else {
    agentTasks.push(normalized);
  }
}

function completeTaskObjective(taskId, objectiveIndex) {
  if (!taskId || objectiveIndex === undefined || objectiveIndex === null) return null;
  const key = `${taskId}:${objectiveIndex}`;
  if (objectiveCompletionPromises.has(key)) {
    return objectiveCompletionPromises.get(key);
  }

  const promise = (async () => {
    pendingObjectiveRequests.add(key);
    try {
      const res = await fetch(`/api/tasks/${taskId}/objectives/${objectiveIndex}/complete`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Objective completion failed");
      const data = await res.json();
      let shouldReloadTasks = false;
      if (data?.task) {
        upsertTask(data.task);
        if (data.task.status === "rewarded") {
          shouldReloadTasks = true;
        }
      }
      if (data?.xp_awarded) {
        grantTravelXp(data.xp_awarded);
        shouldReloadTasks = true;
      }
      if (shouldReloadTasks) {
        if (!pendingTaskCelebration && (data?.task?.status === "rewarded" || data?.xp_awarded)) {
          pendingTaskCelebration = {
            completedTitle: data?.task?.title || null,
            xpAwarded: data?.xp_awarded || 0,
          };
        }
        await loadAgentTasks();
      } else {
        renderTaskCard();
        renderTaskDetailPanel();
      }
    } catch (err) {
      console.error("Objective completion failed:", err);
    } finally {
      pendingObjectiveRequests.delete(key);
      objectiveCompletionPromises.delete(key);
    }
  })();

  objectiveCompletionPromises.set(key, promise);
  return promise;
}

function triggerObjectiveCompletion(taskId, objectiveIndex) {
  return completeTaskObjective(taskId, objectiveIndex);
}

function notifyTaskLocationChange() {
  const city = getCurrentCitySnapshot();
  if (!city) return;
  evaluateVisitObjectives(city);
}

function evaluateVisitObjectives(city) {
  if (!city || !city.name) return;
  const cityName = city.name.toLowerCase();
  agentTasks.forEach((task) => {
    const triggers = task.objective_triggers || [];
    const completed = task.completed_objectives || [];
    triggers.forEach((trigger, index) => {
      if (completed[index]) return;
      if (trigger?.type === "visit_city") {
        const triggerName = (trigger.city_name || "").toLowerCase();
        if (triggerName && triggerName === cityName) {
          triggerObjectiveCompletion(task.id, index);
        }
      }
    });
  });
}

function renderTaskCard() {
  if (!taskCardEl || !currentTaskTitleEl || !currentTaskSummaryEl) return;
  const task = getActiveTask();
  if (!task) {
    currentTaskTitleEl.textContent = "Žádné zadání";
    currentTaskSummaryEl.textContent = "Velitelství zatím neposlalo žádnou operaci. Sleduj kanál HQ.";
    if (currentTaskLocationEl) currentTaskLocationEl.textContent = "-";
    if (currentTaskRewardEl) currentTaskRewardEl.textContent = "0 XP";
    currentTaskPriorityBadgeEl?.classList.add("hidden");
    if (currentTaskProgressBarEl) currentTaskProgressBarEl.style.width = "0%";
    if (currentTaskProgressLabelEl) currentTaskProgressLabelEl.textContent = "0%";
    taskCardEl.classList.add("opacity-60");
    taskCardEl.setAttribute("aria-disabled", "true");
    return;
  }

  taskCardEl.classList.remove("opacity-60");
  taskCardEl.removeAttribute("aria-disabled");
  currentTaskTitleEl.textContent = task.title;
  currentTaskSummaryEl.textContent = task.summary;
  if (currentTaskLocationEl) currentTaskLocationEl.textContent = task.location || "-";
  if (currentTaskRewardEl) {
    currentTaskRewardEl.textContent = task.reward || "XP";
  }
  if (currentTaskPriorityBadgeEl) {
    if ((task.priority || "").toLowerCase() === "vysoká") {
      currentTaskPriorityBadgeEl.classList.remove("hidden");
    } else {
      currentTaskPriorityBadgeEl.classList.add("hidden");
    }
  }
  const progressPercent = Math.max(0, Math.min(100, Math.round((task.progress || 0) * 100)));
  if (currentTaskProgressBarEl) currentTaskProgressBarEl.style.width = `${progressPercent}%`;
  if (currentTaskProgressLabelEl) currentTaskProgressLabelEl.textContent = `${progressPercent}%`;
}

function hideTaskCelebration() {
  if (taskCelebrationTimeout) {
    clearTimeout(taskCelebrationTimeout);
    taskCelebrationTimeout = null;
  }
  if (taskCelebrationEl) {
    taskCelebrationEl.classList.add("hidden");
  }
  if (taskCardEl) {
    taskCardEl.classList.remove("task-card--celebrating");
  }
}

function showTaskCompletionCelebration(payload = {}) {
  if (!taskCelebrationEl || !taskCardEl) return;
  const { completedTitle, xpAwarded, nextTitle } = payload;
  if (taskCelebrationCompletedEl) {
    taskCelebrationCompletedEl.textContent = completedTitle || "Úkol dokončen";
  }
  if (taskCelebrationXpEl) {
    if (typeof xpAwarded === "number" && xpAwarded > 0) {
      taskCelebrationXpEl.textContent = `+${xpAwarded} XP`;
      taskCelebrationXpEl.classList.remove("hidden");
    } else {
      taskCelebrationXpEl.classList.add("hidden");
    }
  }
  if (taskCelebrationNextEl) {
    if (nextTitle) {
      taskCelebrationNextEl.textContent = `Nová mise: ${nextTitle}`;
      taskCelebrationNextEl.classList.remove("hidden");
    } else {
      taskCelebrationNextEl.classList.add("hidden");
    }
  }
  taskCardEl.classList.add("task-card--celebrating");
  taskCelebrationEl.classList.remove("hidden");
  if (taskCelebrationTimeout) {
    clearTimeout(taskCelebrationTimeout);
  }
  taskCelebrationTimeout = setTimeout(() => {
    hideTaskCelebration();
  }, 3600);
}

function maybeShowPendingTaskCelebration() {
  if (!pendingTaskCelebration) return;
  const active = getActiveTask();
  showTaskCompletionCelebration({
    completedTitle: pendingTaskCelebration.completedTitle,
    xpAwarded: pendingTaskCelebration.xpAwarded,
    nextTitle: active ? active.title : null,
  });
  pendingTaskCelebration = null;
}

function renderTaskList() {
  if (!taskListContainerEl) return;
  if (!Array.isArray(agentTasks) || agentTasks.length === 0) {
    taskListContainerEl.innerHTML = `<p class="text-sm text-slate-300">Velitelství zatím nepřiřadilo žádné operace.</p>`;
    return;
  }

  const active = getActiveTask();
  taskListContainerEl.innerHTML = agentTasks
    .map((task) => {
      const isActive = active && task.id === active.id;
      const border = isActive
        ? "border-violet-400/70 bg-violet-500/10 shadow-[0_10px_25px_rgba(99,102,241,0.25)]"
        : "border-white/10 bg-white/5 hover:border-violet-300/40";
      return `
        <button
          type="button"
          data-task-id="${task.id}"
          class="w-full text-left rounded-2xl border ${border} px-4 py-3 transition focus:outline-none focus:ring-2 focus:ring-violet-400/70"
        >
          <p class="text-[11px] uppercase tracking-[0.22em] text-slate-400">${task.priority || "Standard"} • ${task.eta || "—"}</p>
          <p class="text-sm font-semibold text-slate-100">${task.title}</p>
          <p class="text-xs text-slate-300">${task.location}</p>
        </button>
      `;
    })
    .join("");

  taskListContainerEl.querySelectorAll("[data-task-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-task-id");
      setActiveTask(id);
    });
  });
}

function renderTaskDetailPanel() {
  renderTaskList();
  renderTaskDetail();
}

function renderTaskDetail() {
  if (
    !taskDetailPanelEl ||
    !taskDetailTitleEl ||
    !taskDetailSubtitleEl ||
    !taskDetailLocationEl ||
    !taskDetailPriorityEl ||
    !taskDetailEtaEl ||
    !taskDetailDescEl ||
    !taskObjectiveListEl ||
    !taskRewardLabelEl ||
    !taskStatusLabelEl
  ) {
    return;
  }

  const task = getActiveTask();
  if (!task) {
    taskDetailTitleEl.textContent = "Žádný aktivní úkol";
    taskDetailSubtitleEl.textContent = "Jakmile HQ přiřadí operaci, uvidíš ji tady.";
    taskDetailLocationEl.textContent = "---";
    taskDetailPriorityEl.textContent = "-";
    taskDetailEtaEl.textContent = "-";
    taskDetailDescEl.textContent = "Čekáme na instrukce velitelství.";
    taskObjectiveListEl.innerHTML = `<li class="text-slate-400">Žádné kroky nejsou zadány.</li>`;
    taskRewardLabelEl.textContent = "-";
    taskStatusLabelEl.textContent = "-";
    return;
  }

  taskDetailTitleEl.textContent = task.title;
  taskDetailSubtitleEl.textContent = task.summary;
  taskDetailLocationEl.textContent = task.location || "---";
  taskDetailPriorityEl.textContent = task.priority || "Standard";
  taskDetailEtaEl.textContent = task.eta || "—";
  taskDetailDescEl.textContent = task.description || "-";
  const objectives = task.objectives || [];
  const completed = task.completed_objectives || [];
  const triggers = task.objective_triggers || [];
  taskObjectiveListEl.innerHTML = objectives
    .map((step, index) => {
      const done = !!completed[index];
      const trigger = triggers[index] || {};
      const icon = done ? "✔" : "◆";
      const iconColor = done ? "text-emerald-300" : "text-violet-300";
      const textClasses = done ? "text-slate-400 line-through" : "text-slate-100";
      const manualButton =
        !done && trigger?.type === "manual"
          ? `<button type="button" class="ml-auto text-xs text-violet-200 underline hover:text-white" data-complete-objective="true" data-task-id="${task.id}" data-objective-index="${index}">Označit splněno</button>`
          : "";
      return `
        <li class="flex items-start gap-2">
          <span class="${iconColor} mt-[3px] text-xs">${icon}</span>
          <div class="flex flex-col gap-1 sm:flex-row sm:items-center w-full">
            <span class="${textClasses}">${step}</span>
            ${manualButton}
          </div>
        </li>
      `;
    })
    .join("");
  if (!objectives.length) {
    taskObjectiveListEl.innerHTML = `<li class="text-slate-400">Žádné kroky nejsou zadány.</li>`;
  }
  taskObjectiveListEl.querySelectorAll("[data-complete-objective]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-objective-index"));
      if (Number.isNaN(idx)) return;
      completeTaskObjective(task.id, idx);
    });
  });
  taskRewardLabelEl.textContent = task.reward || "-";
  taskStatusLabelEl.textContent = task.status || "-";
}

function showTaskDetailPanel(show) {
  if (!taskDetailPanelEl) return;
  const shouldShow = !!show;
  taskDetailPanelEl.classList.toggle("hidden", !shouldShow);
  if (shouldShow) {
    if (activeFooterButton) {
      setActiveFooterButton(null);
    }
    if (cityInfoPanel) {
      cityInfoPanel.classList.add("hidden");
    }
    if (labPanelEl) {
      labPanelEl.classList.add("hidden");
    }
    if (workshopPanelEl) {
      workshopPanelEl.classList.add("hidden");
    }
    showTimetablePanel(false);
    if (taskListContainerEl && !taskListContainerEl.children.length) {
      renderTaskDetailPanel();
    }
  }
}

function renderCityInfo() {
  if (!cityInfoPanel || !cityInfoNameEl || !cityInfoMetaEl || !cityInfoPopulationEl || !cityInfoDescEl) return;

  const city = getCityAt(agent.x, agent.y);
  if (!city) {
    cityInfoNameEl.textContent = "Neznámé město";
    cityInfoMetaEl.textContent = "Agent není ve městě";
    cityInfoPopulationEl.textContent = "Počet obyvatel: -";
    cityInfoDescEl.textContent = "Přesuň se do města pro detailní přehled.";
    renderCityInfoMap(null);
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
  const hasPopulation = typeof city.population === "number" && !Number.isNaN(city.population);
  cityInfoPopulationEl.textContent = hasPopulation
    ? `Počet obyvatel: ${formatPopulation(city.population)}`
    : "Počet obyvatel: -";
  cityInfoDescEl.textContent = city.description || "Chybí popis pro toto město.";
  renderCityInfoMap(city);
}

function renderCityInfoMap(city) {
  if (!cityInfoMapCtx || !cityInfoMapCanvas) return;
  cityInfoMapTargets = [];
  const ctx = cityInfoMapCtx;
  const width = cityInfoMapCanvas.width;
  const height = cityInfoMapCanvas.height;

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // podklad
  ctx.fillStyle = "#030617";
  ctx.fillRect(0, 0, width, height);

  if (mapLoaded && mapImage.complete) {
    ctx.globalAlpha = 0.92;
    ctx.drawImage(mapImage, 0, 0, width, height);
    ctx.globalAlpha = 1;
  }

  if (!city) {
    ctx.fillStyle = "rgba(248, 250, 252, 0.75)";
    ctx.font = "16px 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Vyber město pro zobrazení tras", width / 2, height / 2);
    hideCityInfoMapTooltip();
    ctx.restore();
    return;
  }

  const baseWidth = canvas ? canvas.width : 1024;
  const baseHeight = canvas ? canvas.height : 576;
  const scaleX = width / baseWidth;
  const scaleY = height / baseHeight;
  const cx = city.px * scaleX;
  const cy = city.py * scaleY;

  const connections = getConnections(city.name);
  const metroCities = Array.isArray(cities) ? cities.filter((c) => c && c.importance === 1) : [];

  // trasy
  ctx.strokeStyle = "rgba(248, 250, 252, 0.65)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  connections.forEach((target) => {
    if (!target) return;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo((target.px || 0) * scaleX, (target.py || 0) * scaleY);
    ctx.stroke();
  });

  const drawCityDot = (c, color, baseRadius, glow = false) => {
    if (!c) return;
    const px = (c.px || 0) * scaleX;
    const py = (c.py || 0) * scaleY;
    const radius = c.importance === 1 ? baseRadius + 2 : baseRadius;
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.2;
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };

  const seenMapTargets = new Set();
  const registerTarget = (c, label) => {
    if (!c) return;
    const key = c.id ?? (c.name || "").toLowerCase();
    if (!key || seenMapTargets.has(key)) return;
    seenMapTargets.add(key);
    cityInfoMapTargets.push({
      name: label || c.name,
      x: (c.px || 0) * scaleX,
      y: (c.py || 0) * scaleY,
    });
  };

  metroCities.forEach((metro) => {
    const isCurrentCity = metro.id === city.id;
    const alreadyConnection = connections.some((conn) => conn && conn.id === metro.id);
    const color = isCurrentCity ? "#fbbf24" : alreadyConnection ? "#38bdf8" : "#a5b4fc";
    const radius = isCurrentCity ? 6 : 3.5;
    const glow = isCurrentCity;
    drawCityDot(metro, color, radius, glow);
    registerTarget(metro);
  });

  connections.forEach((target) => {
    drawCityDot(target, "#38bdf8", 4);
    registerTarget(target);
  });
  drawCityDot(city, "#fbbf24", 6, true);
  registerTarget(city);

  if (connections.length === 0) {
    ctx.fillStyle = "rgba(248, 250, 252, 0.8)";
    ctx.font = "14px 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Žádné přímé linky z tohoto města", width / 2, height - 24);
  }

  ctx.restore();
}

function updateLabAvailability(city) {
  if (!labBtn) return;
  const allowed = !!city && city.importance === 1;
  labBtn.classList.toggle("hidden", !allowed);
  labBtn.setAttribute("aria-disabled", allowed ? "false" : "true");
  if (!allowed && labPanelEl) {
    labPanelEl.classList.add("hidden");
  }
  if (!allowed && activeFooterButton === "lab") {
    setActiveFooterButton(null);
  }
}

function updateWorkshopAvailability(city) {
  if (!workshopBtn) return;
  const allowed = !!city && city.importance !== 1;
  workshopBtn.classList.toggle("hidden", !allowed);
  workshopBtn.setAttribute("aria-disabled", allowed ? "false" : "true");
  if (!allowed && workshopPanelEl) {
    workshopPanelEl.classList.add("hidden");
  }
  if (!allowed && activeFooterButton === "workshop") {
    setActiveFooterButton(null);
  }
}

function updateBankAvailability(city) {
  if (!bankBtn) return;
  const allowed = !!city && city.importance === 1;
  bankBtn.classList.toggle("hidden", !allowed);
  bankBtn.setAttribute("aria-disabled", allowed ? "false" : "true");
}

function updateHqAvailability(city) {
  if (!hqBtn) return;
  const allowed = !!city && (city.importance === 1 || city.importance === 2);
  hqBtn.classList.toggle("hidden", !allowed);
  hqBtn.setAttribute("aria-disabled", allowed ? "false" : "true");
}

function renderLabPanel() {
  if (!labPanelEl) return;

  if (!labOverview) {
    if (labFogLevelLabel) labFogLevelLabel.textContent = "-";
    if (labFogLevelDesc) labFogLevelDesc.textContent = "Načítám data...";
    if (labFogLevelBar) labFogLevelBar.style.width = "12%";
    labActionElements.forEach((btn) => {
      btn.disabled = true;
      const statusEl = btn.querySelector("[data-action-status]");
      if (statusEl) {
        statusEl.textContent = "Načítám";
        statusEl.classList.remove("hidden");
        statusEl.classList.remove("text-rose-200", "text-emerald-200");
        statusEl.classList.add("text-amber-200");
      }
    });
    return;
  }

  const fog = labOverview.fog || {};
  if (labFogLevelLabel) {
    labFogLevelLabel.textContent = fog.label || "-";
  }
  if (labFogLevelDesc) {
    labFogLevelDesc.textContent = fog.description || "-";
  }
  if (labFogLevelBar && typeof fog.percent === "number") {
    const pct = Math.max(4, Math.min(100, fog.percent));
    labFogLevelBar.style.width = `${pct}%`;
  }

  const actionMap = new Map((labOverview.actions || []).map((action) => [action.code, action]));
  labActionElements.forEach((btn) => {
    const code = btn.dataset.actionCode;
    const action = actionMap.get(code);
    const statusEl = btn.querySelector("[data-action-status]");
    if (!action) {
      btn.disabled = true;
      if (statusEl) {
        statusEl.textContent = "Nedostupné";
        statusEl.classList.remove("hidden", "text-emerald-200");
        statusEl.classList.add("text-rose-200");
      }
      return;
    }

    const unlocked = !!action.is_unlocked;
    btn.disabled = !unlocked;
    if (statusEl) {
      statusEl.classList.remove("hidden");
      if (unlocked) {
        statusEl.textContent = action.cooldown_minutes ? `Cooldown ${action.cooldown_minutes}m` : "Připraveno";
        statusEl.classList.remove("text-rose-200", "text-amber-200");
        statusEl.classList.add("text-emerald-200");
      } else {
        statusEl.textContent = action.locked_reason || "Zamčeno";
        statusEl.classList.remove("text-emerald-200");
        statusEl.classList.add("text-rose-200");
      }
    }
  });
}

async function loadLabPanelData(force = false) {
  if (!labPanelEl) return;
  if (labOverviewLoading) return;
  if (labOverview && !force) {
    renderLabPanel();
    return;
  }
  labOverviewLoading = true;
  try {
    labOverview = await fetchLabOverview();
    renderLabPanel();
  } finally {
    labOverviewLoading = false;
  }
}

function showCityInfoMapTooltip(target, clientX, clientY) {
  if (!cityInfoMapTooltip || !cityInfoMapWrapper || !target) return;
  const wrapperRect = cityInfoMapWrapper.getBoundingClientRect();
  cityInfoMapTooltip.textContent = target.name || "-";
  cityInfoMapTooltip.style.left = `${clientX - wrapperRect.left + 12}px`;
  cityInfoMapTooltip.style.top = `${clientY - wrapperRect.top - 10}px`;
  cityInfoMapTooltip.classList.remove("hidden");
}

function hideCityInfoMapTooltip() {
  if (!cityInfoMapTooltip) return;
  cityInfoMapTooltip.classList.add("hidden");
}

function handleCityInfoMapHover(event) {
  if (!cityInfoMapCanvas || cityInfoMapTargets.length === 0) {
    hideCityInfoMapTooltip();
    return;
  }
  const rect = cityInfoMapCanvas.getBoundingClientRect();
  const scaleX = cityInfoMapCanvas.width / rect.width;
  const scaleY = cityInfoMapCanvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;

  let nearest = null;
  let bestDist = Infinity;
  const threshold = 14;
  for (const target of cityInfoMapTargets) {
    const dx = x - target.x;
    const dy = y - target.y;
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      bestDist = dist;
      nearest = target;
    }
  }

  if (nearest && bestDist <= threshold) {
    showCityInfoMapTooltip(nearest, event.clientX, event.clientY);
  } else {
    hideCityInfoMapTooltip();
  }
}

function showCityInfoPanel(show) {
  if (!cityInfoPanel) return;
  const shouldShow = !!show;
  cityInfoPanel.classList.toggle("hidden", !shouldShow);
  if (shouldShow) {
    showTimetablePanel(false);
    showTaskDetailPanel(false);
    if (labPanelEl) {
      labPanelEl.classList.add("hidden");
    }
    if (workshopPanelEl) {
      workshopPanelEl.classList.add("hidden");
    }
    renderCityInfo();
    maybeShowCityImage(getCityAt(agent.x, agent.y));
  }
}

function hideCityInfoPanel() {
  showCityInfoPanel(false);
  if (cityBackdropEl) {
    cityBackdropEl.classList.remove("hidden");
  }
  maybeShowCityImage(getCityAt(agent.x, agent.y));
  hideCityInfoMapTooltip();
}

function showLabPanel(show) {
  if (!labPanelEl) return;
  const shouldShow = !!show;
  const allowed = !labBtn || !labBtn.classList.contains("hidden");
  if (shouldShow && !allowed) {
    return;
  }
  labPanelEl.classList.toggle("hidden", !shouldShow);
  if (shouldShow) {
    hideCityInfoPanel();
    showTimetablePanel(false);
    showTaskDetailPanel(false);
    showWorkshopPanel(false);
    loadLabPanelData();
    notifyTaskLocationChange();
    loadStoryDialogs(true);
  } else {
    hideLabStoryNotice();
    maybeShowCityImage(getCityAt(agent.x, agent.y));
  }
}

function showWorkshopPanel(show) {
  if (!workshopPanelEl) return;
  const shouldShow = !!show;
  const allowed = !workshopBtn || !workshopBtn.classList.contains("hidden");
  if (shouldShow && !allowed) {
    return;
  }
  workshopPanelEl.classList.toggle("hidden", !shouldShow);
  if (shouldShow) {
    hideCityInfoPanel();
    showTimetablePanel(false);
    showTaskDetailPanel(false);
    showLabPanel(false);
  } else {
    maybeShowCityImage(getCityAt(agent.x, agent.y));
  }
}

async function maybeShowCityImage(city) {
  if (!canvas || !cityBackdropEl) return;
  const imgUrl = await findCityImageUrl(city);

  if (imgUrl) {
    cityBackdropEl.src = imgUrl;
    cityBackdropEl.classList.remove("opacity-0");
    canvas.classList.add("hidden");
  } else {
    cityBackdropEl.src = "";
    cityBackdropEl.classList.add("opacity-0");
    canvas.classList.remove("hidden");
  }
}

if (ticketToggleBtn) {
  ticketToggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const isVisible = timetableCardEl && !timetableCardEl.classList.contains("hidden");
    if (activeFooterButton === "timetable" && isVisible) {
      showTimetablePanel(false);
      setActiveFooterButton(null);
    } else {
      showTimetablePanel(true);
      setActiveFooterButton("timetable");
    }
  });
}
if (cityInfoMapCanvas) {
  cityInfoMapCanvas.addEventListener("mousemove", handleCityInfoMapHover);
  cityInfoMapCanvas.addEventListener("mouseleave", hideCityInfoMapTooltip);
}
if (cityHubBtn) {
  cityHubBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (activeFooterButton === "hub") {
      setActiveFooterButton(null);
      return;
    }
    showTimetablePanel(false);
    showTaskDetailPanel(false);
    hideCityInfoPanel();
    showLabPanel(false);
    showWorkshopPanel(false);
    maybeShowCityImage(getCityAt(agent.x, agent.y));
    setActiveFooterButton("hub");
  });
}
if (infoCenterBtn) {
  infoCenterBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const isVisible = cityInfoPanel && !cityInfoPanel.classList.contains("hidden");
    if (activeFooterButton === "info" && isVisible) {
      hideCityInfoPanel();
      setActiveFooterButton(null);
    } else {
      showCityInfoPanel(true);
      setActiveFooterButton("info");
    }
  });
}
if (labBtn) {
  labBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const isVisible = labPanelEl && !labPanelEl.classList.contains("hidden");
    if (activeFooterButton === "lab" && isVisible) {
      showLabPanel(false);
      setActiveFooterButton(null);
    } else {
      showLabPanel(true);
      setActiveFooterButton("lab");
    }
  });
}
if (workshopBtn) {
  workshopBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const isVisible = workshopPanelEl && !workshopPanelEl.classList.contains("hidden");
    if (activeFooterButton === "workshop" && isVisible) {
      showWorkshopPanel(false);
      setActiveFooterButton(null);
    } else {
      showWorkshopPanel(true);
      setActiveFooterButton("workshop");
    }
  });
}
if (taskCardEl) {
  taskCardEl.addEventListener("click", (e) => {
    e.preventDefault();
    hideTaskCelebration();
    const isVisible = taskDetailPanelEl && !taskDetailPanelEl.classList.contains("hidden");
    if (isVisible) {
      showTaskDetailPanel(false);
    } else {
      renderTaskDetailPanel();
      setTimetableRaised(false);
      showTaskDetailPanel(true);
    }
  });
}
if (closeTaskDetailBtn) {
  closeTaskDetailBtn.addEventListener("click", (e) => {
    e.preventDefault();
    showTaskDetailPanel(false);
  });
}
if (restartButton) {
  restartButton.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      if (window && window.localStorage) {
        window.localStorage.setItem(RANDOM_START_FLAG_KEY, "1");
      }
    } catch (err) {
      console.warn("Cannot store random start flag:", err);
    }

    try {
      const res = await fetch("/api/tasks/reset", { method: "POST" });
      if (!res.ok) {
        console.warn("Task pipeline reset failed with status", res.status);
      }
    } catch (err) {
      console.warn("Task pipeline reset request failed:", err);
    } finally {
      window.location.reload();
    }
  });
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

async function fetchLabOverview() {
  try {
    const res = await fetch("/api/lab/actions");
    if (!res.ok) {
      console.error("Nepodařilo se načíst laboratorní data.");
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("Chyba při načítání laboratorních dat:", err);
    return null;
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
  if (!travelOverlayEl) return;
  if (!travelAnimation) {
    travelOverlayEl.classList.add("hidden");
    return;
  }

  travelOverlayEl.classList.remove("hidden");

  const p = Math.min(1, Math.max(0, progress));
  travelAnimation.currentProgress = p;
  renderTravelMap(p);

  if (travelClockLabel) {
    const displayMinutes = Math.floor(currentMinutes);
    travelClockLabel.textContent = formatGameTime(displayMinutes);
  }
}

function buildTravelMapView(fromCity, toCity) {
  if (!fromCity || !toCity || !travelMapCanvas) return null;
  const paddingX = 240;
  const paddingY = 200;
  const minX = Math.min(fromCity.px, toCity.px);
  const maxX = Math.max(fromCity.px, toCity.px);
  const minY = Math.min(fromCity.py, toCity.py);
  const maxY = Math.max(fromCity.py, toCity.py);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const availableWidth = Math.max(20, LAND_MAX_X - LAND_MIN_X);
  const availableHeight = Math.max(20, LAND_MAX_Y - LAND_MIN_Y);
  const maxWidth = Math.min(BASE_MAP_WIDTH, availableWidth);
  const maxHeight = Math.min(BASE_MAP_HEIGHT, availableHeight);
  const viewWidth = clamp(spanX + paddingX, 260, maxWidth);
  const viewHeight = clamp(spanY + paddingY, 220, maxHeight);
  const halfWidth = viewWidth / 2;
  const halfHeight = viewHeight / 2;
  const minCenterX = LAND_MIN_X + halfWidth;
  const maxCenterX = LAND_MAX_X - halfWidth;
  const minCenterY = LAND_MIN_Y + halfHeight;
  const maxCenterY = LAND_MAX_Y - halfHeight;
  const clampedCenterX = clamp(centerX, minCenterX, maxCenterX);
  const clampedCenterY = clamp(centerY, minCenterY, maxCenterY);
  const minViewX = clamp(clampedCenterX - halfWidth, LAND_MIN_X, LAND_MAX_X - viewWidth);
  const minViewY = clamp(clampedCenterY - halfHeight, LAND_MIN_Y, LAND_MAX_Y - viewHeight);

  return {
    centerX: clampedCenterX,
    centerY: clampedCenterY,
    minX: minViewX,
    minY: minViewY,
    width: viewWidth,
    height: viewHeight,
    halfWidth,
    halfHeight,
  };
}

function projectTravelCityPosition(city, view) {
  if (!city || !view || !travelMapCanvas) return null;
  const scaleX = travelMapCanvas.width / view.width;
  const scaleY = travelMapCanvas.height / view.height;
  return {
    x: (city.px - view.minX) * scaleX,
    y: (city.py - view.minY) * scaleY,
  };
}

function drawTravelCityNode(ctx, pos, label, options = {}) {
  if (!ctx || !pos) return;
  const radius = options.radius ?? 9;
  ctx.save();
  ctx.fillStyle = options.fill || "rgba(248, 250, 252, 0.95)";
  ctx.strokeStyle = options.stroke || "rgba(15, 23, 42, 0.9)";
  ctx.lineWidth = options.lineWidth || 2;
  if (options.shadowColor) {
    ctx.shadowColor = options.shadowColor;
    ctx.shadowBlur = options.shadowBlur ?? 18;
  }
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  if (label) {
    ctx.save();
    ctx.font = "600 12px 'Inter', sans-serif";
    ctx.fillStyle = options.textColor || "rgba(248, 250, 252, 0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = options.textBaseline || "top";
    const offsetY = options.textOffsetY ?? radius + 8;
    ctx.fillText(label, pos.x, pos.y + offsetY);
    ctx.restore();
  }
}

function renderTravelMap(progress) {
  if (!travelMapCtx || !travelMapCanvas || !travelAnimation) return;
  const width = travelMapCanvas.width;
  const height = travelMapCanvas.height;
  travelMapCtx.clearRect(0, 0, width, height);

  const meta = travelAnimation.meta || {};
  let fromCity = meta.fromCity || getCityByNameInsensitive(meta.fromName);
  let toCity = meta.toCity || getCityByNameInsensitive(meta.toName);

  if (!meta.fromCity && fromCity) {
    travelAnimation.meta.fromCity = fromCity;
  }
  if (!meta.toCity && toCity) {
    travelAnimation.meta.toCity = toCity;
  }

  if (!travelAnimation.mapView && fromCity && toCity) {
    travelAnimation.mapView = buildTravelMapView(fromCity, toCity);
  }

  const view = travelAnimation.mapView;
  if (!fromCity || !toCity || !view) {
    travelMapCtx.fillStyle = "rgba(15, 23, 42, 0.9)";
    travelMapCtx.fillRect(0, 0, width, height);
    travelMapCtx.fillStyle = "rgba(148, 163, 184, 0.7)";
    travelMapCtx.font = "12px 'Inter', sans-serif";
    travelMapCtx.textAlign = "center";
    travelMapCtx.textBaseline = "middle";
    travelMapCtx.fillText("Čekám na mapu cesty...", width / 2, height / 2);
    return;
  }

  if (mapLoaded && mapImage.width && mapImage.height) {
    const baseWidth = BASE_MAP_WIDTH || mapImage.width;
    const baseHeight = BASE_MAP_HEIGHT || mapImage.height;
    const sourceX = (view.minX / baseWidth) * mapImage.width;
    const sourceY = (view.minY / baseHeight) * mapImage.height;
    const sourceWidth = (view.width / baseWidth) * mapImage.width;
    const sourceHeight = (view.height / baseHeight) * mapImage.height;
    travelMapCtx.save();
    travelMapCtx.globalAlpha = 0.95;
    travelMapCtx.drawImage(
      mapImage,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      height
    );
    travelMapCtx.restore();
  } else {
    const gradient = travelMapCtx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#0f172a");
    gradient.addColorStop(1, "#1e293b");
    travelMapCtx.fillStyle = gradient;
    travelMapCtx.fillRect(0, 0, width, height);
  }

  travelMapCtx.fillStyle = "rgba(2, 6, 23, 0.55)";
  travelMapCtx.fillRect(0, 0, width, height);

  if (Array.isArray(cities) && cities.length) {
    const viewMinX = view.minX ?? view.centerX - (view.width || 0) / 2;
    const viewMaxX = viewMinX + (view.width || 0);
    const viewMinY = view.minY ?? view.centerY - (view.height || 0) / 2;
    const viewMaxY = viewMinY + (view.height || 0);
    travelMapCtx.save();
    for (const city of cities) {
      if (city.px < viewMinX || city.px > viewMaxX || city.py < viewMinY || city.py > viewMaxY) {
        continue;
      }
      const projected = projectTravelCityPosition(city, view);
      if (!projected) continue;
      travelMapCtx.globalAlpha = city.importance === 1 ? 0.5 : 0.25;
      travelMapCtx.fillStyle = "rgba(148, 163, 184, 0.5)";
      travelMapCtx.beginPath();
      travelMapCtx.arc(projected.x, projected.y, city.importance === 1 ? 3.5 : 2, 0, Math.PI * 2);
      travelMapCtx.fill();
    }
    travelMapCtx.restore();
  }

  const fromPos = projectTravelCityPosition(fromCity, view);
  const toPos = projectTravelCityPosition(toCity, view);
  if (!fromPos || !toPos) return;

  travelMapCtx.save();
  travelMapCtx.strokeStyle = "rgba(94, 234, 212, 0.3)";
  travelMapCtx.lineWidth = 8;
  travelMapCtx.lineCap = "round";
  travelMapCtx.globalAlpha = 0.35;
  travelMapCtx.beginPath();
  travelMapCtx.moveTo(fromPos.x, fromPos.y);
  travelMapCtx.lineTo(toPos.x, toPos.y);
  travelMapCtx.stroke();
  travelMapCtx.restore();

  travelMapCtx.save();
  travelMapCtx.strokeStyle = "rgba(56, 189, 248, 0.95)";
  travelMapCtx.lineWidth = 2.5;
  travelMapCtx.setLineDash([10, 8]);
  travelMapCtx.beginPath();
  travelMapCtx.moveTo(fromPos.x, fromPos.y);
  travelMapCtx.lineTo(toPos.x, toPos.y);
  travelMapCtx.stroke();
  travelMapCtx.restore();
  travelMapCtx.setLineDash([]);

  const indicatorPos = {
    x: fromPos.x + (toPos.x - fromPos.x) * progress,
    y: fromPos.y + (toPos.y - fromPos.y) * progress,
  };

  travelMapCtx.save();
  const glow = travelMapCtx.createRadialGradient(
    indicatorPos.x,
    indicatorPos.y,
    0,
    indicatorPos.x,
    indicatorPos.y,
    28
  );
  glow.addColorStop(0, "rgba(14, 165, 233, 0.4)");
  glow.addColorStop(1, "rgba(14, 165, 233, 0)");
  travelMapCtx.fillStyle = glow;
  travelMapCtx.fillRect(indicatorPos.x - 30, indicatorPos.y - 30, 60, 60);
  travelMapCtx.restore();

  travelMapCtx.save();
  travelMapCtx.fillStyle = "#38bdf8";
  travelMapCtx.shadowColor = "rgba(14, 165, 233, 0.9)";
  travelMapCtx.shadowBlur = 22;
  travelMapCtx.beginPath();
  travelMapCtx.arc(indicatorPos.x, indicatorPos.y, 7, 0, Math.PI * 2);
  travelMapCtx.fill();
  travelMapCtx.restore();

  travelMapCtx.save();
  travelMapCtx.strokeStyle = "rgba(14, 165, 233, 0.9)";
  travelMapCtx.lineWidth = 2;
  travelMapCtx.beginPath();
  travelMapCtx.arc(indicatorPos.x, indicatorPos.y, 10, 0, Math.PI * 2);
  travelMapCtx.stroke();
  travelMapCtx.restore();

  drawTravelCityNode(travelMapCtx, fromPos, formatCityLabel(fromCity.name), {
    fill: "rgba(251, 191, 36, 0.95)",
    stroke: "rgba(2, 6, 23, 0.9)",
    shadowColor: "rgba(251, 191, 36, 0.45)",
    textBaseline: "top",
    textOffsetY: 12,
  });

  drawTravelCityNode(travelMapCtx, toPos, formatCityLabel(toCity.name), {
    fill: "rgba(248, 113, 113, 0.95)",
    stroke: "rgba(2, 6, 23, 0.9)",
    shadowColor: "rgba(248, 113, 113, 0.45)",
    textBaseline: "bottom",
    textOffsetY: -12,
  });
}

function completeTravel(targetCity) {
  if (!targetCity) return;
  grantTravelXp(5);
  travelToCity(targetCity, { silent: true });
  renderTimetablePage();
}

function startTravelAnimation(travel) {
  if (!travel) return;
  console.log("Start animace cestovani", travel);
  playTravelSound();

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
  const fromCityObj = getCityByNameInsensitive(travel.fromName);
  const toCityObj = getCityByNameInsensitive(travel.toName);
  const initialMapView = buildTravelMapView(fromCityObj, toCityObj);

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
    currentProgress: 0,
    mapView: initialMapView,
    meta: {
      fromName: travel.fromName,
      toName: travel.toName,
      fromCity: fromCityObj || null,
      toCity: toCityObj || null,
    },
  };

  // vyplnit overlay statické údaje
  const lineLabel = formatLineTypeLabel(travel.lineType);
  const trainLevel = getTrainLevel(travel.lineType);
  const trainSpeed = getTrainSpeedMph(trainLevel);

  if (travelTopType) {
    travelTopType.textContent = lineLabel;
  }
  if (travelTopSpeed) {
    travelTopSpeed.textContent = `${trainSpeed} mph`;
  }
  if (travelTrainImg) {
    if (trainLevel === 1) {
      travelTrainImg.src = "/static/assets/train_1.png";
    } else if (trainLevel === 2) {
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
  const timeEl = document.getElementById("currentTimeLabel");
  const weekEl = document.getElementById("currentWeekLabel");

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
    updateLabAvailability(null);
    updateWorkshopAvailability(null);
    updateBankAvailability(null);
    updateHqAvailability(null);
    if (timeEl || weekEl) {
      const { weekText, timeText } = formatWeekAndTime(gameMinutes);
      if (weekEl) weekEl.textContent = weekText;
      if (timeEl) timeEl.textContent = timeText;
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
  updateLabAvailability(city);
  updateWorkshopAvailability(city);
  updateBankAvailability(city);
  updateHqAvailability(city);
  renderCityInfo();
  maybeShowCityImage(city);

  if (timeEl || weekEl) {
    const { weekText, timeText } = formatWeekAndTime(gameMinutes);
    if (weekEl) weekEl.textContent = weekText;
    if (timeEl) timeEl.textContent = timeText;
  }
}

function renderTimetablePage() {
  // Nevykresluj tabulku během animace přesunu (čas se řídí animací)
  if (travelAnimation) return;

  const timeEl = document.getElementById("currentTimeLabel");
  const weekEl = document.getElementById("currentWeekLabel");
  const tbody = document.getElementById("timetableBody");
  if (!timeEl || !tbody) return;

  // Aktualizace zobrazeného času
  const { weekText, timeText } = formatWeekAndTime(gameMinutes);
  if (weekEl) weekEl.textContent = weekText;
  timeEl.textContent = timeText;
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
        if (ticketSound) {
          try {
            ticketSound.currentTime = 0;
            ticketSound.play().catch(() => {});
          } catch (err) {
            console.warn("Ticket sound playback failed", err);
          }
        }
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

  // 3) vytvoříme mapu podle jména (citlivou i na lowercase)
  cityByName = new Map();
  cities.forEach((city) => {
    if (!city || !city.name) return;
    cityByName.set(city.name, city);
    cityByName.set(city.name.toLowerCase(), city);
  });

  const randomStartRequested = consumeRandomStartFlag();

  // 4) vybereme startovní město – ideálně z API, jinak náhodné jako fallback
  let startCity = null;
  if (!randomStartRequested && agentCurrentCityId !== null) {
    startCity = cities.find((c) => c.id === agentCurrentCityId) || null;
  }
  if (!startCity && !randomStartRequested && agentCurrentCityName) {
    startCity = cityByName.get(agentCurrentCityName) || null;
  }
  if (!startCity && cities.length) {
    startCity = cities[Math.floor(Math.random() * cities.length)] || null;
  }

  if (startCity) {
    const shouldPersist = randomStartRequested || agentCurrentCityId === null || startCity.id !== agentCurrentCityId;
    setAgentPositionToCity(startCity, { persist: shouldPersist });
    console.log("Startovní město:", startCity.name, randomStartRequested ? "(náhodný restart)" : "");
  }

  // 5) načteme vlakové trasy
  trainLines = await fetchTrainLines();

  // 6) postavíme mapu spojů podle názvu města
  buildConnectionsMap();
  renderCityInfoMap(getCityAt(agent.x, agent.y));

  // 7) UI – sidebar + tabulka
  updateSidebar();
  updateAgentHeader();
  maybeShowCityImage(getCityAt(agent.x, agent.y));
  applySkyGradientForMinutes(gameMinutes);
  await updateTimetable();
  notifyTaskLocationChange();

  gameLoop();
}


renderTaskCard();
renderTaskDetailPanel();
loadAgentTasks();
init();
