import { getDomRefs } from "./dom.js";
import { createConfig } from "./config.js";
import { createInitialState } from "./state.js";
import { createTimeService } from "./time.js";
import { createAgentService } from "./agent.js";
import { createMapService } from "./map.js";
import { createTasksService } from "./tasks.js";
import { createTravelService } from "./travel.js";
import { createUiService } from "./ui.js";

export function initGame() {
  const dom = getDomRefs();
  const config = createConfig(dom);
  const state = createInitialState();
  const time = createTimeService({ config, state });
  let uiService = null;
  const uiProxy = {
    isLabPanelVisible: () => uiService?.isLabPanelVisible() ?? false,
    isMarketPanelVisible: () => uiService?.isMarketPanelVisible() ?? false,
    hideAllPanelsExcept: (key) => uiService?.hideAllPanelsExcept(key),
    setActiveFooterButton: (key) => uiService?.setActiveFooterButton(key),
    setTimetableRaised: (value) => uiService?.setTimetableRaised(value),
    getCurrentCitySnapshot: () => uiService?.getCurrentCitySnapshot(),
    travelToCity: (...args) => uiService?.travelToCity(...args),
    renderTimetablePage: () => uiService?.renderTimetablePage(),
    applySkyGradientForMinutes: (minutes) => uiService?.applySkyGradientForMinutes(minutes),
    findDepartureToCity: (name) => uiService?.findDepartureToCity(name),
    queueLevelUps: (payload) => uiService?.queueLevelUps(payload),
  };

  const agent = createAgentService({ config, state, dom, time, ui: uiProxy });
  const map = createMapService({ config, state });

  const tasks = createTasksService({ state, dom, time, agent, map, ui: uiProxy });
  const travel = createTravelService({ config, state, dom, time, map, agent, ui: uiProxy });
  uiService = createUiService({ config, state, dom, time, map, travel, tasks, agent });

  function attachDebugApi() {
    if (typeof window === "undefined") return;

    function refreshTimeUi() {
      uiService.applySkyGradientForMinutes(time.getGameMinutes());
      uiService.renderTimetablePage();
      uiService.updateTimetable();
      uiService.updateSidebar();
    }

    function getLevelForXp(xp) {
      const cfg = state.agent.levelConfig || [];
      let level = 1;
      for (const entry of cfg) {
        const threshold = entry._xp_total ?? 0;
        if (xp >= threshold) {
          level = entry.level;
        } else {
          break;
        }
      }
      return level;
    }

    function setXp(totalXp) {
      const safeXp = Math.max(0, Math.round(totalXp || 0));
      state.agent.stats.xp = safeXp;
      const nextLevel = getLevelForXp(safeXp);
      state.agent.stats.level = nextLevel;
      const levelCfg = state.agent.levelConfig?.find((entry) => entry.level === nextLevel);
      if (levelCfg && state.agent.stats.energy_current === undefined) {
        state.agent.stats.energy_current = 0;
      }
      agent.updateAgentHeader();
      return safeXp;
    }

    window.debugGame = {
      help: () => ({
        addXp: "addXp(amount)",
        setXp: "setXp(totalXp)",
        setLevel: "setLevel(level)",
        addMinutes: "addMinutes(minutes)",
        setMinutes: "setMinutes(totalMinutes)",
        completeObjective: "completeObjective(taskId, objectiveIndex)",
        completeAllObjectives: "completeAllObjectives(taskId)",
        reloadTasks: "reloadTasks()",
        listTasks: "listTasks()",
        setActiveTask: "setActiveTask(taskId)",
        teleport: "teleport(cityNameOrId)",
      }),
      addXp: (amount = 0) => {
        const delta = Math.round(amount || 0);
        if (delta > 0) {
          agent.grantTravelXp(delta);
          return state.agent.stats.xp;
        }
        return setXp((state.agent.stats.xp || 0) + delta);
      },
      setXp,
      setLevel: (level = 1) => {
        const cfg = state.agent.levelConfig || [];
        const clamped = Math.max(1, Math.round(level || 1));
        if (!cfg.length) return setXp(0);
        const target = cfg.find((entry) => entry.level === clamped) || cfg[cfg.length - 1];
        const xpTarget = target?._xp_total ?? 0;
        return setXp(xpTarget);
      },
      addMinutes: (minutes = 0) => {
        const delta = Math.round(minutes || 0);
        time.setGameMinutes(Math.max(0, time.getGameMinutes() + delta));
        time.markUnsaved();
        refreshTimeUi();
        return time.getGameMinutes();
      },
      setMinutes: (minutes = 0) => {
        time.setGameMinutes(Math.max(0, Math.round(minutes || 0)));
        time.markUnsaved();
        refreshTimeUi();
        return time.getGameMinutes();
      },
      completeObjective: (taskId, objectiveIndex) => tasks.completeTaskObjective(taskId, objectiveIndex),
      completeAllObjectives: async (taskId) => {
        const task = state.tasks.list.find((entry) => entry.id === taskId);
        if (!task) return false;
        const total = Array.isArray(task.objectives) ? task.objectives.length : 0;
        for (let i = 0; i < total; i += 1) {
          await tasks.completeTaskObjective(taskId, i);
        }
        return true;
      },
      reloadTasks: () => tasks.loadAgentTasks(),
      listTasks: () =>
        (state.tasks.list || []).map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          progress: task.progress,
          objectives: Array.isArray(task.objectives) ? task.objectives.length : 0,
        })),
      setActiveTask: (taskId) => tasks.setActiveTask(taskId),
      teleport: (nameOrId) => {
        const city =
          map.getCityById(nameOrId) ||
          map.getCityByNameInsensitive(String(nameOrId || ""));
        if (!city) return false;
        uiService.travelToCity(city, { silent: true });
        uiService.updateSidebar();
        return true;
      },
    };
  }

  attachDebugApi();

  map.initMapImage(() => {
    uiService.renderCityInfoMap(uiService.getCurrentCitySnapshot());
  });

  const infectedTiles = [];
  for (let i = 0; i < 40; i++) {
    infectedTiles.push({
      x: Math.floor(Math.random() * config.gridCols),
      y: Math.floor(Math.random() * config.gridRows),
    });
  }

  function drawInfectedTiles(ctx) {
    if (!ctx) return;
    infectedTiles.forEach((tile) => {
      ctx.fillStyle = "rgba(239, 68, 68, 0.7)";
      ctx.fillRect(
        tile.x * config.tileSize + 4,
        tile.y * config.tileSize + 4,
        config.tileSize - 8,
        config.tileSize - 8
      );
    });
  }

  function cleanCity() {
    const city = map.getCityAt(state.agent.position.x, state.agent.position.y);
    if (!city) return;

    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const nx = city.x + dx;
        const ny = city.y + dy;
        if (nx >= 0 && ny >= 0 && nx < config.gridCols && ny < config.gridRows) {
          state.fog.tiles.delete(map.tileIndex(nx, ny));
        }
      }
    }

    console.log("Město vyčištěno:", city.name);
  }

  function update() {
    const now = performance.now();
    const deltaMs = now - state.time.lastFrameMs;
    state.time.lastFrameMs = now;

    if (travel.tickTravelAnimation(now)) {
      return;
    }

    const advancedMinutes = time.advanceTime(deltaMs);
    if (advancedMinutes > 0) {
      uiService.applySkyGradientForMinutes(time.getGameMinutes());
      uiService.renderTimetablePage();
      uiService.updateTimetable();
    }

    travel.maybeStartPendingTravel();
  }

  function gameLoop() {
    update();
    map.spreadFog();
    map.drawGrid(dom.ctx);
    drawInfectedTiles(dom.ctx);
    map.drawFog(dom.ctx);
    map.drawTrainLines(dom.ctx);
    map.drawCities(dom.ctx);
    requestAnimationFrame(gameLoop);
  }

  async function fetchCities() {
    const res = await fetch("/api/cities");
    if (!res.ok) {
      console.error("Nepodařilo se načíst města.");
      return [];
    }
    return await res.json();
  }

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

  async function init() {
    map.initFog();

    const randomStartRequested = agent.consumeRandomStartFlag();
    if (randomStartRequested) {
      await agent.resetAgentState();
    }

    await agent.loadAgentAndLevels();
    const restoredGameTime = time.loadPersistedGameMinutes();
    if (!restoredGameTime) {
      state.time.lastSavedGameMinutes = Math.max(0, Math.round(state.time.gameMinutes ?? 0));
      state.time.hasUnsavedTime = false;
    }

    const rawCities = await fetchCities();
    map.setCities(rawCities);
    uiService.populateTeleportSelect();

    let startCity = null;
    if (!randomStartRequested && state.agent.currentCityId !== null) {
      startCity = state.map.cities.find((c) => c.id === state.agent.currentCityId) || null;
    }
    if (!startCity && !randomStartRequested && state.agent.currentCityName) {
      startCity = state.map.cityByName.get(state.agent.currentCityName) || null;
    }
    if (!startCity && state.map.cities.length) {
      startCity = state.map.cities[Math.floor(Math.random() * state.map.cities.length)] || null;
    }

    if (startCity) {
      const shouldPersist = randomStartRequested || state.agent.currentCityId === null || startCity.id !== state.agent.currentCityId;
      agent.setAgentPositionToCity(startCity, { persist: shouldPersist });
      console.log("Startovní město:", startCity.name, randomStartRequested ? "(náhodný restart)" : "");
    }

    state.train.lines = await fetchTrainLines();
    map.buildConnectionsMap();
    uiService.renderCityInfoMap(map.getCityAt(state.agent.position.x, state.agent.position.y));

    uiService.updateSidebar();
    agent.updateAgentHeader();
    uiService.maybeShowCityImage(map.getCityAt(state.agent.position.x, state.agent.position.y));
    uiService.applySkyGradientForMinutes(time.getGameMinutes());
    await uiService.updateTimetable();
    tasks.notifyTaskLocationChange();

    gameLoop();

    setInterval(async () => {
      if (document.hidden) return;
      await agent.loadAgentAndLevels();
    }, 5000);
  }

  uiService.initUiEvents();
  tasks.initTaskEvents();

  if (dom.canvas) {
    dom.canvas.addEventListener("mousemove", (e) => {
      const rect = dom.canvas.getBoundingClientRect();
      const scaleX = dom.canvas.width / rect.width;
      const scaleY = dom.canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      map.setHoveredCity(map.findCityAtPixel(x, y));
    });

    dom.canvas.addEventListener("mouseleave", () => {
      map.setHoveredCity(null);
    });

    dom.canvas.addEventListener("click", () => {
      const timetableWasActive = uiService && state.ui.activeFooterButton === "timetable";
      uiService.showTimetablePanel(false);
      tasks.showTaskDetailPanel(false);
      if (timetableWasActive) {
        uiService.setActiveFooterButton(null);
      }
    });
  }

  window.addEventListener("keydown", (e) => {
    switch (e.key) {
      case " ":
        cleanCity();
        e.preventDefault();
        break;
      case "c":
      case "C":
        uiService.travelFromCurrentCity();
        e.preventDefault();
        break;
      default:
        break;
    }
  });

  window.addEventListener("beforeunload", (e) => {
    if (!time.hasUnsavedProgress()) return;
    e.preventDefault();
    e.returnValue = "Hra není uložená.";
  });

  window.onbeforeunload = (e) => {
    if (!time.hasUnsavedProgress()) return;
    e.preventDefault();
    e.returnValue = "Hra není uložená.";
    return e.returnValue;
  };

  tasks.renderTaskCard();
  tasks.renderTaskDetailPanel();
  tasks.loadAgentTasks();
  init();
}
