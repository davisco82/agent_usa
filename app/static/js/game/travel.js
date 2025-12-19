export function createTravelService({ config, state, dom, time, map, agent, ui }) {
  const travelState = state.travel;
  const trainState = state.train;
  const agentState = state.agent;

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

  function playTravelSound() {
    if (!dom.travelSound) return;
    try {
      dom.travelSound.currentTime = 0;
      const playPromise = dom.travelSound.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } catch (err) {
      console.warn("Travel sound playback failed:", err);
    }
  }

  function clamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  function travelProgressProfile(t, totalMinutes) {
    const total = Math.max(totalMinutes || 0, 1);
    let accelFrac = Math.min(60 / total, 0.4);
    let decelFrac = Math.min(60 / total, 0.4);
    const maxSum = 0.8;
    if (accelFrac + decelFrac > maxSum) {
      const scale = maxSum / (accelFrac + decelFrac);
      accelFrac *= scale;
      decelFrac *= scale;
    }
    const midFrac = Math.max(0.2, 1 - accelFrac - decelFrac);

    if (t <= 0) return 0;
    if (t >= 1) return 1;

    const denom = 0.5 * accelFrac * accelFrac + accelFrac * midFrac + 0.5 * accelFrac * decelFrac;
    const a = denom > 0 ? 1 / denom : 0;
    const vCruise = a * accelFrac;

    if (t < accelFrac) {
      return 0.5 * a * t * t;
    }

    if (t < accelFrac + midFrac) {
      const tau = t - accelFrac;
      const distAccel = 0.5 * a * accelFrac * accelFrac;
      return distAccel + vCruise * tau;
    }

    const tau = t - accelFrac - midFrac;
    const distBeforeDecel = 0.5 * a * accelFrac * accelFrac + vCruise * midFrac;
    const decel = vCruise / decelFrac;
    const distDecel = vCruise * tau - 0.5 * decel * tau * tau;
    return Math.min(1, distBeforeDecel + distDecel);
  }

  function renderTravelOverlay(progress, currentMinutes) {
    if (!dom.travelOverlayEl) return;
    if (!travelState.animation) {
      dom.travelOverlayEl.classList.add("hidden");
      return;
    }

    dom.travelOverlayEl.classList.remove("hidden");

    const p = Math.min(1, Math.max(0, progress));
    travelState.animation.currentProgress = p;
    renderTravelMap(p);

    if (dom.travelClockLabel) {
      const displayMinutes = Math.floor(currentMinutes);
      dom.travelClockLabel.textContent = time.formatGameTime(displayMinutes);
    }
  }

  function buildTravelMapView(fromCity, toCity) {
    if (!fromCity || !toCity || !dom.travelMapCanvas) return null;
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
    const availableWidth = Math.max(20, config.landBounds.maxX - config.landBounds.minX);
    const availableHeight = Math.max(20, config.landBounds.maxY - config.landBounds.minY);
    const maxWidth = Math.min(config.baseMapWidth, availableWidth);
    const maxHeight = Math.min(config.baseMapHeight, availableHeight);
    const viewWidth = clamp(spanX + paddingX, 260, maxWidth);
    const viewHeight = clamp(spanY + paddingY, 220, maxHeight);
    const halfWidth = viewWidth / 2;
    const halfHeight = viewHeight / 2;
    const minCenterX = config.landBounds.minX + halfWidth;
    const maxCenterX = config.landBounds.maxX - halfWidth;
    const minCenterY = config.landBounds.minY + halfHeight;
    const maxCenterY = config.landBounds.maxY - halfHeight;
    const clampedCenterX = clamp(centerX, minCenterX, maxCenterX);
    const clampedCenterY = clamp(centerY, minCenterY, maxCenterY);
    const minViewX = clamp(clampedCenterX - halfWidth, config.landBounds.minX, config.landBounds.maxX - viewWidth);
    const minViewY = clamp(clampedCenterY - halfHeight, config.landBounds.minY, config.landBounds.maxY - viewHeight);

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
    if (!city || !view || !dom.travelMapCanvas) return null;
    const scaleX = dom.travelMapCanvas.width / view.width;
    const scaleY = dom.travelMapCanvas.height / view.height;
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
    if (!dom.travelMapCtx || !dom.travelMapCanvas || !travelState.animation) return;
    const width = dom.travelMapCanvas.width;
    const height = dom.travelMapCanvas.height;
    dom.travelMapCtx.clearRect(0, 0, width, height);

    const meta = travelState.animation.meta || {};
    let fromCity = meta.fromCity || map.getCityByNameInsensitive(meta.fromName);
    let toCity = meta.toCity || map.getCityByNameInsensitive(meta.toName);

    if (!meta.fromCity && fromCity) {
      travelState.animation.meta.fromCity = fromCity;
    }
    if (!meta.toCity && toCity) {
      travelState.animation.meta.toCity = toCity;
    }

    if (!travelState.animation.mapView && fromCity && toCity) {
      travelState.animation.mapView = buildTravelMapView(fromCity, toCity);
    }

    const view = travelState.animation.mapView;
    if (!fromCity || !toCity || !view) {
      dom.travelMapCtx.fillStyle = "rgba(15, 23, 42, 0.9)";
      dom.travelMapCtx.fillRect(0, 0, width, height);
      dom.travelMapCtx.fillStyle = "rgba(148, 163, 184, 0.7)";
      dom.travelMapCtx.font = "12px 'Inter', sans-serif";
      dom.travelMapCtx.textAlign = "center";
      dom.travelMapCtx.textBaseline = "middle";
      dom.travelMapCtx.fillText("Čekám na mapu cesty...", width / 2, height / 2);
      return;
    }

    if (state.map.mapLoaded && state.map.mapImage.width && state.map.mapImage.height) {
      const baseWidth = config.baseMapWidth || state.map.mapImage.width;
      const baseHeight = config.baseMapHeight || state.map.mapImage.height;
      const sourceX = (view.minX / baseWidth) * state.map.mapImage.width;
      const sourceY = (view.minY / baseHeight) * state.map.mapImage.height;
      const sourceWidth = (view.width / baseWidth) * state.map.mapImage.width;
      const sourceHeight = (view.height / baseHeight) * state.map.mapImage.height;
      dom.travelMapCtx.save();
      dom.travelMapCtx.globalAlpha = 0.95;
      dom.travelMapCtx.drawImage(
        state.map.mapImage,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        width,
        height
      );
      dom.travelMapCtx.restore();
    } else {
      const gradient = dom.travelMapCtx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#0f172a");
      gradient.addColorStop(1, "#1e293b");
      dom.travelMapCtx.fillStyle = gradient;
      dom.travelMapCtx.fillRect(0, 0, width, height);
    }

    dom.travelMapCtx.fillStyle = "rgba(2, 6, 23, 0.55)";
    dom.travelMapCtx.fillRect(0, 0, width, height);

    if (Array.isArray(state.map.cities) && state.map.cities.length) {
      const viewMinX = view.minX ?? view.centerX - (view.width || 0) / 2;
      const viewMaxX = viewMinX + (view.width || 0);
      const viewMinY = view.minY ?? view.centerY - (view.height || 0) / 2;
      const viewMaxY = viewMinY + (view.height || 0);
      dom.travelMapCtx.save();
      for (const city of state.map.cities) {
        if (city.px < viewMinX || city.px > viewMaxX || city.py < viewMinY || city.py > viewMaxY) {
          continue;
        }
        const projected = projectTravelCityPosition(city, view);
        if (!projected) continue;
        dom.travelMapCtx.globalAlpha = city.importance === 1 ? 0.5 : 0.25;
        dom.travelMapCtx.fillStyle = "rgba(148, 163, 184, 0.5)";
        dom.travelMapCtx.beginPath();
        dom.travelMapCtx.arc(projected.x, projected.y, city.importance === 1 ? 3.5 : 2, 0, Math.PI * 2);
        dom.travelMapCtx.fill();
      }
      dom.travelMapCtx.restore();
    }

    const fromPos = projectTravelCityPosition(fromCity, view);
    const toPos = projectTravelCityPosition(toCity, view);
    if (!fromPos || !toPos) return;

    dom.travelMapCtx.save();
    dom.travelMapCtx.strokeStyle = "rgba(94, 234, 212, 0.3)";
    dom.travelMapCtx.lineWidth = 8;
    dom.travelMapCtx.lineCap = "round";
    dom.travelMapCtx.globalAlpha = 0.35;
    dom.travelMapCtx.beginPath();
    dom.travelMapCtx.moveTo(fromPos.x, fromPos.y);
    dom.travelMapCtx.lineTo(toPos.x, toPos.y);
    dom.travelMapCtx.stroke();
    dom.travelMapCtx.restore();

    dom.travelMapCtx.save();
    dom.travelMapCtx.strokeStyle = "rgba(56, 189, 248, 0.95)";
    dom.travelMapCtx.lineWidth = 2.5;
    dom.travelMapCtx.setLineDash([10, 8]);
    dom.travelMapCtx.beginPath();
    dom.travelMapCtx.moveTo(fromPos.x, fromPos.y);
    dom.travelMapCtx.lineTo(toPos.x, toPos.y);
    dom.travelMapCtx.stroke();
    dom.travelMapCtx.restore();
    dom.travelMapCtx.setLineDash([]);

    const indicatorPos = {
      x: fromPos.x + (toPos.x - fromPos.x) * progress,
      y: fromPos.y + (toPos.y - fromPos.y) * progress,
    };

    dom.travelMapCtx.save();
    const glow = dom.travelMapCtx.createRadialGradient(
      indicatorPos.x,
      indicatorPos.y,
      0,
      indicatorPos.x,
      indicatorPos.y,
      28
    );
    glow.addColorStop(0, "rgba(14, 165, 233, 0.4)");
    glow.addColorStop(1, "rgba(14, 165, 233, 0)");
    dom.travelMapCtx.fillStyle = glow;
    dom.travelMapCtx.fillRect(indicatorPos.x - 30, indicatorPos.y - 30, 60, 60);
    dom.travelMapCtx.restore();

    dom.travelMapCtx.save();
    dom.travelMapCtx.fillStyle = "#38bdf8";
    dom.travelMapCtx.shadowColor = "rgba(14, 165, 233, 0.9)";
    dom.travelMapCtx.shadowBlur = 22;
    dom.travelMapCtx.beginPath();
    dom.travelMapCtx.arc(indicatorPos.x, indicatorPos.y, 7, 0, Math.PI * 2);
    dom.travelMapCtx.fill();
    dom.travelMapCtx.restore();

    dom.travelMapCtx.save();
    dom.travelMapCtx.strokeStyle = "rgba(14, 165, 233, 0.9)";
    dom.travelMapCtx.lineWidth = 2;
    dom.travelMapCtx.beginPath();
    dom.travelMapCtx.arc(indicatorPos.x, indicatorPos.y, 10, 0, Math.PI * 2);
    dom.travelMapCtx.stroke();
    dom.travelMapCtx.restore();

    drawTravelCityNode(dom.travelMapCtx, fromPos, map.formatCityLabel(fromCity.name), {
      fill: "rgba(251, 191, 36, 0.95)",
      stroke: "rgba(2, 6, 23, 0.9)",
      shadowColor: "rgba(251, 191, 36, 0.45)",
      textBaseline: "top",
      textOffsetY: 12,
    });

    drawTravelCityNode(dom.travelMapCtx, toPos, map.formatCityLabel(toCity.name), {
      fill: "rgba(248, 113, 113, 0.95)",
      stroke: "rgba(2, 6, 23, 0.9)",
      shadowColor: "rgba(248, 113, 113, 0.45)",
      textBaseline: "bottom",
      textOffsetY: -12,
    });
  }

  function scheduleTravel(targetCity, departureMinutes, travelMinutes, meta = {}) {
    const currentCity = map.getCityAt(agentState.position.x, agentState.position.y);
    const fromName = meta.fromName || currentCity?.name || "Neznámé";
    const toName = meta.toName || targetCity?.name || "Neznámé";
    const lineType = meta.lineType || "-";
    const distance = meta.distance || null;

    if (!targetCity || departureMinutes === undefined || departureMinutes === null) {
      return ui.travelToCity(targetCity);
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

    if (time.getGameMinutes() >= departureMinutes) {
      startTravelAnimation(travel);
      return;
    }

    travelState.pending = travel;
    if (travelState.pendingTimer) {
      clearTimeout(travelState.pendingTimer);
      travelState.pendingTimer = null;
    }
    const delayMs = Math.max(0, (departureMinutes - time.getGameMinutes()) * config.realMsPerGameMinute);
    travelState.pendingTimer = setTimeout(() => {
      startTravelAnimation(travel);
      travelState.pending = null;
      travelState.pendingTimer = null;
    }, delayMs);
    console.log(
      `Naplánována cesta do ${toName} v ${time.formatGameTime(departureMinutes)} (doba ${travelMinutes} min)`
    );
  }

  function scheduleTravelFromDeparture(dep) {
    if (!dep) return;
    const destinationName = dep.to_city?.name;
    const destinationCity = destinationName ? map.getCityByNameInsensitive(destinationName) : null;
    if (!destinationCity) return;
    const departureMinutes = dep._next_departure ?? map.normalizeDepartureMinutes(dep.departure_minutes, time.getGameMinutes());
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
    const depInfo = ui.findDepartureToCity(targetCity.name);
    const depMinutes = depInfo?._next_departure || map.normalizeDepartureMinutes(depInfo?.departure_minutes, time.getGameMinutes());
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

  function startTravelAnimation(travel) {
    if (!travel) return;
    console.log("Start animace cestovani", travel);
    playTravelSound();

    if (travelState.pendingTimer) {
      clearTimeout(travelState.pendingTimer);
      travelState.pendingTimer = null;
    }

    const startMinutes = Math.max(time.getGameMinutes(), travel.departureMinutes);
    const durationMinutes = Math.max(0, travel.travelMinutes || 0);
    const arrivalMinutes = startMinutes + durationMinutes;
    const distance = travel.distance || 0;
    const totalMinutes = Math.max(arrivalMinutes - startMinutes, 1);
    const fromCityObj = map.getCityByNameInsensitive(travel.fromName);
    const toCityObj = map.getCityByNameInsensitive(travel.toName);
    const initialMapView = buildTravelMapView(fromCityObj, toCityObj);

    const travelHours = durationMinutes / 60;
    let durationMs;
    if (travelHours <= 1) {
      durationMs = 3000 + travelHours * (5000 - 3000);
    } else {
      const clamped = Math.min(travelHours, 7);
      const extraHours = clamped - 1;
      durationMs = 5000 + (extraHours / 6) * (15000 - 5000);
    }
    durationMs = Math.max(3000, Math.min(15000, durationMs));

    travelState.animation = {
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

    const lineLabel = map.formatLineTypeLabel(travel.lineType);
    const trainLevel = map.getTrainLevel(travel.lineType);
    const trainSpeed = map.getTrainSpeedMph(trainLevel);

    if (dom.travelTopType) {
      dom.travelTopType.textContent = lineLabel;
    }
    if (dom.travelTopSpeed) {
      dom.travelTopSpeed.textContent = `${trainSpeed} mph`;
    }
    if (dom.travelTrainImg) {
      if (trainLevel === 1) {
        dom.travelTrainImg.src = "/static/assets/train_1.png";
      } else if (trainLevel === 2) {
        dom.travelTrainImg.src = "/static/assets/train_2.png";
      } else {
        dom.travelTrainImg.src = "/static/assets/train_3.png";
      }
    }
    if (dom.travelDistanceLabel) {
      dom.travelDistanceLabel.textContent = distance ? `${distance.toFixed(1)} mi` : "-";
    }
    if (dom.travelDurationLabel) {
      dom.travelDurationLabel.textContent = formatTravelDuration(travel.travelMinutes);
    }

    renderTravelOverlay(0, startMinutes);
  }

  function finishTravelAnimation() {
    if (!travelState.animation) return;
    console.log("Dokonceni animace cestovani", travelState.animation);

    time.setGameMinutes(travelState.animation.arrivalMinutes);
    const targetCity = travelState.animation.city;
    travelState.animation = null;

    renderTravelOverlay(1, time.getGameMinutes());
    dom.travelOverlayEl?.classList.add("hidden");

    trainState.purchasedTicketKey = null;

    completeTravel(targetCity);
  }

  function completeTravel(targetCity) {
    if (!targetCity) return;
    agent.grantTravelXp(5);
    ui.travelToCity(targetCity, { silent: true });
    ui.renderTimetablePage();
  }

  function tickTravelAnimation(nowMs) {
    if (!travelState.animation) return false;
    const elapsed = nowMs - travelState.animation.startMs;
    const t = travelState.animation.durationMs > 0 ? Math.min(1, elapsed / travelState.animation.durationMs) : 1;
    const eased = travelProgressProfile(t, travelState.animation.totalMinutes);
    time.setGameMinutes(travelState.animation.startMinutes + (travelState.animation.arrivalMinutes - travelState.animation.startMinutes) * eased);

    renderTravelOverlay(eased, time.getGameMinutes());
    ui.applySkyGradientForMinutes(time.getGameMinutes());

    if (t >= 1) {
      finishTravelAnimation();
    }
    return true;
  }

  function maybeStartPendingTravel() {
    if (!travelState.pending) return false;
    if (time.getGameMinutes() < travelState.pending.departureMinutes) return false;
    if (travelState.pendingTimer) {
      clearTimeout(travelState.pendingTimer);
      travelState.pendingTimer = null;
    }
    startTravelAnimation(travelState.pending);
    travelState.pending = null;
    return true;
  }

  return {
    formatTravelDuration,
    scheduleTravel,
    scheduleTravelFromDeparture,
    travelUsingTimetable,
    tickTravelAnimation,
    maybeStartPendingTravel,
    travelProgressProfile,
    renderTravelOverlay,
    playTravelSound,
  };
}
