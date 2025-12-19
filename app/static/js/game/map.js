export function createMapService({ config, state }) {
  const mapState = state.map;
  const fogState = state.fog;
  const trainState = state.train;
  const agentState = state.agent;

  function initMapImage(onLoad) {
    mapState.mapImage.src = config.mapImageSrc;
    mapState.mapImage.addEventListener("load", () => {
      mapState.mapLoaded = true;
      if (typeof onLoad === "function") {
        onLoad();
      }
    });
  }

  function tileIndex(x, y) {
    return y * config.gridCols + x;
  }

  function initFog() {
    fogState.tiles.clear();
    fogState.frontier = [];
    const seeds = 3;
    for (let i = 0; i < seeds; i++) {
      const x = Math.floor(Math.random() * config.gridCols);
      const y = Math.floor(Math.random() * config.gridRows);
      const idx = tileIndex(x, y);
      fogState.tiles.add(idx);
      fogState.frontier.push({ x, y });
    }
  }

  function spreadFog() {
    if (Math.random() > fogState.spreadSpeed) return;

    const newFog = new Set(fogState.tiles);
    const newFrontier = [];
    const samples = Math.max(1, Math.floor(fogState.frontier.length * 0.35));
    for (let i = 0; i < samples; i++) {
      if (fogState.frontier.length === 0) break;
      const idx = Math.floor(Math.random() * fogState.frontier.length);
      const cell = fogState.frontier.splice(idx, 1)[0];

      const neighbors = [
        { x: cell.x + 1, y: cell.y },
        { x: cell.x - 1, y: cell.y },
        { x: cell.x,     y: cell.y + 1 },
        { x: cell.x,     y: cell.y - 1 },
      ];

      neighbors.forEach((n) => {
        if (n.x >= 0 && n.x < config.gridCols && n.y >= 0 && n.y < config.gridRows) {
          const tidx = tileIndex(n.x, n.y);
          if (!newFog.has(tidx)) {
            if (Math.random() < 0.6) {
              newFog.add(tidx);
              newFrontier.push({ x: n.x, y: n.y });
            }
          }
        }
      });
    }

    fogState.tiles = newFog;
    fogState.frontier.push(...newFrontier);
  }

  function isCityInFog(city) {
    return fogState.tiles.has(tileIndex(city.x, city.y));
  }

  function getCityAt(x, y) {
    return mapState.cities.find((c) => c.x === x && c.y === y);
  }

  function findCityAtPixel(px, py) {
    if (!Array.isArray(mapState.cities) || mapState.cities.length === 0) return null;

    let nearest = null;
    let nearestDist = Infinity;

    for (const city of mapState.cities) {
      const baseRadius = city.importance === 1 ? 4.5 : 3;
      const hitRadius = baseRadius + 5;
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
    if (!Array.isArray(trainState.lines) || trainState.lines.length === 0) return null;

    const currentCity = getCityAt(agentState.position.x, agentState.position.y);
    const currentCityName = currentCity ? currentCity.name : null;
    if (!currentCityName) return null;

    const hitThreshold = 6;

    for (const line of trainState.lines) {
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

      const fromCity = mapState.cityByName.get(fromName);
      const toCity = mapState.cityByName.get(toName);
      if (!fromCity || !toCity) continue;

      const isConnectedToAgent =
        fromCity.name === currentCityName || toCity.name === currentCityName;
      if (!isConnectedToAgent) continue;

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

  function buildConnectionsMap() {
    trainState.connectionsByCityName = new Map();

    if (!Array.isArray(trainState.lines) || trainState.lines.length === 0) {
      return;
    }

    for (const line of trainState.lines) {
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

      const fromCity = mapState.cityByName.get(fromName);
      const toCity   = mapState.cityByName.get(toName);
      if (!fromCity || !toCity) continue;

      if (!trainState.connectionsByCityName.has(fromCity.name)) {
        trainState.connectionsByCityName.set(fromCity.name, []);
      }
      if (!trainState.connectionsByCityName.has(toCity.name)) {
        trainState.connectionsByCityName.set(toCity.name, []);
      }

      trainState.connectionsByCityName.get(fromCity.name).push(toCity);
      trainState.connectionsByCityName.get(toCity.name).push(fromCity);
    }

    for (const [name, arr] of trainState.connectionsByCityName.entries()) {
      const seen = new Set();
      const unique = [];
      for (const c of arr) {
        if (seen.has(c.name)) continue;
        seen.add(c.name);
        unique.push(c);
      }
      trainState.connectionsByCityName.set(name, unique);
    }
  }

  function computeNextDeparturesFromCity(city, limit = 5, nowMinutes = 0) {
    if (!city || !Array.isArray(trainState.lines) || trainState.lines.length === 0) {
      return [];
    }

    const departures = [];

    for (const line of trainState.lines) {
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
        continue;
      }

      const destCity = mapState.cityByName.get(destName);
      if (!destCity) continue;

      const freq = line.frequency_minutes || 60;
      const base = Math.ceil(nowMinutes / freq) * freq;

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

    departures.sort((a, b) => a.departureMinutes - b.departureMinutes);
    return departures.slice(0, limit);
  }

  function getConnections(cityName) {
    return trainState.connectionsByCityName.get(cityName) || [];
  }

  function normalizeDepartureMinutes(baseMinutes, nowMinutes) {
    if (baseMinutes === undefined || baseMinutes === null) return null;
    let candidate = baseMinutes;
    if (candidate <= nowMinutes) {
      const daysAhead = Math.floor((nowMinutes - candidate) / config.minutesPerDay) + 1;
      candidate += daysAhead * config.minutesPerDay;
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

  function setHoveredCity(city) {
    mapState.hoveredCity = city;
  }

  function setHoveredLineKey(key) {
    mapState.hoveredLineKey = key;
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
      const stateLabel = city.state_shortcut || city.state;
      if (stateLabel) return `${city.name}, ${stateLabel}`;
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
    const direct = mapState.cityByName.get(name);
    if (direct) return direct;
    return mapState.cityByName.get(name.toLowerCase()) || null;
  }

  function getCityById(id) {
    if (id === undefined || id === null) return null;
    return mapState.cityById.get(Number(id)) || null;
  }

  function setCities(rawCities) {
    mapState.cities = rawCities.map((c) => {
      const px = c.px;
      const py = c.py;
      const x = Math.round(px / config.tileSize);
      const y = Math.round(py / config.tileSize);
      return {
        ...c,
        px,
        py,
        x,
        y,
      };
    });

    mapState.cityByName = new Map();
    mapState.cityById = new Map();
    mapState.cities.forEach((city) => {
      if (!city || !city.name) return;
      mapState.cityByName.set(city.name, city);
      mapState.cityByName.set(city.name.toLowerCase(), city);
      if (city.id !== undefined && city.id !== null) {
        mapState.cityById.set(Number(city.id), city);
      }
    });
  }

  function drawCities(ctx) {
    const currentCity = getCityAt(agentState.position.x, agentState.position.y);
    const reachableNames = new Set();
    if (currentCity) {
      reachableNames.add(currentCity.name);
      const conns = getConnections(currentCity.name);
      conns.forEach((c) => reachableNames.add(c.name));
    }
    const blinkPhase = Math.abs(Math.sin(performance.now() / 900));

    mapState.cities.forEach((city) => {
      const isKeyCity = city.importance === 1;
      const isHovered = mapState.hoveredCity && mapState.hoveredCity.name === city.name;
      const baseRadius =
        city.importance === 1 ? 6 : city.importance === 2 ? 4.5 : 3;
      const radius = isHovered ? baseRadius + 1 : baseRadius;

      ctx.fillStyle = isCityInFog(city) ? "#DC2626" : "#22c55e";
      ctx.beginPath();
      ctx.arc(city.px, city.py, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = isKeyCity ? 1.2 : 1;
      ctx.stroke();

      if (currentCity && city.name === currentCity.name) {
        ctx.beginPath();
        const ringAlpha = 0.35 + 0.65 * blinkPhase;
        ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha.toFixed(2)})`;
        ctx.lineWidth = 2.2;
        ctx.arc(city.px, city.py, radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    ctx.font = "10px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    mapState.cities.forEach((city) => {
      const isHovered = mapState.hoveredCity && mapState.hoveredCity.name === city.name;
      const reachable = reachableNames.has(city.name);
      const alwaysShow = city.importance === 1 || reachable;
      const shouldShow = alwaysShow || isHovered;

      if (!shouldShow) {
        return;
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

  function drawTrainLines(ctx) {
    if (!Array.isArray(trainState.lines) || trainState.lines.length === 0) return;

    const currentCity = getCityAt(agentState.position.x, agentState.position.y);
    const currentCityName = currentCity ? currentCity.name : null;
    if (!currentCityName) {
      return;
    }

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round";

    for (const line of trainState.lines) {
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

      const fromCity = mapState.cityByName.get(fromName);
      const toCity = mapState.cityByName.get(toName);

      if (!fromCity || !toCity) {
        continue;
      }

      const isConnectedToAgent =
        fromCity.name === currentCityName || toCity.name === currentCityName;
      if (!isConnectedToAgent) {
        continue;
      }

      const isExpress = line.line_type === "express";
      const isRare = line.frequency_minutes >= 90;

      const lineKey = `${fromCity.name}__${toCity.name}`;
      const isHovered = mapState.hoveredLineKey === lineKey;

      if (isHovered) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
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

  function drawGrid(ctx) {
    if (!ctx) return;
    const canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (mapState.mapLoaded) {
      ctx.save();
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(mapState.mapImage, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.strokeStyle = "rgba(31, 41, 51, 0.08)";
    ctx.lineWidth = 0.3;

    for (let x = 0; x <= config.gridCols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * config.tileSize, 0);
      ctx.lineTo(x * config.tileSize, config.gridRows * config.tileSize);
      ctx.stroke();
    }

    for (let y = 0; y <= config.gridRows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * config.tileSize);
      ctx.lineTo(config.gridCols * config.tileSize, y * config.tileSize);
      ctx.stroke();
    }

    return canvas;
  }

  function drawFog(ctx) {
    if (!ctx) return;
    fogState.tiles.forEach((index) => {
      const x = index % config.gridCols;
      const y = Math.floor(index / config.gridCols);

      ctx.fillStyle = "rgba(200, 32, 32, 0.42)";
      ctx.fillRect(
        x * config.tileSize,
        y * config.tileSize,
        config.tileSize,
        config.tileSize
      );
    });
  }

  return {
    initMapImage,
    initFog,
    spreadFog,
    isCityInFog,
    tileIndex,
    getCityAt,
    findCityAtPixel,
    findLineAtPixel,
    buildConnectionsMap,
    computeNextDeparturesFromCity,
    getConnections,
    normalizeDepartureMinutes,
    makeDepartureKey,
    setHoveredCity,
    setHoveredLineKey,
    formatLineTypeLabel,
    getLineTypeInfo,
    formatCityLabel,
    formatPopulation,
    getTrainLevel,
    getTrainSpeedMph,
    getCityByNameInsensitive,
    getCityById,
    setCities,
    drawCities,
    drawTrainLines,
    drawGrid,
    drawFog,
  };
}
