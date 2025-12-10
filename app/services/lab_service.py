# services/lab_service.py

from __future__ import annotations

from typing import Dict, List

from app.models.agent import Agent
from app.models.lab_action import LabAction, LabActionState


CATEGORY_ORDER = {
    "info": 0,
    "analysis": 1,
    "counter": 2,
}


def _fog_summary(agent: Agent | None) -> dict:
    if not agent:
        return {
            "percent": 0,
            "label": "Bez dat",
            "description": "Agent není aktivní, laboratorní senzor je offline.",
        }

    level = max(0, min(agent.infection_level or 0, 100))
    if level < 20:
        label = "Stabilní"
        description = "Mlha je pod kontrolou."
    elif level < 50:
        label = "Zvýšená"
        description = "Pozoruj šíření a připravte filtry."
    elif level < 75:
        label = "Nebezpečná"
        description = "Doporučeno nasadit ochranné akce."
    else:
        label = "Kritická"
        description = "Okamžitě proveď zásah laboratoře."

    return {
        "percent": level,
        "label": label,
        "description": description,
    }


def _build_locked_reason(agent: Agent | None, action: LabAction, state: LabActionState | None) -> tuple[bool, str | None]:
    if state and state.is_disabled:
        return False, "Dočasně deaktivováno"

    if state and state.is_unlocked:
        return True, None

    if not agent:
        return False, "Agent není aktivní"

    reasons: List[str] = []

    if action.unlock_level and agent.level < action.unlock_level:
        reasons.append(f"Level {action.unlock_level}")

    if action.unlock_cleaned_cities and agent.total_cleaned_cities < action.unlock_cleaned_cities:
        reasons.append(f"Vyčisti {action.unlock_cleaned_cities} měst")

    requirements: Dict[str, int] = action.unlock_requirements or {}

    min_data = requirements.get("min_data")
    if min_data and agent.data_current < min_data:
        reasons.append(f"Data {agent.data_current}/{min_data}")

    min_material = requirements.get("min_material")
    if min_material and agent.material_current < min_material:
        reasons.append(f"Materiál {agent.material_current}/{min_material}")

    min_infection = requirements.get("max_infection")
    if min_infection is not None and agent.infection_level > min_infection:
        reasons.append("Sniž infekci agenta")

    unlocked = not reasons
    locked_reason = None if unlocked else " • ".join(reasons)
    return unlocked, locked_reason


def build_lab_overview(agent: Agent | None) -> dict:
    actions = LabAction.query.order_by(LabAction.category.asc(), LabAction.id.asc()).all()
    state_by_action: Dict[int, LabActionState] = {}

    if agent and actions:
        states = (
            LabActionState.query.filter(LabActionState.agent_id == agent.id)
            .filter(LabActionState.lab_action_id.in_([action.id for action in actions]))
            .all()
        )
        state_by_action = {state.lab_action_id: state for state in states}

    action_payloads = []
    for action in actions:
        state = state_by_action.get(action.id)
        is_unlocked, locked_reason = _build_locked_reason(agent, action, state)
        action_payloads.append(
            {
                "code": action.code,
                "name": action.name,
                "category": action.category,
                "description": action.description,
                "unlock_level": action.unlock_level,
                "unlock_cleaned_cities": action.unlock_cleaned_cities,
                "requirements": action.unlock_requirements or {},
                "energy_cost": action.energy_cost,
                "data_cost": action.data_cost,
                "material_cost": action.material_cost,
                "cooldown_minutes": action.cooldown_minutes,
                "is_unlocked": is_unlocked,
                "locked_reason": locked_reason,
                "last_used_at": state.last_used_at.isoformat() if state and state.last_used_at else None,
                "uses_count": state.uses_count if state else 0,
            }
        )

    action_payloads.sort(key=lambda payload: (CATEGORY_ORDER.get(payload["category"], 99), payload["name"]))

    return {
        "fog": _fog_summary(agent),
        "agent": {
            "level": agent.level if agent else None,
            "total_cleaned_cities": agent.total_cleaned_cities if agent else None,
            "data_current": agent.data_current if agent else None,
            "material_current": agent.material_current if agent else None,
        },
        "actions": action_payloads,
    }
