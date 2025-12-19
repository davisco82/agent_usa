export function createTimeService({ config, state, storage = null }) {
  const timeState = state.time;

  function formatGameTime(totalMinutes) {
    const minutesNorm = ((totalMinutes % config.minutesPerWeek) + config.minutesPerWeek) % config.minutesPerWeek;
    const dayIndex = Math.floor(minutesNorm / config.minutesPerDay);
    const minuteOfDay = minutesNorm % config.minutesPerDay;
    const hours = Math.floor(minuteOfDay / 60);
    const minutes = minuteOfDay % 60;
    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    return `${config.dayNames[dayIndex]} ${hh}:${mm}`;
  }

  function formatGameTimeHHMM(totalMinutes) {
    const minutesNorm = ((totalMinutes % config.minutesPerWeek) + config.minutesPerWeek) % config.minutesPerWeek;
    const minuteOfDay = minutesNorm % config.minutesPerDay;
    const hours = Math.floor(minuteOfDay / 60);
    const minutes = minuteOfDay % 60;
    const hh = String(hours).padStart(2, "0");
    const mm = String(minutes).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function formatWeekAndTime(totalMinutes) {
    const weekIndex = Math.floor(totalMinutes / config.minutesPerWeek);
    const weekLabel = Math.max(1, weekIndex + 1);
    return {
      weekText: `Týden ${weekLabel}`,
      timeText: formatGameTime(totalMinutes),
    };
  }

  function buildGameTimeSnapshot(totalMinutes) {
    const safeMinutes = Math.max(0, Math.round(totalMinutes ?? 0));
    const rawWeekIndex = Math.floor(safeMinutes / config.minutesPerWeek) + 1;
    const minuteOfWeek = ((safeMinutes % config.minutesPerWeek) + config.minutesPerWeek) % config.minutesPerWeek;
    const dayIndex = Math.floor(minuteOfWeek / config.minutesPerDay);
    const minuteOfDay = minuteOfWeek % config.minutesPerDay;
    const hours = Math.floor(minuteOfDay / 60);
    const minutes = minuteOfDay % 60;

    return {
      minutes: safeMinutes,
      weekIndex: Math.max(1, rawWeekIndex),
      weekLabel: `Týden ${Math.max(1, rawWeekIndex)}`,
      dayIndex,
      dayLabel: config.dayNames[dayIndex] || config.dayNames[0],
      timeLabel: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
    };
  }

  function canUseLocalStorage() {
    try {
      return typeof window !== "undefined" && !!window.localStorage;
    } catch (err) {
      return false;
    }
  }

  function loadPersistedGameMinutes() {
    const store = storage || window?.localStorage;
    if (!canUseLocalStorage() || !store) return false;
    try {
      const rawMinutes = store.getItem(config.gameTimeStorageKey);
      if (rawMinutes === null) return false;
      const parsed = Number(rawMinutes);
      if (!Number.isFinite(parsed) || parsed < 0) return false;
      timeState.gameMinutes = Math.floor(parsed);
      timeState.lastSavedGameMinutes = Math.floor(parsed);
      timeState.hasUnsavedTime = false;
      return true;
    } catch (err) {
      console.warn("Unable to load saved game time:", err);
      return false;
    }
  }

  function persistGameMinutes() {
    const store = storage || window?.localStorage;
    if (!canUseLocalStorage() || !store) return;
    try {
      const safeMinutes = Math.max(0, Math.round(timeState.gameMinutes ?? 0));
      store.setItem(config.gameTimeStorageKey, String(safeMinutes));
      store.setItem(config.gameTimeSavedAtKey, String(Date.now()));
      timeState.lastSavedGameMinutes = safeMinutes;
      timeState.hasUnsavedTime = false;
    } catch (err) {
      console.warn("Unable to persist game time:", err);
    }
  }

  function hasUnsavedProgress() {
    if (!Number.isFinite(timeState.gameMinutes)) return false;
    if (timeState.hasUnsavedTime) return true;
    if (timeState.lastSavedGameMinutes === null || timeState.lastSavedGameMinutes === undefined) {
      return true;
    }
    return timeState.gameMinutes > timeState.lastSavedGameMinutes;
  }

  function markUnsaved() {
    timeState.hasUnsavedTime = true;
  }

  function setGameMinutes(minutes) {
    timeState.gameMinutes = minutes;
  }

  function getGameMinutes() {
    return timeState.gameMinutes;
  }

  function advanceTime(deltaMs) {
    timeState.timeAccumulatorMs += deltaMs;
    let advancedMinutes = 0;
    while (timeState.timeAccumulatorMs >= config.realMsPerGameMinute) {
      timeState.timeAccumulatorMs -= config.realMsPerGameMinute;
      timeState.gameMinutes += 1;
      advancedMinutes += 1;
    }
    if (advancedMinutes > 0) {
      markUnsaved();
    }
    return advancedMinutes;
  }

  return {
    formatGameTime,
    formatGameTimeHHMM,
    formatWeekAndTime,
    buildGameTimeSnapshot,
    loadPersistedGameMinutes,
    persistGameMinutes,
    hasUnsavedProgress,
    markUnsaved,
    setGameMinutes,
    getGameMinutes,
    advanceTime,
  };
}
