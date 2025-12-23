from __future__ import annotations

from typing import Any, Dict

from flask import Blueprint, jsonify, request

from app.domain.agent.level_config import AGENT_LEVELS
from app.extensions import db
from app.models.agent import Agent
from app.models.city import City
from app.models.agent_travel_log import AgentTravelLog

bp = Blueprint("agent", __name__, url_prefix="/api")

MINUTES_PER_DAY = 24 * 60
MINUTES_PER_WEEK = MINUTES_PER_DAY * 7
DAY_NAMES = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"]


def _level_cfg(level: int) -> Dict[str, Any] | None:
    for cfg in AGENT_LEVELS:
        if cfg["level"] == level:
            return cfg
    return None


def _serialize_agent(agent: Agent | None) -> Dict[str, Any]:
    """Return a consistent payload for the current agent and their location."""
    if not agent:
        fallback_cfg = _level_cfg(1) or {"energy_max": 0}
        energy_max = fallback_cfg.get("energy_max", 0)
        return {
            "level": 1,
            "xp": 0,
            "energy_current": 0,
            "energy_max": energy_max,
            "data_current": 0,
            "data_max": 100,
            "material_current": 0,
            "material_max": 100,
            "current_city_id": None,
            "current_city_name": None,
        }

    cfg = _level_cfg(agent.level) or _level_cfg(1) or {"energy_max": agent.energy_max}
    energy_max = cfg.get("energy_max", agent.energy_max)
    payload: Dict[str, Any] = {
        "id": agent.id,
        "level": agent.level,
        "xp": agent.xp,
        "energy_current": min(agent.energy_current, energy_max),
        "energy_max": energy_max,
        "data_current": agent.data_current,
        "data_max": agent.data_max,
        "material_current": agent.material_current,
        "material_max": agent.material_max,
        "current_city_id": agent.current_city_id,
        "current_city_name": agent.current_city.name if agent.current_city else None,
    }

    if agent.current_city:
        payload["current_city"] = {
            "id": agent.current_city.id,
            "name": agent.current_city.name,
            "state": agent.current_city.state,
            "state_shortcut": agent.current_city.state_shortcut,
            "px": agent.current_city.px,
            "py": agent.current_city.py,
            "grid_x": agent.current_city.grid_x,
            "grid_y": agent.current_city.grid_y,
        }

    return payload


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _compute_game_clock(minutes: int) -> Dict[str, Any]:
    safe_minutes = max(0, int(minutes))
    week_index = (safe_minutes // MINUTES_PER_WEEK) + 1
    minute_of_week = safe_minutes % MINUTES_PER_WEEK
    day_index = minute_of_week // MINUTES_PER_DAY
    minute_of_day = minute_of_week % MINUTES_PER_DAY
    hours = minute_of_day // 60
    mins = minute_of_day % 60
    day_label = DAY_NAMES[day_index] if 0 <= day_index < len(DAY_NAMES) else "Po"
    time_label = f"{hours:02d}:{mins:02d}"
    return {
        "minutes": safe_minutes,
        "week_index": week_index,
        "day_index": day_index,
        "day_label": day_label,
        "time_label": time_label,
    }


def _extract_game_clock(payload: Dict[str, Any]) -> Dict[str, Any]:
    minutes = _safe_int(payload.get("game_minutes"), default=0)
    computed = _compute_game_clock(minutes)

    week_override = payload.get("game_week")
    if isinstance(week_override, int):
        computed["week_index"] = week_override

    day_index_override = payload.get("game_day_index")
    if isinstance(day_index_override, int):
        computed["day_index"] = day_index_override

    day_label_override = payload.get("game_day_label")
    if isinstance(day_label_override, str) and day_label_override:
        computed["day_label"] = day_label_override

    time_label_override = payload.get("game_time_label")
    if isinstance(time_label_override, str) and time_label_override:
        computed["time_label"] = time_label_override

    return computed


@bp.get("/agent")
def api_agent():
    """Return the active agent and level configuration for the UI."""
    agent = Agent.query.order_by(Agent.id.asc()).first()
    return jsonify({"agent": _serialize_agent(agent), "levels": AGENT_LEVELS})


@bp.post("/agent/location")
def api_agent_update_location():
    """Persist the agent's current city from the FE."""
    agent = Agent.query.order_by(Agent.id.asc()).first()
    if not agent:
        return jsonify({"error": "Agent not found"}), 404

    payload = request.get_json(silent=True) or {}
    city_id = payload.get("city_id")
    if not city_id:
        return jsonify({"error": "city_id_required"}), 400

    city = City.query.get(city_id)
    if not city:
        return jsonify({"error": "city_not_found"}), 404

    clock = _extract_game_clock(payload)

    previous_city_id = agent.current_city_id
    agent.last_city_id = previous_city_id
    agent.current_city_id = city.id
    agent.current_city = city

    travel_log = AgentTravelLog(
        agent_id=agent.id,
        from_city_id=previous_city_id,
        to_city_id=city.id,
        action="travel",
        game_minutes=clock["minutes"],
        game_week=clock["week_index"],
        game_day_index=clock["day_index"],
        game_day_label=clock["day_label"],
        game_time_label=clock["time_label"],
    )

    db.session.add(travel_log)
    db.session.commit()
    db.session.refresh(travel_log)

    return jsonify({"agent": _serialize_agent(agent), "travel_log": travel_log.serialize()})


@bp.post("/agent/reset")
def api_agent_reset():
    """Reset agent stats so a new playthrough can start from level 1."""
    agent = Agent.query.order_by(Agent.id.asc()).first()
    if not agent:
        return jsonify({"error": "Agent not found"}), 404

    base_cfg = _level_cfg(1) or {"energy_max": 0}
    energy_max = base_cfg.get("energy_max", 0)

    agent.level = 1
    agent.xp = 0
    agent.energy_max = energy_max
    agent.energy_current = 0
    agent.current_city_id = None
    agent.current_city = None
    agent.last_city_id = None
    agent.last_city = None
    agent.total_trips = 0
    agent.total_cleaned_cities = 0
    agent.total_failed_cities = 0
    agent.data_current = 0
    agent.material_current = 0
    agent.credits = 0
    agent.infection_level = 0

    db.session.commit()
    return jsonify({"agent": _serialize_agent(agent)})


@bp.get("/agent/travel-log")
def api_agent_travel_log():
    """Return the latest logged travels for the agent."""
    agent = Agent.query.order_by(Agent.id.asc()).first()
    if not agent:
        return jsonify({"logs": []})

    limit = request.args.get("limit", default=25, type=int)
    if limit is None or limit <= 0:
        limit = 25
    limit = min(limit, 200)

    logs = (
        AgentTravelLog.query.filter_by(agent_id=agent.id)
        .order_by(AgentTravelLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return jsonify({"logs": [log.serialize() for log in logs]})
