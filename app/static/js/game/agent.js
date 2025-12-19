const DEFAULT_LEVEL_CONFIG = [
  { level: 1, xp_required: 0, energy_max: 3 },
  { level: 2, xp_required: 50, energy_max: 3 },
  { level: 3, xp_required: 50, energy_max: 4 },
  { level: 4, xp_required: 100, energy_max: 4 },
  { level: 5, xp_required: 100, energy_max: 4 },
  { level: 6, xp_required: 100, energy_max: 5 },
  { level: 7, xp_required: 100, energy_max: 5 },
  { level: 8, xp_required: 100, energy_max: 5 },
  { level: 9, xp_required: 100, energy_max: 5 },
  { level: 10, xp_required: 100, energy_max: 6 },
  { level: 11, xp_required: 100, energy_max: 6 },
  { level: 12, xp_required: 100, energy_max: 6 },
  { level: 13, xp_required: 100, energy_max: 7 },
  { level: 14, xp_required: 100, energy_max: 7 },
  { level: 15, xp_required: 100, energy_max: 7 },
  { level: 16, xp_required: 100, energy_max: 8 },
  { level: 17, xp_required: 100, energy_max: 8 },
  { level: 18, xp_required: 100, energy_max: 9 },
  { level: 19, xp_required: 100, energy_max: 9 },
  { level: 20, xp_required: 100, energy_max: 10 },
];

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

export function createAgentService({ config, state, dom, time }) {
  const agentState = state.agent;
  agentState.levelConfig = normalizeLevelConfig(DEFAULT_LEVEL_CONFIG);

  function getLevelCfg(level) {
    return agentState.levelConfig.find((c) => c.level === level);
  }

  function cumulativeXpForLevel(level) {
    const cfg = agentState.levelConfig;
    if (!cfg || cfg.length === 0) return 0;
    let total = 0;
    for (const entry of cfg) {
      if (entry.level > level) break;
      total += entry._xp_total_add || entry.xp_required || 0;
    }
    return total;
  }

  function updateAgentHeader() {
    if (!dom.agentLevelEl) return;

    const currentCfg = getLevelCfg(agentState.stats.level) || { xp_required: 0, energy_max: 5, _xp_total: 0 };
    const nextCfg = getLevelCfg(agentState.stats.level + 1);

    const prevXpThreshold = currentCfg._xp_total ?? cumulativeXpForLevel(agentState.stats.level);
    const nextXpThreshold = nextCfg ? nextCfg._xp_total ?? cumulativeXpForLevel(agentState.stats.level + 1) : prevXpThreshold;
    const stepTotal = Math.max(1, nextXpThreshold - prevXpThreshold);
    const xpProgressRaw = agentState.stats.xp - prevXpThreshold;
    const xpRemaining = Math.max(0, nextXpThreshold - agentState.stats.xp);
    const xpProgress = nextCfg ? Math.min(1, Math.max(0, xpProgressRaw / stepTotal)) : 1;

    dom.agentLevelEl.textContent = agentState.stats.level;
    if (dom.agentXpToNextEl) {
      dom.agentXpToNextEl.textContent = nextCfg ? `${xpRemaining} XP` : "MAX";
    }
    if (dom.agentLevelProgressFillEl) {
      dom.agentLevelProgressFillEl.style.width = `${xpProgress * 100}%`;
    }

    const energyMax = currentCfg.energy_max || 5;
    const energyCur = Math.min(agentState.stats.energy_current ?? energyMax, energyMax);
    if (dom.agentEnergyLabelEl) {
      dom.agentEnergyLabelEl.textContent = `${energyCur} / ${energyMax}`;
    }
    if (dom.agentEnergyBarFillEl) {
      const energyPct = Math.min(100, (energyCur / energyMax) * 100);
      dom.agentEnergyBarFillEl.style.width = `${energyPct}%`;
    }
  }

  function showXpGain(amount = 0) {
    if (!dom.xpGainBadgeEl || !amount || amount <= 0) return;
    dom.xpGainBadgeEl.textContent = `+${amount} XP`;
    dom.xpGainBadgeEl.setAttribute("aria-hidden", "false");
    dom.xpGainBadgeEl.classList.add("xp-gain-badge--visible");
    if (state.tasks.xpGainHideTimeout) {
      clearTimeout(state.tasks.xpGainHideTimeout);
    }
    state.tasks.xpGainHideTimeout = setTimeout(() => {
      dom.xpGainBadgeEl.classList.remove("xp-gain-badge--visible");
      dom.xpGainBadgeEl.setAttribute("aria-hidden", "true");
    }, 1600);
  }

  function grantTravelXp(amount = 5) {
    if (!amount || amount <= 0) return;
    showXpGain(amount);
    agentState.stats.xp = Math.max(0, (agentState.stats.xp || 0) + amount);

    while (true) {
      const nextCfg = getLevelCfg(agentState.stats.level + 1);
      if (!nextCfg) break;
      const nextThreshold = nextCfg._xp_total ?? cumulativeXpForLevel(nextCfg.level);
      if (agentState.stats.xp < nextThreshold) break;
      agentState.stats.level = nextCfg.level;
      agentState.stats.energy_current = nextCfg.energy_max;
      if (dom.levelUpSound) {
        try {
          dom.levelUpSound.currentTime = 0;
          dom.levelUpSound.play().catch(() => {});
        } catch (err) {
          console.warn("Level-up sound failed:", err);
        }
      }
    }

    const curCfg = getLevelCfg(agentState.stats.level) || { energy_max: 5 };
    if (agentState.stats.energy_current === undefined || agentState.stats.energy_current === null) {
      agentState.stats.energy_current = curCfg.energy_max;
    } else {
      agentState.stats.energy_current = Math.min(agentState.stats.energy_current, curCfg.energy_max);
    }

    updateAgentHeader();
  }

  function enqueueXpReward(amount = 0) {
    if (!amount || amount <= 0) return;
    agentState.pendingXpReward += amount;
  }

  function flushPendingXpRewards() {
    if (!agentState.pendingXpReward) return;
    const amount = agentState.pendingXpReward;
    agentState.pendingXpReward = 0;
    grantTravelXp(amount);
  }

  async function resetAgentState() {
    try {
      const res = await fetch("/api/agent/reset", { method: "POST" });
      if (!res.ok) {
        throw new Error("Failed to reset agent");
      }
      const data = await res.json();
      const resetEnergy =
        getLevelCfg(1)?.energy_max || data?.agent?.energy_max || agentState.stats.energy_current || 5;
      agentState.stats = { level: 1, xp: 0, energy_current: resetEnergy };
      agentState.currentCityId = null;
      agentState.currentCityName = null;
      agentState.serverKnownCityId = null;
      updateAgentHeader();
    } catch (err) {
      console.error("Agent reset failed:", err);
    }
  }

  async function loadAgentAndLevels() {
    try {
      const res = await fetch("/api/agent");
      if (!res.ok) throw new Error("Failed to fetch agent");
      const data = await res.json();

      if (Array.isArray(data.levels) && data.levels.length > 0) {
        agentState.levelConfig = normalizeLevelConfig(data.levels);
      } else if (!agentState.levelConfig || agentState.levelConfig.length === 0) {
        agentState.levelConfig = normalizeLevelConfig(DEFAULT_LEVEL_CONFIG);
      }

      if (data.agent) {
        agentState.stats = {
          level: data.agent.level ?? 1,
          xp: data.agent.xp ?? 0,
          energy_current: data.agent.energy_current ?? (data.agent.energy_max || 5),
        };
        agentState.currentCityId = data.agent.current_city_id ?? null;
        agentState.currentCityName = data.agent.current_city_name ?? null;
        agentState.serverKnownCityId = agentState.currentCityId;
      }
    } catch (err) {
      console.error("Agent load failed, using defaults:", err);
    }

    updateAgentHeader();
  }

  function persistAgentLocation(cityId) {
    if (!cityId || cityId === agentState.serverKnownCityId) {
      return;
    }

    time.persistGameMinutes();

    const timeSnapshot = time.buildGameTimeSnapshot(time.getGameMinutes());
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
        agentState.serverKnownCityId = updatedId ?? cityId;
      })
      .catch((err) => {
        console.error("Agent location sync failed:", err);
      });
  }

  function setAgentPositionToCity(city, options = {}) {
    if (!city) return false;
    agentState.position.x = city.x;
    agentState.position.y = city.y;
    agentState.currentCityId = city.id ?? null;
    agentState.currentCityName = city.name ?? null;

    if (options.persist) {
      persistAgentLocation(city.id);
    }

    return true;
  }

  function consumeRandomStartFlag() {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    try {
      const flag = window.localStorage.getItem(config.randomStartFlagKey);
      if (flag) {
        window.localStorage.removeItem(config.randomStartFlagKey);
        return true;
      }
    } catch (err) {
      console.warn("Unable to read random start flag:", err);
    }
    return false;
  }

  return {
    updateAgentHeader,
    grantTravelXp,
    enqueueXpReward,
    flushPendingXpRewards,
    resetAgentState,
    loadAgentAndLevels,
    setAgentPositionToCity,
    persistAgentLocation,
    consumeRandomStartFlag,
  };
}
