from __future__ import annotations

from typing import Any, Dict

from flask import Blueprint, jsonify, request

from app.domain.agent.level_config import AGENT_LEVELS
from app.extensions import db
from app.models.agent import Agent
from app.models.city import City

bp = Blueprint("agent", __name__, url_prefix="/api")


def _level_cfg(level: int) -> Dict[str, Any] | None:
    for cfg in AGENT_LEVELS:
        if cfg["level"] == level:
            return cfg
    return None


def _serialize_agent(agent: Agent | None) -> Dict[str, Any]:
    """Return a consistent payload for the current agent and their location."""
    if not agent:
        fallback_cfg = _level_cfg(1) or {"energy_max": 5}
        energy_max = fallback_cfg.get("energy_max", 5)
        return {
            "level": 1,
            "xp": 0,
            "energy_current": energy_max,
            "energy_max": energy_max,
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

    agent.last_city_id = agent.current_city_id
    agent.current_city_id = city.id
    agent.current_city = city

    db.session.commit()

    return jsonify({"agent": _serialize_agent(agent)})
