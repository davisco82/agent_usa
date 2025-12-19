export function createConfig(dom) {
  const minutesPerDay = 24 * 60;

  return {
    tileSize: 8,
    gridCols: 128,
    gridRows: 72,
    minutesPerDay,
    minutesPerWeek: minutesPerDay * 7,
    dayNames: ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"],
    realMsPerGameMinute: 1000,
    baseMapWidth: dom.canvas?.width || 1024,
    baseMapHeight: dom.canvas?.height || 576,
    landBounds: {
      minX: 3,
      maxX: 941,
      minY: 53,
      maxY: 568,
    },
    timetableLimit: 10,
    baseBackdropFilter: "saturate(1.15) contrast(0.95)",
    gameTimeStorageKey: "agent_game_minutes",
    gameTimeSavedAtKey: "agent_game_minutes_saved_at",
    randomStartFlagKey: "agent_force_random_spawn",
    mapImageSrc: "/static/assets/usa_sil.png",
  };
}
