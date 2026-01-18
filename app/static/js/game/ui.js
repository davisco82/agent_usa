export function createUiService({ config, state, dom, time, map, travel, tasks, agent }) {
  const uiState = state.ui;
  const trainState = state.train;
  const agentState = state.agent;
  const levelUpQueue = [];
  let activeLevelUp = null;
  const unlockRules = {
    lab: { minLevel: 1 },
    workshop: { minLevel: 2 },
    market: { minLevel: 1 },
    bank: { minLevel: 2 },
    hq: { minLevel: 2 },
  };

  function isTaskCompleted(taskId) {
    if (!taskId || !Array.isArray(state.tasks.list)) return false;
    const task = state.tasks.list.find((entry) => entry.id === taskId);
    if (!task) return false;
    return task.status === "completed" || task.status === "rewarded";
  }

  function isUnlocked(key) {
    const rule = unlockRules[key];
    if (!rule) return true;
    const level = agentState.stats.level || 1;
    const minLevelOk = !rule.minLevel || level >= rule.minLevel;
    const taskIds = Array.isArray(rule.taskIds) ? rule.taskIds : [];
    if (!taskIds.length) return minLevelOk;
    const completedCount = taskIds.filter(isTaskCompleted).length;
    const taskOk = rule.taskUnlockMode === "all" ? completedCount === taskIds.length : completedCount > 0;
    return minLevelOk || taskOk;
  }

  function setActiveFooterButton(key) {
    uiState.activeFooterButton = key;
    const footerButtons = {
      hub: dom.cityHubBtn,
      timetable: dom.ticketToggleBtn,
      info: dom.infoCenterBtn,
      lab: dom.labBtn,
      workshop: dom.workshopBtn,
      market: dom.marketBtn,
    };
    Object.entries(footerButtons).forEach(([btnKey, btn]) => {
      if (!btn) return;
      const isActive = btnKey === key;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function setTimetableRaised(raised) {
    uiState.timetableRaised = !!raised;
    if (dom.timetableCardEl) {
      dom.timetableCardEl.classList.toggle("timetable-raised", uiState.timetableRaised);
    }
  }

  function showTimetablePanel(show) {
    if (!dom.timetableCardEl) return;
    if (show) {
      dom.timetableCardEl.classList.remove("hidden");
      hidePanelsFor("timetable");
    } else {
      dom.timetableCardEl.classList.add("hidden");
    }
    setTimetableRaised(false);
  }

  function hidePanelsFor(active) {
    if (active !== "info" && dom.cityInfoPanel) {
      dom.cityInfoPanel.classList.add("hidden");
    }
    if (active !== "hq" && dom.hqPanelEl) {
      dom.hqPanelEl.classList.add("hidden");
    }
    if (active !== "lab" && dom.labPanelEl) {
      dom.labPanelEl.classList.add("hidden");
    }
    if (active !== "workshop" && dom.workshopPanelEl) {
      dom.workshopPanelEl.classList.add("hidden");
    }
    if (active !== "market" && dom.marketPanelEl) {
      dom.marketPanelEl.classList.add("hidden");
    }
    if (active !== "tasks" && dom.taskDetailPanelEl) {
      dom.taskDetailPanelEl.classList.add("hidden");
    }
  }

  function hideAllPanelsExcept(active) {
    if (active !== "timetable") {
      showTimetablePanel(false);
    }
    hidePanelsFor(active);
  }

  function isLabPanelVisible() {
    return dom.labPanelEl && !dom.labPanelEl.classList.contains("hidden");
  }

  function isHqPanelVisible() {
    return dom.hqPanelEl && !dom.hqPanelEl.classList.contains("hidden");
  }

  function isMarketPanelVisible() {
    return dom.marketPanelEl && !dom.marketPanelEl.classList.contains("hidden");
  }

  function applySkyGradientForMinutes(totalMinutes) {
    if (!dom.skyGradientEl) return;
    const minutesNorm = ((totalMinutes % config.minutesPerDay) + config.minutesPerDay) % config.minutesPerDay;
    const hour = Math.floor(minutesNorm / 60);
    let phase = "day";
    if (hour >= 20 || hour < 6) {
      phase = "night";
    } else if (hour >= 18 && hour < 20) {
      phase = "dusk";
    } else if (hour >= 6 && hour < 8) {
      phase = "dawn";
    }

    if (phase === uiState.lastSkyPhase) return;
    uiState.lastSkyPhase = phase;

    const gradients = {
      day: "linear-gradient(180deg, #3f7fd8 0%, #8fcfff 55%, #f4fbff 100%)",
      dusk: "linear-gradient(180deg, #E6A36A 0%, #D8A0A6 45%, #B7B3C7 72%, #7F8FA6 100%)",
      night: "linear-gradient(180deg, rgba(8,12,28,0.95) 0%, rgba(6,18,44,0.9) 50%, rgba(4,12,28,0.9) 100%)",
      dawn: "linear-gradient(180deg, rgba(105,128,168,0.9) 0%, rgba(162,156,190,0.8) 48%, rgba(228,186,160,0.78) 78%, rgba(248,214,190,0.72) 100%)",
    };

    dom.skyGradientEl.style.background = gradients[phase] || gradients.day;
    if (dom.nightOverlayEl) {
      dom.nightOverlayEl.style.opacity = phase === "night" ? "0.85" : "0";
    }
    if (dom.daySunOverlayEl) {
      dom.daySunOverlayEl.style.opacity = phase === "day" ? "0.45" : "0";
    }
    if (dom.cityBackdropEl) {
      dom.cityBackdropEl.style.filter =
        phase === "dusk" || phase === "dawn"
          ? `${config.baseBackdropFilter} brightness(0.82)`
          : config.baseBackdropFilter;
    }
  }

  function getCurrentCitySnapshot() {
    const currentCity = map.getCityAt(agentState.position.x, agentState.position.y);
    if (currentCity) return currentCity;
    if (agentState.currentCityName) {
      const fallback = map.getCityByNameInsensitive(agentState.currentCityName);
      if (fallback) {
        return fallback;
      }
    }
    return null;
  }

  function updateLabAvailability(city) {
    if (!dom.labBtn) return;
    const allowed = isUnlocked("lab") && !!city && city.importance === 1;
    dom.labBtn.classList.toggle("hidden", !allowed);
    dom.labBtn.setAttribute("aria-disabled", allowed ? "false" : "true");
    if (!allowed && dom.labPanelEl) {
      dom.labPanelEl.classList.add("hidden");
    }
    if (!allowed && uiState.activeFooterButton === "lab") {
      setActiveFooterButton(null);
    }
  }

  function updateWorkshopAvailability(city) {
    if (!dom.workshopBtn) return;
    const allowed = isUnlocked("workshop") && !!city && city.importance !== 1;
    dom.workshopBtn.classList.toggle("hidden", !allowed);
    dom.workshopBtn.setAttribute("aria-disabled", allowed ? "false" : "true");
    if (!allowed && dom.workshopPanelEl) {
      dom.workshopPanelEl.classList.add("hidden");
    }
    if (!allowed && uiState.activeFooterButton === "workshop") {
      setActiveFooterButton(null);
    }
  }

  function updateBankAvailability(city) {
    if (!dom.bankBtn) return;
    const allowed = isUnlocked("bank") && !!city && city.importance === 1;
    dom.bankBtn.classList.toggle("hidden", !allowed);
    dom.bankBtn.setAttribute("aria-disabled", allowed ? "false" : "true");
  }

  function updateMarketAvailability(city) {
    if (!dom.marketBtn) return;
    const allowed = isUnlocked("market") && !!city;
    dom.marketBtn.classList.toggle("hidden", !allowed);
    dom.marketBtn.setAttribute("aria-disabled", allowed ? "false" : "true");
    if (!allowed && dom.marketPanelEl) {
      dom.marketPanelEl.classList.add("hidden");
    }
    if (!allowed && uiState.activeFooterButton === "market") {
      setActiveFooterButton(null);
    }
  }

  function updateHqAvailability(city) {
    if (!dom.hqBtn) return;
    const allowed =
      isUnlocked("hq") &&
      !!city &&
      agentState.hqCityId !== null &&
      Number(city.id) === Number(agentState.hqCityId);
    dom.hqBtn.classList.toggle("hidden", !allowed);
    dom.hqBtn.setAttribute("aria-disabled", allowed ? "false" : "true");
    if (!allowed && dom.hqPanelEl) {
      dom.hqPanelEl.classList.add("hidden");
    }
    if (!allowed && uiState.activeFooterButton === "hq") {
      setActiveFooterButton(null);
    }
  }

  function renderLabPanel() {
    if (!dom.labPanelEl) return;

    if (!uiState.labOverview) {
      if (dom.labFogLevelLabel) dom.labFogLevelLabel.textContent = "-";
      if (dom.labFogLevelDesc) dom.labFogLevelDesc.textContent = "Načítám data...";
      if (dom.labFogLevelBar) dom.labFogLevelBar.style.width = "12%";
      dom.labActionElements.forEach((btn) => {
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

    const fog = uiState.labOverview.fog || {};
    if (dom.labFogLevelLabel) {
      dom.labFogLevelLabel.textContent = fog.label || "-";
    }
    if (dom.labFogLevelDesc) {
      dom.labFogLevelDesc.textContent = fog.description || "-";
    }
    if (dom.labFogLevelBar && typeof fog.percent === "number") {
      const pct = Math.max(4, Math.min(100, fog.percent));
      dom.labFogLevelBar.style.width = `${pct}%`;
    }

    const actionMap = new Map((uiState.labOverview.actions || []).map((action) => [action.code, action]));
    dom.labActionElements.forEach((btn) => {
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
    if (!dom.labPanelEl) return;
    if (uiState.labOverviewLoading) return;
    if (uiState.labOverview && !force) {
      renderLabPanel();
      return;
    }
    uiState.labOverviewLoading = true;
    try {
      const res = await fetch("/api/lab/actions");
      if (!res.ok) {
        console.error("Nepodařilo se načíst laboratorní data.");
        uiState.labOverview = null;
      } else {
        uiState.labOverview = await res.json();
      }
      renderLabPanel();
    } finally {
      uiState.labOverviewLoading = false;
    }
  }

  function showCityInfoMapTooltip(target, clientX, clientY) {
    if (!dom.cityInfoMapTooltip || !dom.cityInfoMapWrapper || !target) return;
    const wrapperRect = dom.cityInfoMapWrapper.getBoundingClientRect();
    dom.cityInfoMapTooltip.textContent = target.name || "-";
    dom.cityInfoMapTooltip.style.left = `${clientX - wrapperRect.left + 12}px`;
    dom.cityInfoMapTooltip.style.top = `${clientY - wrapperRect.top - 10}px`;
    dom.cityInfoMapTooltip.classList.remove("hidden");
  }

  function hideCityInfoMapTooltip() {
    if (!dom.cityInfoMapTooltip) return;
    dom.cityInfoMapTooltip.classList.add("hidden");
  }

  function hideWorldMapTooltip() {
    if (!dom.worldMapTooltip) return;
    dom.worldMapTooltip.classList.add("hidden");
  }

  function showWorldMapTooltip(target, clientX, clientY) {
    if (!dom.worldMapTooltip || !dom.worldMapCanvas) return;
    const rect = dom.worldMapCanvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    dom.worldMapTooltip.textContent = target.name;
    dom.worldMapTooltip.style.left = `${x}px`;
    dom.worldMapTooltip.style.top = `${y}px`;
    dom.worldMapTooltip.classList.remove("hidden");
  }

  function handleWorldMapHover(event) {
    if (!dom.worldMapCanvas || uiState.worldMapTargets.length === 0) {
      hideWorldMapTooltip();
      return;
    }
    const rect = dom.worldMapCanvas.getBoundingClientRect();
    const scaleX = dom.worldMapCanvas.width / rect.width;
    const scaleY = dom.worldMapCanvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    let nearest = null;
    let bestDist = Infinity;
    const threshold = 12;
    for (const target of uiState.worldMapTargets) {
      const dx = x - target.x;
      const dy = y - target.y;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = target;
      }
    }

    if (nearest && bestDist <= threshold) {
      showWorldMapTooltip(nearest, event.clientX, event.clientY);
    } else {
      hideWorldMapTooltip();
    }
  }

  function handleCityInfoMapHover(event) {
    if (!dom.cityInfoMapCanvas || uiState.cityInfoMapTargets.length === 0) {
      hideCityInfoMapTooltip();
      return;
    }
    const rect = dom.cityInfoMapCanvas.getBoundingClientRect();
    const scaleX = dom.cityInfoMapCanvas.width / rect.width;
    const scaleY = dom.cityInfoMapCanvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    let nearest = null;
    let bestDist = Infinity;
    const threshold = 14;
    for (const target of uiState.cityInfoMapTargets) {
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

  function renderCityInfoMap(city) {
    if (!dom.cityInfoMapCtx || !dom.cityInfoMapCanvas) return;
    uiState.cityInfoMapTargets = [];
    const ctx = dom.cityInfoMapCtx;
    const width = dom.cityInfoMapCanvas.width;
    const height = dom.cityInfoMapCanvas.height;
    const offsetX = 30;
    const offsetY = 0;
    const mapWidth = Math.max(0, width - 60);
    const mapHeight = height - offsetY;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#030617";
    ctx.fillRect(0, 0, width, height);

    if (state.map.mapLoaded && state.map.mapImage.complete) {
      ctx.globalAlpha = 0.92;
      ctx.drawImage(state.map.mapImage, offsetX, offsetY, mapWidth, mapHeight);
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

    const baseWidth = dom.canvas ? dom.canvas.width : 1024;
    const baseHeight = dom.canvas ? dom.canvas.height : 576;
    const scaleX = mapWidth / baseWidth;
    const scaleY = mapHeight / baseHeight;
    const cx = city.px * scaleX + offsetX;
    const cy = city.py * scaleY + offsetY;

    ctx.beginPath();
    ctx.fillStyle = "#fbbf24";
    ctx.shadowColor = "rgba(251, 191, 36, 0.9)";
    ctx.shadowBlur = 12;
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    ctx.lineWidth = 2.2;
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  function renderWorldMap() {
    if (!dom.worldMapCtx || !dom.worldMapCanvas) return;
    const ctx = dom.worldMapCtx;
    const width = dom.worldMapCanvas.width;
    const height = dom.worldMapCanvas.height;
    uiState.worldMapTargets = [];
    const offsetX = 30;
    const offsetY = 0;
    const mapWidth = width - offsetX;
    const mapHeight = height - offsetY;

    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, width, height);

    if (state.map.mapLoaded && state.map.mapImage.complete) {
      ctx.globalAlpha = 0.95;
      ctx.drawImage(state.map.mapImage, offsetX, offsetY, mapWidth, mapHeight);
      ctx.globalAlpha = 1;
    }

    const baseWidth = config.baseMapWidth || (dom.canvas ? dom.canvas.width : width);
    const baseHeight = config.baseMapHeight || (dom.canvas ? dom.canvas.height : height);
    const scaleX = mapWidth / baseWidth;
    const scaleY = mapHeight / baseHeight;

    const currentCity = map.getCityAt(agentState.position.x, agentState.position.y);
    const blinkPhase = Math.abs(Math.sin(performance.now() / 900));

    if (currentCity) {
      const cx = currentCity.px * scaleX + offsetX;
      const cy = currentCity.py * scaleY + offsetY;
      const connections = map.getConnections(currentCity.name);
      ctx.save();
      ctx.strokeStyle = "rgba(226, 232, 240, 0.7)";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      connections.forEach((target) => {
        if (!target) return;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo((target.px || 0) * scaleX + offsetX, (target.py || 0) * scaleY + offsetY);
        ctx.stroke();
      });
      ctx.restore();
    }

    if (Array.isArray(state.map.cities)) {
      state.map.cities.forEach((city) => {
        if (!city) return;
        const px = (city.px || 0) * scaleX + offsetX;
        const py = (city.py || 0) * scaleY + offsetY;
        if (city.importance !== 1) {
          uiState.worldMapTargets.push({ name: city.name, x: px, y: py });
        }
        const baseRadius = city.importance === 1 ? 5.5 : city.importance === 2 ? 4 : 2.8;
        const color = city.importance === 1 ? "#38bdf8" : "#60a5fa";
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 1.1;
        ctx.arc(px, py, baseRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        if (currentCity && city.name === currentCity.name) {
          ctx.beginPath();
          ctx.fillStyle = "#fbbf24";
          ctx.shadowColor = "rgba(251, 191, 36, 0.9)";
          ctx.shadowBlur = 10;
          ctx.arc(px, py, baseRadius + 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + 0.65 * blinkPhase})`;
          ctx.lineWidth = 2.2;
          ctx.arc(px, py, baseRadius + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (city.importance === 1) {
          ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
          const label = city.name;
          const textWidth = ctx.measureText(label).width;
          ctx.fillRect(px + 8, py - 8, textWidth + 6, 16);
          ctx.fillStyle = "#e2e8f0";
          ctx.fillText(label, px + 11, py);
        }
      });
    }

    ctx.restore();
  }

  function showWorldMapOverlay(show) {
    if (!dom.worldMapOverlayEl) return;
    if (show) {
      dom.worldMapOverlayEl.classList.remove("hidden");
      dom.worldMapOverlayEl.setAttribute("aria-hidden", "false");
      renderWorldMap();
    } else {
      dom.worldMapOverlayEl.classList.add("hidden");
      dom.worldMapOverlayEl.setAttribute("aria-hidden", "true");
      hideWorldMapTooltip();
    }
  }

  function renderCityInfo() {
    if (!dom.cityInfoPanel || !dom.cityInfoNameEl || !dom.cityInfoMetaEl || !dom.cityInfoPopulationEl || !dom.cityInfoDescEl) return;

    const city = map.getCityAt(agentState.position.x, agentState.position.y);
    if (!city) {
      dom.cityInfoNameEl.textContent = "Neznámé město";
      dom.cityInfoMetaEl.textContent = "Agent není ve městě";
      dom.cityInfoPopulationEl.textContent = "Počet obyvatel: -";
      dom.cityInfoDescEl.textContent = "Přesuň se do města pro detailní přehled.";
      renderCityInfoMap(null);
      updateCityMaterialInfo(null);
      if (dom.cityInfoDetailsEl) {
        dom.cityInfoDetailsEl.classList.add("hidden");
      }
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

    dom.cityInfoNameEl.textContent = city.name;
    const metaParts = [statePart, regionPart, importancePart].filter(Boolean);
    dom.cityInfoMetaEl.textContent = metaParts.join(" • ") || "-";
    const hasPopulation = typeof city.population === "number" && !Number.isNaN(city.population);
    dom.cityInfoPopulationEl.textContent = hasPopulation
      ? `Počet obyvatel: ${map.formatPopulation(city.population)}`
      : "Počet obyvatel: -";
    dom.cityInfoDescEl.textContent = city.description || "Chybí popis pro toto město.";
    renderCityInfoMap(city);
    if (dom.cityInfoDetailsEl) {
      dom.cityInfoDetailsEl.classList.toggle("hidden", agentState.stats.level < 2);
    }
    void loadCityMaterials(city).then(() => {
      updateCityMaterialInfo(city);
    });
  }

  function showCityInfoPanel(show) {
    if (!dom.cityInfoPanel) return;
    const shouldShow = !!show;
    dom.cityInfoPanel.classList.toggle("hidden", !shouldShow);
    if (shouldShow) {
      showTimetablePanel(false);
      tasks.showTaskDetailPanel(false);
      if (dom.labPanelEl) {
        dom.labPanelEl.classList.add("hidden");
      }
      if (dom.hqPanelEl) {
        dom.hqPanelEl.classList.add("hidden");
      }
      if (dom.workshopPanelEl) {
        dom.workshopPanelEl.classList.add("hidden");
      }
      if (dom.marketPanelEl) {
        dom.marketPanelEl.classList.add("hidden");
      }
      renderCityInfo();
      maybeShowCityImage(map.getCityAt(agentState.position.x, agentState.position.y));
    }
  }

  function hideCityInfoPanel() {
    showCityInfoPanel(false);
    if (dom.cityBackdropEl) {
      dom.cityBackdropEl.classList.remove("hidden");
    }
    maybeShowCityImage(map.getCityAt(agentState.position.x, agentState.position.y));
    hideCityInfoMapTooltip();
  }

  function describeMarketTier(city) {
    if (!city) {
      return {
        tier: "-",
        status: "Vydej se do města a zkontroluj nabídku.",
      };
    }
    const importance = city.importance ?? 3;
    if (importance === 1) {
      return {
        tier: "Hlavní uzel",
        status: "Zásoby se průběžně doplňují, ale poptávka je vysoká.",
      };
    }
    if (importance === 2) {
      return {
        tier: "Regionální sklad",
        status: "Dodávky dorážejí nepravidelně, sleduj vlakové spoje.",
      };
    }
    return {
      tier: "Lokální trh",
      status: "Omezené zásoby, spolehni se na sousední města.",
    };
  }

  function buildMarketTips(city) {
    if (!city) {
      return [
        {
          title: "Žádná lokace",
          body: "Přesuň se do města, abys mohl kontaktovat obchodníky.",
        },
      ];
    }
    const tips = [];
    const connections = map.getConnections(city.name);
    if (connections.length === 0) {
      tips.push({
        title: "Bez přímých linek",
        body: "Z tohoto města nevedou aktivní tratě. Zvaž teleport test nebo návrat na hlavní trať.",
      });
    } else {
      const targets = connections
        .slice(0, 3)
        .map((c) => c.name)
        .join(", ");
      tips.push({
        title: "Dostupné tratě",
        body: targets || "Spoje se načítají…",
      });
    }
    tips.push({
      title: "Doporučení HQ",
      body:
        city.importance <= 2
          ? "Zaměř se na Energy Generatory, zásoby se vyprodávají během hodin."
          : "Hledej doplňky a materiál – pro generátor vyraž do většího města.",
    });
    tips.push({
      title: "Regionální vazby",
      body: city.region ? `Město patří do regionu ${city.region}.` : "Region se načítá…",
    });
    return tips;
  }

  async function loadCityMaterials(city) {
    if (!city || !city.id || agentState.stats.level < 2) return null;
    try {
      const res = await fetch(`/api/cities/${city.id}/materials`);
      if (!res.ok) return null;
      const data = await res.json();
      if (uiState.materialByCity) {
        uiState.materialByCity.set(city.id, data);
      }
      return data;
    } catch (err) {
      console.warn("Failed to load city materials:", err);
      return null;
    }
  }

  function maybeCompleteMaterialObjective() {
    const materialCur = agentState.stats.material_current ?? 0;
    state.tasks.list.forEach((task) => {
      const triggers = task?.objective_triggers || [];
      triggers.forEach((trigger, index) => {
        if (!trigger || trigger.type !== "gain_material") return;
        const required = Number(trigger.amount || 0);
        const already = task.completed_objectives?.[index];
        if (!already && materialCur >= required) {
          tasks.completeTaskObjective(task.id, index);
        }
      });
    });
  }

  async function collectCityMaterial(city) {
    if (!city || !city.id) return;
    try {
      const res = await fetch(`/api/cities/${city.id}/materials/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.agent) {
        agentState.stats.material_current = data.agent.material_current ?? agentState.stats.material_current;
        agentState.stats.material_max = data.agent.material_max ?? agentState.stats.material_max;
      }
      if (data.city_materials && uiState.materialByCity) {
        uiState.materialByCity.set(city.id, data.city_materials);
      }
      agent.updateAgentHeader();
      maybeCompleteMaterialObjective();
      renderCityInfo();
      renderMarketPanel(city);
    } catch (err) {
      console.warn("Failed to collect material:", err);
    }
  }

  async function buyCityMaterial(city) {
    if (!city || !city.id) return;
    try {
      const res = await fetch(`/api/cities/${city.id}/materials/buy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: 1 }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.agent) {
        agentState.stats.material_current = data.agent.material_current ?? agentState.stats.material_current;
        agentState.stats.material_max = data.agent.material_max ?? agentState.stats.material_max;
        if (data.agent.money !== undefined) {
          agentState.inventory = agentState.inventory || {};
          agentState.inventory.money = data.agent.money;
        }
      }
      if (data.city_materials && uiState.materialByCity) {
        uiState.materialByCity.set(city.id, data.city_materials);
      }
      agent.updateAgentHeader();
      maybeCompleteMaterialObjective();
      renderMarketPanel(city);
      renderCityInfo();
    } catch (err) {
      console.warn("Failed to buy material:", err);
    }
  }

  function updateCityMaterialInfo(city) {
    if (!dom.cityInfoMaterialRowEl) return;
    const shouldShow = !!city && agentState.stats.level >= 2;
    dom.cityInfoMaterialRowEl.classList.toggle("hidden", !shouldShow);
    if (!shouldShow) return;

    const cached = uiState.materialByCity ? uiState.materialByCity.get(city.id) : null;
    const materialCur = agentState.stats.material_current ?? 0;
    const materialMax = agentState.stats.material_max ?? 0;
    const infoQty = cached?.info_qty ?? 0;

    if (dom.cityInfoMaterialValueEl) {
      dom.cityInfoMaterialValueEl.textContent =
        infoQty > 0 ? `K dispozici: ${infoQty} ks` : "Dnes není materiál k dispozici.";
    }
    if (dom.cityInfoMaterialStatusEl) {
      dom.cityInfoMaterialStatusEl.textContent = `Stav: ${materialCur} / ${materialMax}`;
    }
    if (dom.cityInfoMaterialCollectBtn) {
      const capacity = Math.max(0, materialMax - materialCur);
      const isFull = capacity <= 0;
      dom.cityInfoMaterialCollectBtn.disabled = infoQty <= 0 || isFull;
      dom.cityInfoMaterialCollectBtn.title = isFull ? "Zásoby jsou plné" : "";
      dom.cityInfoMaterialCollectBtn.onclick = () => collectCityMaterial(city);
    }
  }

  async function renderMarketPanel(city) {
    if (!dom.marketPanelEl) return;
    const referenceCity = city || map.getCityAt(agentState.position.x, agentState.position.y);
    const tierInfo = describeMarketTier(referenceCity);
    if (dom.marketCityLabelEl) {
      dom.marketCityLabelEl.textContent = referenceCity?.name || "-";
    }
    if (dom.marketTierLabelEl) {
      dom.marketTierLabelEl.textContent = tierInfo.tier;
    }
    if (dom.marketStatusLabelEl) {
      dom.marketStatusLabelEl.textContent = tierInfo.status;
    }
    if (dom.marketStockListEl) {
      const materialState = await loadCityMaterials(referenceCity);
      const generatorTask = state.tasks.list.find((task) => task.id === "mission-equipment-02");
      const generatorCity = generatorTask?.objective_triggers?.find(
        (trigger) => trigger.type === "visit_city"
      )?.city_name;
      const isInGeneratorCity =
        !!referenceCity &&
        !!generatorCity &&
        referenceCity.name &&
        referenceCity.name.toLowerCase() === String(generatorCity).toLowerCase();
      const buyIndex = generatorTask?.objective_triggers?.findIndex(
        (trigger) => trigger.type === "buy_item" && trigger.item === "energy_generator"
      );
      const isBought =
        generatorTask && typeof buyIndex === "number" && buyIndex >= 0
          ? !!generatorTask.completed_objectives?.[buyIndex]
          : false;

      dom.marketStockListEl.innerHTML = "";
      let hasRows = false;
      if (generatorTask && isInGeneratorCity && !isBought) {
        const row = document.createElement("tr");
        const itemTd = document.createElement("td");
        itemTd.className = "px-4 py-3";
        itemTd.innerHTML = `
          <div class="flex items-center gap-3">
            <img src="/static/assets/items/energy_generator.webp" alt="Energy Generator" class="h-10 w-10 rounded-lg border border-white/10 object-cover" />
            <div>
              <div class="font-semibold text-slate-100">Energy Generator</div>
              <div class="text-[10px] uppercase tracking-[0.2em] text-slate-400">1 ks</div>
            </div>
          </div>
        `;
        const priceTd = document.createElement("td");
        priceTd.className = "px-4 py-3 text-amber-200 font-semibold";
        priceTd.textContent = "500 $";
        const actionTd = document.createElement("td");
        actionTd.className = "px-4 py-3";
        const buyBtn = document.createElement("button");
        buyBtn.className =
          "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] border border-emerald-400/60 text-emerald-100 bg-emerald-900/40 hover:bg-emerald-800/60 transition";
        buyBtn.textContent = "Koupit";
        const money = agentState.inventory?.money ?? 0;
        const insufficientFunds = money < 500;
        buyBtn.disabled =
          !generatorTask ||
          buyIndex === undefined ||
          buyIndex === null ||
          buyIndex < 0 ||
          insufficientFunds;
        buyBtn.title = insufficientFunds ? "Nedostatek financí" : "";
        if (generatorTask && typeof buyIndex === "number" && buyIndex >= 0) {
          buyBtn.addEventListener("click", () => {
            tasks.completeTaskObjective(generatorTask.id, buyIndex);
          });
        }
        actionTd.appendChild(buyBtn);
        row.appendChild(itemTd);
        row.appendChild(priceTd);
        row.appendChild(actionTd);
        dom.marketStockListEl.appendChild(row);
        hasRows = true;
      }

      if (agentState.stats.level >= 2 && materialState) {
        const materialQty = materialState.market_qty ?? 0;
        const materialPrice = materialState.market_price ?? null;
        if (materialQty > 0 && materialPrice) {
          const row = document.createElement("tr");
          const itemTd = document.createElement("td");
          itemTd.className = "px-4 py-3";
          itemTd.innerHTML = `
            <div class="flex items-center gap-3">
              <div class="h-10 w-10 rounded-lg border border-white/10 bg-amber-300/10 flex items-center justify-center text-amber-200 text-lg">🧱</div>
              <div>
                <div class="font-semibold text-slate-100">Spotřební materiál</div>
                <div class="text-[10px] uppercase tracking-[0.2em] text-slate-400">${materialQty} ks</div>
              </div>
            </div>
          `;
          const priceTd = document.createElement("td");
          priceTd.className = "px-4 py-3 text-amber-200 font-semibold";
          priceTd.textContent = `${materialPrice} $`;
          const actionTd = document.createElement("td");
          actionTd.className = "px-4 py-3";
          const buyBtn = document.createElement("button");
          buyBtn.className =
            "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] border border-emerald-400/60 text-emerald-100 bg-emerald-900/40 hover:bg-emerald-800/60 transition";
          buyBtn.textContent = "Koupit";
          const materialCur = agentState.stats.material_current ?? 0;
          const materialMax = agentState.stats.material_max ?? 0;
          const capacity = Math.max(0, materialMax - materialCur);
          const money = agentState.inventory?.money ?? 0;
          const isFull = capacity <= 0;
          const insufficientFunds = money < materialPrice;
          buyBtn.disabled = isFull || insufficientFunds;
          buyBtn.title = isFull ? "Zásoby jsou plné" : insufficientFunds ? "Nedostatek financí" : "";
          buyBtn.addEventListener("click", () => {
            buyCityMaterial(referenceCity);
          });
          actionTd.appendChild(buyBtn);
          row.appendChild(itemTd);
          row.appendChild(priceTd);
          row.appendChild(actionTd);
          dom.marketStockListEl.appendChild(row);
          hasRows = true;
        }
      }

      if (!hasRows) {
        const row = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = 3;
        td.className = "px-4 py-3 text-slate-300";
        td.textContent = "Zásoby nejsou k dispozici.";
        row.appendChild(td);
        dom.marketStockListEl.appendChild(row);
      }
    }
    if (dom.marketTipsListEl) {
      const tips = buildMarketTips(referenceCity);
      dom.marketTipsListEl.innerHTML = "";
      tips.forEach((tip) => {
        const card = document.createElement("div");
        card.className = "rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-200";
        card.innerHTML = `<p class="text-xs uppercase tracking-[0.3em] text-slate-400 mb-1">${tip.title}</p><p class="text-slate-100">${tip.body}</p>`;
        dom.marketTipsListEl.appendChild(card);
      });
    }
  }

  function showLabPanel(show) {
    if (!dom.labPanelEl) return;
    const shouldShow = !!show;
    const allowed = !dom.labBtn || !dom.labBtn.classList.contains("hidden");
    if (shouldShow && !allowed) {
      return;
    }
    dom.labPanelEl.classList.toggle("hidden", !shouldShow);
    if (shouldShow) {
      hideCityInfoPanel();
      showTimetablePanel(false);
      tasks.showTaskDetailPanel(false);
      if (dom.hqPanelEl) {
        dom.hqPanelEl.classList.add("hidden");
      }
      showWorkshopPanel(false);
      showMarketPanel(false);
      loadLabPanelData();
      tasks.notifyTaskLocationChange();
      tasks.loadStoryDialogs(true);
      tasks.maybeShowStoryOverlay("lab");
    } else {
      maybeShowCityImage(map.getCityAt(agentState.position.x, agentState.position.y));
    }
  }

  function showHqPanel(show) {
    if (!dom.hqPanelEl) return;
    const shouldShow = !!show;
    const allowed = !dom.hqBtn || !dom.hqBtn.classList.contains("hidden");
    if (shouldShow && !allowed) {
      return;
    }
    dom.hqPanelEl.classList.toggle("hidden", !shouldShow);
    if (shouldShow) {
      hideCityInfoPanel();
      showTimetablePanel(false);
      tasks.showTaskDetailPanel(false);
      showLabPanel(false);
      showWorkshopPanel(false);
      showMarketPanel(false);
      tasks.notifyTaskLocationChange();
      tasks.loadStoryDialogs(true);
      tasks.maybeShowStoryOverlay("hq");
    } else {
      maybeShowCityImage(map.getCityAt(agentState.position.x, agentState.position.y));
    }
  }

  function showWorkshopPanel(show) {
    if (!dom.workshopPanelEl) return;
    const shouldShow = !!show;
    const allowed = !dom.workshopBtn || !dom.workshopBtn.classList.contains("hidden");
    if (shouldShow && !allowed) {
      return;
    }
    dom.workshopPanelEl.classList.toggle("hidden", !shouldShow);
    if (shouldShow) {
      hideCityInfoPanel();
      showTimetablePanel(false);
      tasks.showTaskDetailPanel(false);
      showLabPanel(false);
      if (dom.hqPanelEl) {
        dom.hqPanelEl.classList.add("hidden");
      }
      showMarketPanel(false);
    } else {
      maybeShowCityImage(map.getCityAt(agentState.position.x, agentState.position.y));
    }
  }

  function showMarketPanel(show) {
    if (!dom.marketPanelEl) return;
    const shouldShow = !!show;
    const allowed = !dom.marketBtn || !dom.marketBtn.classList.contains("hidden");
    if (shouldShow && !allowed) {
      return;
    }
    dom.marketPanelEl.classList.toggle("hidden", !shouldShow);
    if (shouldShow) {
      hideCityInfoPanel();
      showTimetablePanel(false);
      tasks.showTaskDetailPanel(false);
      if (dom.labPanelEl) {
        dom.labPanelEl.classList.add("hidden");
      }
      if (dom.hqPanelEl) {
        dom.hqPanelEl.classList.add("hidden");
      }
      if (dom.workshopPanelEl) {
        dom.workshopPanelEl.classList.add("hidden");
      }
      renderMarketPanel(map.getCityAt(agentState.position.x, agentState.position.y));
      tasks.loadStoryDialogs(true);
      tasks.maybeShowStoryOverlay("market");
    } else {
      maybeShowCityImage(map.getCityAt(agentState.position.x, agentState.position.y));
    }
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
      slugifyCityName(city.name),
      city.name.replace(/\s+/g, "_"),
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

  async function maybeShowCityImage(city) {
    if (!dom.canvas || !dom.cityBackdropEl) return;
    const imgUrl = await findCityImageUrl(city);

    if (imgUrl) {
      dom.cityBackdropEl.src = imgUrl;
      dom.cityBackdropEl.classList.remove("opacity-0");
      dom.canvas.classList.add("hidden");
    } else {
      dom.cityBackdropEl.src = "";
      dom.cityBackdropEl.classList.add("opacity-0");
      dom.canvas.classList.remove("hidden");
    }
  }

  function setTeleportStatus(message, variant = "muted") {
    if (!dom.teleportStatusEl) return;
    dom.teleportStatusEl.textContent = message || "";
    dom.teleportStatusEl.classList.remove("text-rose-300", "text-emerald-300", "text-slate-400");
    if (variant === "error") {
      dom.teleportStatusEl.classList.add("text-rose-300");
    } else if (variant === "success") {
      dom.teleportStatusEl.classList.add("text-emerald-300");
    } else {
      dom.teleportStatusEl.classList.add("text-slate-400");
    }
  }

  function populateTeleportSelect() {
    if (!dom.teleportCitySelect || !Array.isArray(state.map.cities) || state.map.cities.length === 0) return;
    dom.teleportCitySelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Vyber město";
    dom.teleportCitySelect.appendChild(placeholder);

    const sorted = [...state.map.cities].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    sorted.forEach((city) => {
      if (!city || city.id === undefined || city.id === null) return;
      const option = document.createElement("option");
      option.value = city.id;
      const stateLabel = city.state_shortcut || city.state || "";
      option.textContent = stateLabel ? `${city.name}, ${stateLabel}` : city.name;
      dom.teleportCitySelect.appendChild(option);
    });
  }

  function showTeleportOverlay() {
    if (!dom.teleportOverlayEl) return;
    populateTeleportSelect();
    dom.teleportOverlayEl.classList.remove("hidden");
    setTeleportStatus("Přesun je okamžitý, využij jen pro testování.", "muted");
  }

  function hideTeleportOverlay() {
    dom.teleportOverlayEl?.classList.add("hidden");
  }

  function handleTeleportSubmit() {
    if (!dom.teleportCitySelect) return;
    const rawValue = dom.teleportCitySelect.value;
    if (!rawValue) {
      setTeleportStatus("Nejprve vyber město.", "error");
      return;
    }
    let targetCity = map.getCityById(rawValue);
    if (!targetCity) {
      targetCity = map.getCityByNameInsensitive(rawValue);
    }
    if (!targetCity) {
      setTeleportStatus("Město se nepodařilo načíst.", "error");
      return;
    }
    travelToCity(targetCity, { silent: true });
    setTeleportStatus(`Teleportováno do ${targetCity.name}.`, "success");
    setTimeout(() => hideTeleportOverlay(), 600);
  }

  function normalizeUnlockItem(item) {
    if (!item) return null;
    if (typeof item === "string") {
      return { type: item };
    }
    if (typeof item === "object") {
      return { ...item };
    }
    return null;
  }

  function buildUnlockItems(entry) {
    const cfg = entry?.cfg || {};
    const prevCfg = entry?.prevCfg || {};
    const items = [];

    const rawUnlocks = Array.isArray(cfg.unlock_items) ? cfg.unlock_items : [];
    rawUnlocks.forEach((item) => {
      const normalized = normalizeUnlockItem(item);
      if (normalized) items.push(normalized);
    });

    const prevEnergy = typeof prevCfg.energy_max === "number" ? prevCfg.energy_max : null;
    const nextEnergy = typeof cfg.energy_max === "number" ? cfg.energy_max : null;
    if (prevEnergy !== null && prevEnergy > 0 && nextEnergy !== null && nextEnergy > prevEnergy) {
      items.push({ type: "energy_max", amount: nextEnergy - prevEnergy });
    }

    const prevMaterial = typeof prevCfg.material_max === "number" ? prevCfg.material_max : null;
    const nextMaterial = typeof cfg.material_max === "number" ? cfg.material_max : null;
    if (prevMaterial !== null && prevMaterial > 0 && nextMaterial !== null && nextMaterial > prevMaterial) {
      items.push({ type: "material_max", amount: nextMaterial - prevMaterial });
    }

    const prevData = typeof prevCfg.data_max === "number" ? prevCfg.data_max : null;
    const nextData = typeof cfg.data_max === "number" ? cfg.data_max : null;
    if (prevData !== null && prevData > 0 && nextData !== null && nextData > prevData) {
      items.push({ type: "data_max", amount: nextData - prevData });
    }

    if (items.length === 0 && cfg.unlock) {
      items.push({ type: "info", label: cfg.unlock });
    }

    return items;
  }

  function formatUnlockItem(item) {
    const labels = {
      energy: "Energie",
      materials: "Materiály",
      building: "Nová budova",
      tool: "Nový nástroj",
      energy_max: "Max energie",
      material_max: "Max materiálu",
      data_max: "Max dat",
      credits: "Kredity",
      info: "Odemčeno",
    };

    const type = item?.type || "info";
    const baseLabel = item?.label || labels[type] || "Odemčeno";
    const name = item?.name || item?.title || "";
    const amount = typeof item?.amount === "number" ? item.amount : null;
    let label = baseLabel;
    if ((type === "building" || type === "tool") && name && !item?.label) {
      label = `${baseLabel}: ${name}`;
    } else if (name && !item?.label && !amount) {
      label = name;
    }
    if (amount !== null) {
      const sign = amount > 0 ? "+" : "";
      label = `${baseLabel} ${sign}${amount}`;
    }
    const description = item?.description || item?.desc || "";
    return { label, description };
  }

  function joinList(parts = []) {
    if (parts.length <= 1) return parts[0] || "";
    if (parts.length === 2) return `${parts[0]} a ${parts[1]}`;
    return `${parts.slice(0, -1).join(", ")} a ${parts[parts.length - 1]}`;
  }

  function buildLevelUpSummary(items = [], cfg = {}) {
    const hasEnergy = items.some((item) => ["energy", "energy_max"].includes(item?.type));
    const hasMaterials = items.some((item) => ["materials", "material_max"].includes(item?.type));
    const hasData = items.some((item) => ["data", "data_max"].includes(item?.type));
    const buildings = items
      .filter((item) => item?.type === "building" && item?.name)
      .map((item) => {
        if (item?.description) {
          return `${item.name} (${item.description.replace(/\.$/, "")})`;
        }
        return item.name;
      });
    const tools = items.filter((item) => item?.type === "tool" && item?.name).map((item) => item.name);
    const credits = items
      .filter((item) => item?.type === "credits" && typeof item?.amount === "number")
      .map((item) => {
        const sign = item.amount > 0 ? "+" : "";
        return `${sign}${item.amount} kreditů`;
      });
    const extraLabels = items
      .filter((item) => !["energy", "energy_max", "materials", "material_max", "data", "data_max", "building", "tool", "credits"].includes(item?.type))
      .map((item) => formatUnlockItem(item).label)
      .filter(Boolean);
    const parts = [];
    const resourceParts = [];
    if (hasEnergy) resourceParts.push("energii");
    if (hasMaterials) resourceParts.push("materiálům");
    if (hasData) resourceParts.push("datům");
    if (resourceParts.length) {
      parts.push(`získali přístup k ${joinList(resourceParts)}`);
    }
    if (buildings.length) {
      parts.push(`${buildings.length > 1 ? "odemkly se vám nové budovy" : "odemkla se vám nová budova"} ${joinList(buildings)}`);
    }
    if (tools.length) {
      parts.push(`${tools.length > 1 ? "získali jste nové nástroje" : "získali jste nový nástroj"} ${joinList(tools)}`);
    }
    if (credits.length) {
      parts.push(`získali jste ${joinList(credits)}`);
    }
    if (extraLabels.length) {
      parts.push(`odemkli jste ${joinList(extraLabels)}`);
    }
    if (!parts.length) {
      return cfg.unlock || "Nové možnosti odemčeny.";
    }
    return `Díky tomuto levelu jste ${parts.join(" a ")}.`;
  }

  function getBuildingIcon(name) {
    const label = (name || "").toLowerCase();
    if (label.includes("dílna") || label.includes("dilna")) {
      return `
        <svg viewBox="0 0 32 32" role="presentation" aria-hidden="true">
          <path d="M9 12l5 5-2 2-5-5" />
          <path d="M20 8l4 4-7 7-4-4z" />
          <path d="M17 23l4 4" />
          <path d="M22 18l4 4" />
        </svg>
      `;
    }
    return `
      <svg viewBox="0 0 32 32" role="presentation" aria-hidden="true">
        <rect x="7" y="11" width="18" height="12" rx="2" ry="2" />
        <path d="M10 11l6-5 6 5" />
        <path d="M16 16v7" />
      </svg>
    `;
  }

  function createHighlightCard({ title, description, variant, iconSvg, iconEmoji, meter } = {}) {
    const card = document.createElement("div");
    card.className = `level-up-highlight level-up-highlight--${variant || "info"}`;

    const icon = document.createElement("div");
    icon.className = "level-up-highlight__icon";
    if (iconSvg) {
      icon.innerHTML = iconSvg;
    } else if (iconEmoji) {
      icon.textContent = iconEmoji;
    }
    card.appendChild(icon);

    const body = document.createElement("div");
    body.className = "level-up-highlight__body";
    const titleEl = document.createElement("div");
    titleEl.className = "level-up-highlight__title";
    titleEl.textContent = title || "Odemčeno";
    body.appendChild(titleEl);
    if (description) {
      const descEl = document.createElement("div");
      descEl.className = "level-up-highlight__desc";
      descEl.textContent = description;
      body.appendChild(descEl);
    }
    if (meter) {
      const meterEl = document.createElement("div");
      meterEl.className = "level-up-highlight__meter";
      const fillEl = document.createElement("div");
      fillEl.className = "level-up-highlight__meter-fill";
      meterEl.appendChild(fillEl);
      body.appendChild(meterEl);
    }
    card.appendChild(body);
    return card;
  }

  function renderLevelUp(entry) {
    if (!dom.levelUpOverlayEl) return;
    const cfg = entry?.cfg || {};
    const titleText = `Level ${cfg.level ?? "-"}`;
    const subtitleText = cfg.unlock || "Nové možnosti odemčeny.";
    const items = buildUnlockItems(entry);
    const summaryText = buildLevelUpSummary(items, cfg);

    if (dom.levelUpTitleEl) {
      dom.levelUpTitleEl.textContent = titleText;
    }
    if (dom.levelUpSubtitleEl) {
      dom.levelUpSubtitleEl.textContent = subtitleText;
    }
    if (dom.levelUpSummaryEl) {
      dom.levelUpSummaryEl.textContent = summaryText;
    }
    if (dom.levelUpLevelValueEl) {
      dom.levelUpLevelValueEl.textContent = `${cfg.level ?? "-"}`;
    }
    if (dom.levelUpHighlightsEl) {
      dom.levelUpHighlightsEl.innerHTML = "";
      const highlightItems = [];

      items.forEach((item) => {
        const type = item?.type;
        if (["energy", "energy_max", "materials", "material_max", "data", "data_max", "building"].includes(type)) {
          highlightItems.push(item);
        }
      });

      highlightItems.forEach((item) => {
        const { label, description } = formatUnlockItem(item);
        if (item.type === "energy" || item.type === "energy_max") {
          dom.levelUpHighlightsEl.appendChild(
            createHighlightCard({
              title: label,
              description: description || "Nový zdroj energie je aktivní.",
              variant: "energy",
              iconSvg:
                '<svg viewBox="0 0 32 32" role="presentation" aria-hidden="true"><path d="M18 3l-8 14h7l-3 12 10-16h-7z" /></svg>',
              meter: true,
            })
          );
          return;
        }
        if (item.type === "materials" || item.type === "material_max") {
          dom.levelUpHighlightsEl.appendChild(
            createHighlightCard({
              title: label,
              description: description || "Nové zásoby materiálu připraveny.",
              variant: "material",
              iconEmoji: "🧱",
            })
          );
          return;
        }
        if (item.type === "data" || item.type === "data_max") {
          dom.levelUpHighlightsEl.appendChild(
            createHighlightCard({
              title: label,
              description: description || "Datové kanály jsou otevřené.",
              variant: "data",
              iconEmoji: "🧮",
            })
          );
          return;
        }
        if (item.type === "building") {
          dom.levelUpHighlightsEl.appendChild(
            createHighlightCard({
              title: item.name || label,
              description: item.description || "Nová budova je dostupná.",
              variant: "building",
              iconSvg: getBuildingIcon(item.name),
            })
          );
        }
      });
    }
    if (dom.levelUpListEl) {
      dom.levelUpListEl.innerHTML = "";
      const listItems = items.filter(
        (item) => !["energy", "energy_max", "materials", "material_max", "data", "data_max", "building"].includes(item?.type)
      );
      if (listItems.length === 0) {
        listItems.push({ type: "info", label: "Nové možnosti odemčeny." });
      }
      listItems.forEach((item) => {
        const { label, description } = formatUnlockItem(item);
        const card = document.createElement("div");
        card.className = "level-up-card";
        const title = document.createElement("div");
        title.className = "level-up-card-title";
        title.textContent = label;
        card.appendChild(title);
        if (description) {
          const desc = document.createElement("div");
          desc.className = "level-up-card-desc";
          desc.textContent = description;
          card.appendChild(desc);
        }
        dom.levelUpListEl.appendChild(card);
      });
    }

    dom.levelUpOverlayEl.classList.remove("hidden");
    dom.levelUpOverlayEl.setAttribute("aria-hidden", "false");
  }

  function showNextLevelUp() {
    if (!dom.levelUpOverlayEl) return;
    if (levelUpQueue.length === 0) {
      activeLevelUp = null;
      dom.levelUpOverlayEl.classList.add("hidden");
      dom.levelUpOverlayEl.setAttribute("aria-hidden", "true");
      return;
    }
    activeLevelUp = levelUpQueue.shift();
    renderLevelUp(activeLevelUp);
  }

  function closeLevelUpOverlay() {
    if (!dom.levelUpOverlayEl) return;
    dom.levelUpOverlayEl.classList.add("hidden");
    dom.levelUpOverlayEl.setAttribute("aria-hidden", "true");
    activeLevelUp = null;
    if (levelUpQueue.length) {
      showNextLevelUp();
    }
  }

  function queueLevelUps(levelUps = []) {
    if (!Array.isArray(levelUps) || levelUps.length === 0) return;
    levelUps.forEach((entry) => {
      if (entry?.cfg) {
        levelUpQueue.push(entry);
      }
    });
    if (!activeLevelUp) {
      showNextLevelUp();
    }
  }

  function travelToCity(targetCity, options = {}) {
    if (!targetCity) return;
    const { silent = false } = options;

    if (!silent) {
      travel.playTravelSound();
    }

    agent.setAgentPositionToCity(targetCity, { persist: true });
    showTimetablePanel(false);
    updateSidebar();
    updateTimetable();
    console.log(`Přesun vlakem do: ${targetCity.name}`);
    tasks.notifyTaskLocationChange();
  }

  function updateSidebar() {
    const cityNameEl = document.getElementById("currentCityName");
    const cityDescEl = document.getElementById("currentCityDescription");
    const cityStateEl = document.getElementById("currentCityState");
    const posEl = document.getElementById("agentPos");
    const timeEl = document.getElementById("currentTimeLabel");
    const weekEl = document.getElementById("currentWeekLabel");

    if (!cityNameEl) return;

    const city = map.getCityAt(agentState.position.x, agentState.position.y);

    if (posEl) {
      posEl.textContent = `${agentState.position.x},${agentState.position.y}`;
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
      updateMarketAvailability(null);
      renderMarketPanel(null);
      if (timeEl || weekEl) {
        const { weekText, timeText } = time.formatWeekAndTime(time.getGameMinutes());
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
    updateMarketAvailability(city);
    renderMarketPanel(city);
    renderCityInfo();
    maybeShowCityImage(city);

    if (timeEl || weekEl) {
      const { weekText, timeText } = time.formatWeekAndTime(time.getGameMinutes());
      if (weekEl) weekEl.textContent = weekText;
      if (timeEl) timeEl.textContent = timeText;
    }
  }

  function renderTimetablePage() {
    if (state.travel.animation) return;

    const timeEl = document.getElementById("currentTimeLabel");
    const weekEl = document.getElementById("currentWeekLabel");
    const tbody = document.getElementById("timetableBody");
    if (!timeEl || !tbody) return;

    const { weekText, timeText } = time.formatWeekAndTime(time.getGameMinutes());
    if (weekEl) weekEl.textContent = weekText;
    timeEl.textContent = timeText;
    tbody.innerHTML = "";

    const city = map.getCityAt(agentState.position.x, agentState.position.y);

    if (!city) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7;
      td.textContent = "Agent nestojí ve městě.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    const departures = (trainState.timetableDepartures || [])
      .map((dep) => ({
        ...dep,
        _next_departure: map.normalizeDepartureMinutes(dep.departure_minutes, time.getGameMinutes()),
      }))
      .filter((dep) => dep._next_departure !== null && dep._next_departure > time.getGameMinutes());

    if (!departures || departures.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 7;
      td.textContent = "Z tohoto města nejedou žádné vlaky.";
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    const pageItems = departures.slice(0, config.timetableLimit);

    pageItems.forEach((dep) => {
      const tr = document.createElement("tr");
      tr.classList.add("tabular-nums");
      const depMinutes = dep._next_departure ?? map.normalizeDepartureMinutes(dep.departure_minutes, time.getGameMinutes());
      const typeInfo = map.getLineTypeInfo(dep.line_type);

      const timeTd = document.createElement("td");
      timeTd.innerHTML = `<span class="text-base font-semibold text-slate-100 tabular-nums">${time.formatGameTimeHHMM(depMinutes ?? dep.departure_minutes)}</span>`;

      const toTd = document.createElement("td");
      const toName = dep.to_city?.name || "-";
      const cityMeta = state.map.cityByName.get(toName);
      const toState = cityMeta?.state_shortcut || cityMeta?.state || dep.to_city?.state_shortcut || dep.to_city?.state;
      const toLabel = `<span class="font-semibold text-sky-100 text-sm leading-tight">${toName}</span>`;
      const stateLabel = toState ? `<span class="ml-1 text-xs text-slate-300 align-middle">(${toState})</span>` : "";
      toTd.innerHTML = `${toLabel}${stateLabel}`;

      const typeTd = document.createElement("td");
      const badgeSizeClass =
        typeInfo.key === "express"
          ? "min-w-[2.8rem] px-3 py-1 text-xs"
          : "min-w-[2.1rem] px-2 py-0.5 text-[11px]";
      typeTd.innerHTML = `<span class="inline-flex items-center justify-center rounded-md ${badgeSizeClass} ${typeInfo.badgeClasses} font-semibold uppercase tracking-wide" title="${map.formatLineTypeLabel(dep.line_type)}">${typeInfo.symbol}</span>`;

      const distTd = document.createElement("td");
      distTd.textContent = dep.distance_units !== undefined && dep.distance_units !== null
        ? Math.round(dep.distance_units) + " mi"
        : "-";

      const travelTd = document.createElement("td");
      travelTd.textContent = travel.formatTravelDuration(dep.travel_minutes);

      const arrivalTd = document.createElement("td");
      if (dep.travel_minutes !== undefined && dep.travel_minutes !== null) {
        const arrivalMinutes = (depMinutes ?? dep.departure_minutes) + dep.travel_minutes;
        arrivalTd.innerHTML = `<span class="font-semibold text-slate-100 text-base tabular-nums">${time.formatGameTime(arrivalMinutes)}</span>`;
      } else {
        arrivalTd.textContent = "-";
      }

      const destinationName = dep.to_city?.name;
      const destinationCity = destinationName ? state.map.cityByName.get(destinationName) : null;
      const depKey = map.makeDepartureKey(dep, depMinutes ?? dep.departure_minutes);
      const hasTicket = depKey ? trainState.purchasedTicketKey === depKey : false;

      if (destinationCity) {
        tr.style.cursor = "pointer";
        tr.title = `Cestovat do ${destinationCity.name}`;
        tr.addEventListener("click", () => {
          travel.scheduleTravelFromDeparture(dep);
        });
        tr.addEventListener("mouseenter", () => {
          const key = `${dep.from_city?.name}__${dep.to_city?.name}`;
          map.setHoveredLineKey(key);
        });
        tr.addEventListener("mouseleave", () => {
          map.setHoveredLineKey(null);
        });
      }

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

          if (trainState.purchasedTicketKey && trainState.purchasedTicketKey !== depKey) {
            const confirmNew = window.confirm("Opravdu chceš koupit jinou jízdenku? Původní se tímto stornuje.");
            if (!confirmNew) {
              return;
            }
          }

          trainState.purchasedTicketKey = depKey;
          if (dom.ticketSound) {
            try {
              dom.ticketSound.currentTime = 0;
              dom.ticketSound.play().catch(() => {});
            } catch (err) {
              console.warn("Ticket sound playback failed", err);
            }
          }
          travel.scheduleTravelFromDeparture(dep);
          renderTimetablePage();
        });
        ticketTd.appendChild(buyBtn);
      }

      tr.appendChild(ticketTd);
      tr.appendChild(timeTd);
      tr.appendChild(toTd);
      tr.appendChild(typeTd);
      tr.appendChild(distTd);
      tr.appendChild(travelTd);
      tr.appendChild(arrivalTd);

      tbody.appendChild(tr);
    });
  }

  function findDepartureToCity(destinationName) {
    if (!destinationName || !Array.isArray(trainState.timetableDepartures)) return null;
    const matches = trainState.timetableDepartures.filter(
      (dep) => dep?.to_city?.name === destinationName
    );
    if (matches.length === 0) return null;
    matches.sort((a, b) => {
      const aNext = map.normalizeDepartureMinutes(a.departure_minutes, time.getGameMinutes());
      const bNext = map.normalizeDepartureMinutes(b.departure_minutes, time.getGameMinutes());
      return aNext - bNext;
    });
    const first = matches[0];
    const firstTime = map.normalizeDepartureMinutes(first?.departure_minutes, time.getGameMinutes());
    return firstTime ? { ...first, _next_departure: firstTime } : first;
  }

  async function updateTimetable() {
    const city = map.getCityAt(agentState.position.x, agentState.position.y);
    if (!city) {
      trainState.timetableDepartures = [];
      renderTimetablePage();
      return;
    }

    const res = await fetch(`/api/timetable?city_id=${city.id}&minutes=${time.getGameMinutes()}&limit=${config.timetableLimit}`);
    if (!res.ok) {
      console.error("Nepodařilo se načíst jízdní řád.");
      trainState.timetableDepartures = [];
      renderTimetablePage();
      return;
    }
    trainState.timetableDepartures = await res.json();
    renderTimetablePage();
  }

  function travelFromCurrentCity() {
    const currentCity = map.getCityAt(agentState.position.x, agentState.position.y);
    if (!currentCity) {
      console.log("Agent není ve městě – nelze cestovat.");
      return;
    }

    const connections = map.getConnections(currentCity.name);
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

    travel.travelUsingTimetable(destination);
  }

  function initUiEvents() {
    if (dom.worldMapBtn) {
      dom.worldMapBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const isVisible = dom.worldMapOverlayEl && !dom.worldMapOverlayEl.classList.contains("hidden");
        showWorldMapOverlay(!isVisible);
      });
    }
    if (dom.closeWorldMapBtn) {
      dom.closeWorldMapBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showWorldMapOverlay(false);
      });
    }
    if (dom.worldMapOverlayEl) {
      dom.worldMapOverlayEl.addEventListener("click", (event) => {
        if (event.target === dom.worldMapOverlayEl) {
          showWorldMapOverlay(false);
        }
      });
    }
    document.addEventListener("keydown", (event) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === "m") {
        const isVisible = dom.worldMapOverlayEl && !dom.worldMapOverlayEl.classList.contains("hidden");
        showWorldMapOverlay(!isVisible);
      }
      if (key === "escape") {
        showWorldMapOverlay(false);
      }
    });

    if (dom.ticketToggleBtn) {
      dom.ticketToggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const isVisible = dom.timetableCardEl && !dom.timetableCardEl.classList.contains("hidden");
        if (uiState.activeFooterButton === "timetable" && isVisible) {
          showTimetablePanel(false);
          setActiveFooterButton(null);
        } else {
          showTimetablePanel(true);
          setActiveFooterButton("timetable");
        }
      });
    }
    if (dom.cityInfoMapCanvas) {
      dom.cityInfoMapCanvas.addEventListener("mousemove", handleCityInfoMapHover);
      dom.cityInfoMapCanvas.addEventListener("mouseleave", hideCityInfoMapTooltip);
    }
    if (dom.worldMapCanvas) {
      dom.worldMapCanvas.addEventListener("mousemove", handleWorldMapHover);
      dom.worldMapCanvas.addEventListener("mouseleave", hideWorldMapTooltip);
    }
    if (dom.cityHubBtn) {
      dom.cityHubBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (uiState.activeFooterButton === "hub") {
          setActiveFooterButton(null);
          return;
        }
        showTimetablePanel(false);
        tasks.showTaskDetailPanel(false);
        hideCityInfoPanel();
        showLabPanel(false);
        showHqPanel(false);
        showWorkshopPanel(false);
        maybeShowCityImage(map.getCityAt(agentState.position.x, agentState.position.y));
        setActiveFooterButton("hub");
      });
    }
    if (dom.infoCenterBtn) {
      dom.infoCenterBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const isVisible = dom.cityInfoPanel && !dom.cityInfoPanel.classList.contains("hidden");
        if (uiState.activeFooterButton === "info" && isVisible) {
          hideCityInfoPanel();
          setActiveFooterButton(null);
        } else {
          showCityInfoPanel(true);
          setActiveFooterButton("info");
        }
      });
    }
    if (dom.labBtn) {
      dom.labBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const isVisible = dom.labPanelEl && !dom.labPanelEl.classList.contains("hidden");
        if (uiState.activeFooterButton === "lab" && isVisible) {
          showLabPanel(false);
          setActiveFooterButton(null);
        } else {
          showLabPanel(true);
          setActiveFooterButton("lab");
        }
      });
    }
    if (dom.hqBtn) {
      dom.hqBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const isVisible = dom.hqPanelEl && !dom.hqPanelEl.classList.contains("hidden");
        if (uiState.activeFooterButton === "hq" && isVisible) {
          showHqPanel(false);
          setActiveFooterButton(null);
        } else {
          showHqPanel(true);
          setActiveFooterButton("hq");
        }
      });
    }
    if (dom.workshopBtn) {
      dom.workshopBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const isVisible = dom.workshopPanelEl && !dom.workshopPanelEl.classList.contains("hidden");
        if (uiState.activeFooterButton === "workshop" && isVisible) {
          showWorkshopPanel(false);
          setActiveFooterButton(null);
        } else {
          showWorkshopPanel(true);
          setActiveFooterButton("workshop");
        }
      });
    }
    if (dom.marketBtn) {
      dom.marketBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const isVisible = dom.marketPanelEl && !dom.marketPanelEl.classList.contains("hidden");
        if (uiState.activeFooterButton === "market" && isVisible) {
          showMarketPanel(false);
          setActiveFooterButton(null);
        } else {
          showMarketPanel(true);
          setActiveFooterButton("market");
        }
      });
    }
    if (dom.closeLabPanelBtn) {
      dom.closeLabPanelBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showLabPanel(false);
        setActiveFooterButton(null);
      });
    }
    if (dom.closeHqPanelBtn) {
      dom.closeHqPanelBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showHqPanel(false);
        setActiveFooterButton(null);
      });
    }
    if (dom.closeMarketPanelBtn) {
      dom.closeMarketPanelBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showMarketPanel(false);
        setActiveFooterButton(null);
      });
    }
    if (dom.closeWorkshopPanelBtn) {
      dom.closeWorkshopPanelBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showWorkshopPanel(false);
        setActiveFooterButton(null);
      });
    }
    if (dom.closeCityInfoPanelBtn) {
      dom.closeCityInfoPanelBtn.addEventListener("click", (e) => {
        e.preventDefault();
        hideCityInfoPanel();
        setActiveFooterButton(null);
      });
    }
    if (dom.closeTimetablePanelBtn) {
      dom.closeTimetablePanelBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showTimetablePanel(false);
        setActiveFooterButton(null);
      });
    }
    if (dom.restartButton) {
      dom.restartButton.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          if (window && window.localStorage) {
            window.localStorage.setItem(config.randomStartFlagKey, "1");
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
    if (dom.teleportTesterBtn && dom.teleportOverlayEl) {
      dom.teleportTesterBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showTeleportOverlay();
      });
    }
    if (dom.teleportOverlayCloseBtn) {
      dom.teleportOverlayCloseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        hideTeleportOverlay();
      });
    }
    if (dom.teleportExecuteBtn) {
      dom.teleportExecuteBtn.addEventListener("click", (e) => {
        e.preventDefault();
        handleTeleportSubmit();
      });
    }
    if (dom.levelUpContinueEl) {
      dom.levelUpContinueEl.addEventListener("click", (e) => {
        e.preventDefault();
        closeLevelUpOverlay();
      });
    }
    if (dom.levelUpOverlayEl) {
      dom.levelUpOverlayEl.addEventListener("click", (event) => {
        if (event.target === dom.levelUpOverlayEl) {
          closeLevelUpOverlay();
        }
      });
    }
  }

  return {
    setActiveFooterButton,
    setTimetableRaised,
    showTimetablePanel,
    hideAllPanelsExcept,
    isLabPanelVisible,
    isHqPanelVisible,
    isMarketPanelVisible,
    applySkyGradientForMinutes,
    getCurrentCitySnapshot,
    renderCityInfo,
    renderCityInfoMap,
    showCityInfoPanel,
    hideCityInfoPanel,
    updateLabAvailability,
    updateWorkshopAvailability,
    updateBankAvailability,
    updateHqAvailability,
    updateMarketAvailability,
    renderLabPanel,
    loadLabPanelData,
    renderMarketPanel,
    showLabPanel,
    showHqPanel,
    showWorkshopPanel,
    showMarketPanel,
    maybeShowCityImage,
    setTeleportStatus,
    showTeleportOverlay,
    hideTeleportOverlay,
    handleTeleportSubmit,
    queueLevelUps,
    populateTeleportSelect,
    updateSidebar,
    renderTimetablePage,
    updateTimetable,
    findDepartureToCity,
    travelFromCurrentCity,
    travelToCity,
    initUiEvents,
  };
}
