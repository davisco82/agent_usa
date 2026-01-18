# services/task_service.py
#
# Jednoduchý quest engine:
# - načítá templaty z AGENT_TASK_TEMPLATES
# - drží stav v ActiveTask
# - zpracovává triggery a odměny

from __future__ import annotations

from typing import Optional, Dict, Any, List
import re
import random
from app.extensions import db
from app.models.active_task import ActiveTask
from app.models.agent import Agent
from app.models.city import City
from app.domain.agent.task_config import (
    AGENT_TASK_TEMPLATES,
    resolve_template_for_agent,
    build_template_from_placeholders,
)


# -------------------------------------------------------------------
# Pomocné funkce pro práci s templaty a placeholdery
# -------------------------------------------------------------------


def _agent_region_code(agent: Agent | None) -> Optional[str]:
    if not agent or not agent.current_city or not agent.current_city.region:
        return None
    return agent.current_city.region.code


def get_task_template(task_id: str) -> Optional[Dict[str, Any]]:
    """Najde task template podle id v AGENT_TASK_TEMPLATES."""
    for t in AGENT_TASK_TEMPLATES:
        if t.get("id") == task_id:
            return t
    return None


def resolve_placeholders_in_value(value: Any, placeholders: Dict[str, Any]) -> Any:
    """
    Pokud je value string a obsahuje {placeholder},
    použije .format(**placeholders). Jinak vrátí původní hodnotu.
    """
    if isinstance(value, str) and "{" in value and "}" in value:
        try:
            return value.format(**placeholders)
        except Exception:
            # Když se nepodaří, necháme původní hodnotu (radši fail-safe)
            return value
    return value


def extract_total_xp_from_reward(reward_text: str) -> int:
    """
    Z textu typu '80 XP, +40 DATA' vytáhne první číslo před 'XP'.
    Klidně si to časem uprav/rozšíř.
    """
    if not reward_text:
        return 0
    matches = re.findall(r"(\d+)\s*XP", reward_text)
    if not matches:
        return 0
    return int(matches[0])


# -------------------------------------------------------------------
# Hlavní API – přidělení úkolu, aktivní úkol, triggery, odměny
# -------------------------------------------------------------------


def assign_task(
    agent: Agent,
    task_id: str,
    placeholders: Optional[Dict[str, Any]] = None,
    rng: Optional[random.Random] = None,
) -> ActiveTask:
    """
    Přiřadí agentovi nový úkol podle templatu.
    placeholders: např. {"rook_city": "Denver", "target_city": "Dallas"}
    """
    template = get_task_template(task_id)
    if not template:
        raise ValueError(f"Task template '{task_id}' not found")

    region_code = _agent_region_code(agent)
    if placeholders is None and task_id == "mission-equipment-02":
        prior = ActiveTask.query.filter_by(agent_id=agent.id, task_id="mission-equipment-01").first()
        prior_placeholders = (prior.objective_state or {}).get("placeholders") if prior else None
        if isinstance(prior_placeholders, dict):
            carried = {
                key: prior_placeholders.get(key)
                for key in ("hq_city", "market_lead_city")
                if prior_placeholders.get(key)
            }
            if carried:
                placeholders = carried

    if placeholders is None:
        _, resolved_placeholders = resolve_template_for_agent(
            template,
            agent_region_code=region_code,
            agent_city=agent.current_city,
            hq_city=agent.hq_city,
            rng=rng or random,
        )
        placeholders = resolved_placeholders

    if isinstance(placeholders, dict) and placeholders.get("hq_city") and not agent.hq_city_id:
        hq_name = placeholders.get("hq_city")
        hq_city = City.query.filter(City.name.ilike(str(hq_name))).first()
        if hq_city:
            agent.hq_city_id = hq_city.id
            agent.hq_city = hq_city

    # připrav stav objektivů
    objectives = template.get("objectives", [])
    completed_flags = [False] * len(objectives)

    objective_state = {
        "placeholders": placeholders,
        "completed": completed_flags,
    }

    active = ActiveTask(
        agent_id=agent.id,
        task_id=task_id,
        current_objective=0,
        status="active",
        progress=0.0,
        reward_claimed=False,
        objective_state=objective_state,
    )

    db.session.add(active)
    db.session.commit()
    return active


def get_active_task(agent: Agent, task_id: Optional[str] = None) -> Optional[ActiveTask]:
    """
    Vrátí aktivní úkol agenta. Můžeš filtrovat konkrétní task_id,
    nebo vrátí první aktivní úkol.
    """
    query = ActiveTask.query.filter_by(agent_id=agent.id, status="active")
    if task_id:
        query = query.filter_by(task_id=task_id)
    return query.first()


def _update_progress(active: ActiveTask, template: Dict[str, Any]) -> None:
    """Přepočítá progress podle počtu splněných objektivů."""
    objectives = template.get("objectives", [])
    completed_flags: List[bool] = active.objective_state.get("completed", [])
    if not objectives:
        active.progress = 1.0
        return
    # zkrátíme / doplníme bezpečně
    completed_flags = completed_flags[: len(objectives)]
    completed_count = sum(1 for c in completed_flags if c)
    active.progress = completed_count / len(objectives)


def process_trigger(
    agent: Agent,
    trigger_type: str,
    trigger_data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Hlavní vstup pro hru:
    - agent udělá akci (visit_city, buy_item, use_item, ...),
    - FE/BE zavolá tuto funkci,
    - ta vyhodnotí, jestli se tím splnil aktuální objective.
    """
    active = get_active_task(agent)
    if not active:
        return {"processed": False, "reason": "no_active_task"}

    template = get_task_template(active.task_id)
    if not template:
        return {"processed": False, "reason": "template_not_found"}

    objectives = template.get("objectives", [])
    triggers = template.get("objective_triggers", [])

    if not objectives or not triggers:
        return {"processed": False, "reason": "no_objectives_defined"}

    current_step = active.current_objective
    if current_step >= len(triggers):
        # všechno hotovo, ale ještě neoznačeno?
        active.status = "completed"
        _update_progress(active, template)
        db.session.commit()
        return {
            "processed": False,
            "reason": "task_already_completed",
            "task_completed": True,
        }

    expected_trigger = triggers[current_step]
    expected_type = expected_trigger.get("type")

    if expected_type != trigger_type:
        # jiný typ triggeru, než čeká aktuální krok
        return {"processed": False, "reason": "wrong_trigger_type"}

    placeholders = active.objective_state.get("placeholders", {})

    # porovnání ostatních parametrů (city_name, item, npc, module, ...)
    for key, expected_value in expected_trigger.items():
        if key == "type":
            continue

        resolved_expected = resolve_placeholders_in_value(expected_value, placeholders)
        actual = trigger_data.get(key)

        # Pokud expected není None a máme actual, musí se rovnat
        if resolved_expected is not None and actual is not None:
            if str(actual) != str(resolved_expected):
                return {
                    "processed": False,
                    "reason": f"value_mismatch_{key}",
                    "expected": resolved_expected,
                    "actual": actual,
                }

    # >>> Pokud jsme došli sem, trigger sedí a objective se splnil <<<
    state = dict(active.objective_state or {})
    completed_flags: List[bool] = list(state.get("completed") or [])
    # zajistíme, že pole má správnou délku
    if len(completed_flags) < len(objectives):
        completed_flags = (completed_flags + [False] * len(objectives))[: len(objectives)]

    completed_flags[current_step] = True
    state["completed"] = completed_flags
    active.objective_state = state

    # posuneme current objective na další
    active.current_objective = current_step + 1

    # aktualizujeme progress
    _update_progress(active, template)

    # pokud jsme na konci, označíme úkol za completed
    task_completed = active.current_objective >= len(objectives)
    if task_completed:
        active.status = "completed"

    db.session.commit()

    return {
        "processed": True,
        "objective_completed": True,
        "task_completed": task_completed,
        "current_objective": active.current_objective,
        "progress": active.progress,
    }


def serialize_active_task(active_task: ActiveTask) -> Optional[Dict[str, Any]]:
    """Převede ActiveTask + šablonu na payload pro FE."""
    template = get_task_template(active_task.task_id)
    if not template:
        return None

    placeholders = active_task.objective_state.get("placeholders", {}) if active_task.objective_state else {}
    resolved = build_template_from_placeholders(template, placeholders)

    objectives = resolved.get("objectives") or template.get("objectives") or []
    completed_flags = list((active_task.objective_state or {}).get("completed") or [])
    if len(completed_flags) < len(objectives):
        completed_flags.extend([False] * (len(objectives) - len(completed_flags)))
    elif len(completed_flags) > len(objectives):
        completed_flags = completed_flags[: len(objectives)]

    payload = dict(resolved)
    payload["id"] = template.get("id")
    payload["completed_objectives"] = completed_flags
    payload["progress"] = active_task.progress
    payload["status"] = active_task.status
    payload["reward_claimed"] = active_task.reward_claimed
    return payload


def complete_objective_step(agent: Agent, task_id: str, objective_index: int) -> Dict[str, Any]:
    """Označí konkrétní objektiv za splněný a případně udělí odměnu."""
    active = ActiveTask.query.filter_by(agent_id=agent.id, task_id=task_id).first()
    if not active:
        return {"ok": False, "reason": "task_not_found"}

    template = get_task_template(task_id)
    if not template:
        return {"ok": False, "reason": "template_not_found"}

    objectives = template.get("objectives") or []
    if objective_index < 0 or objective_index >= len(objectives):
        return {"ok": False, "reason": "objective_out_of_range"}

    state = dict(active.objective_state or {})
    completed_flags = list(state.get("completed") or [])
    if len(completed_flags) < len(objectives):
        completed_flags.extend([False] * (len(objectives) - len(completed_flags)))
    elif len(completed_flags) > len(objectives):
        completed_flags = completed_flags[: len(objectives)]

    if completed_flags[objective_index]:
        payload = serialize_active_task(active)
        return {"ok": True, "task": payload, "xp_awarded": 0}

    completed_flags[objective_index] = True
    state["completed"] = completed_flags
    active.objective_state = state
    if active.current_objective <= objective_index:
        active.current_objective = objective_index + 1

    _update_progress(active, template)

    all_completed = all(completed_flags)
    if all_completed:
        active.status = "completed"

    trigger = (template.get("objective_triggers") or [None] * len(objectives))[objective_index]
    money_rewards = template.get("objective_rewards_money") or []
    money_awarded = 0
    if objective_index < len(money_rewards):
        try:
            money_awarded = int(money_rewards[objective_index] or 0)
        except (TypeError, ValueError):
            money_awarded = 0
    if money_awarded:
        inventory = Agent.normalize_inventory(agent.inventory)
        inventory["money"] = (inventory.get("money") or 0) + money_awarded
        agent.inventory = inventory

    if isinstance(trigger, dict) and trigger.get("type") == "buy_item" and trigger.get("item") == "energy_generator":
        inventory = Agent.normalize_inventory(agent.inventory)
        inventory["money"] = max(0, (inventory.get("money") or 0) - 500)
        inventory["energy_generator"] = max(1, inventory.get("energy_generator") or 0)
        agent.inventory = inventory

    db.session.commit()

    payload = serialize_active_task(active)
    response = {"ok": True, "task": payload}
    if money_awarded:
        response["money_awarded"] = money_awarded
    return response


def _active_tasks_for_agent(agent: Agent) -> List[ActiveTask]:
    return ActiveTask.query.filter_by(agent_id=agent.id).order_by(ActiveTask.created_at.asc()).all()


def ensure_task_pipeline(agent: Agent) -> List[ActiveTask]:
    tasks = _active_tasks_for_agent(agent)
    has_pending = any(
        task.status == "active"
        or (task.status == "completed" and not task.reward_claimed)
        for task in tasks
    )
    if has_pending:
        return tasks

    existing_ids = {task.task_id for task in tasks}
    for template in AGENT_TASK_TEMPLATES:
        task_id = template.get("id")
        if task_id not in existing_ids:
            assign_task(agent, task_id)
            break

    return _active_tasks_for_agent(agent)


def reset_task_pipeline(agent: Agent) -> List[ActiveTask]:
    """
    Smaže všechny aktivní/ukončené úkoly agenta a vytvoří nové podle pipeline.
    Využije současnou pozici agenta (např. po restartu hry) pro nové placeholdery.
    """
    existing = ActiveTask.query.filter_by(agent_id=agent.id).all()
    for task in existing:
        db.session.delete(task)
    db.session.commit()
    return ensure_task_pipeline(agent)


def list_task_payloads(agent: Agent) -> List[Dict[str, Any]]:
    tasks = ensure_task_pipeline(agent)
    payloads: List[Dict[str, Any]] = []
    for active in tasks:
        if active.status == "completed" and active.reward_claimed:
            continue
        if active.status not in ("active", "completed"):
            continue
        payload = serialize_active_task(active)
        if payload:
            payloads.append(payload)
    return payloads


def complete_task(active_task: ActiveTask) -> None:
    """
    Ruční označení úkolu za completed (většinou to není potřeba,
    protože se to řeší v process_trigger).
    """
    template = get_task_template(active_task.task_id) or {}
    active_task.status = "completed"
    _update_progress(active_task, template)
    db.session.commit()


def claim_reward(agent: Agent, task_id: str) -> Dict[str, Any]:
    """
    Přidělí odměnu z templatu agentovi, pokud úkol je completed a
    ještě nebyla přidělena.
    """
    active = ActiveTask.query.filter_by(
        agent_id=agent.id,
        task_id=task_id,
    ).first()

    if not active:
        return {"ok": False, "reason": "task_not_found"}

    if active.status != "completed":
        return {"ok": False, "reason": "task_not_completed"}

    if active.reward_claimed:
        return {"ok": False, "reason": "reward_already_claimed"}

    template = get_task_template(task_id)
    if not template:
        return {"ok": False, "reason": "template_not_found"}

    reward_text = template.get("reward", "")  # např. "80 XP, +40 DATA"
    xp = extract_total_xp_from_reward(reward_text)
    agent.gain_xp(xp)

    # velmi jednoduché parsování MATERIAL / DATA / ENERGY podle stringu
    # můžeš si to nahradit vlastní logikou
    if "+40 DATA" in reward_text:
        agent.data_current = (agent.data_current or 0) + 40
    if "+10 MATERIAL" in reward_text:
        agent.material_current = (agent.material_current or 0) + 10
    if "+10 ENERGY" in reward_text:
        agent.energy_current = (agent.energy_current or 0) + 10

    active.reward_claimed = True
    active.status = "rewarded"

    db.session.commit()

    payload = serialize_active_task(active)
    return {"ok": True, "task": payload, "xp_awarded": xp}


def unlock_next_tasks(agent: Agent, completed_task_id: str) -> List[ActiveTask]:
    """
    Pokud v templatu existuje 'next_tasks': ["..."],
    přiřadí agentovi navazující úkoly.
    """
    template = get_task_template(completed_task_id)
    if not template:
        return []

    next_ids = template.get("next_tasks", [])
    created: List[ActiveTask] = []

    for next_id in next_ids:
        created.append(assign_task(agent, next_id))

    return created


def _normalize_completed_flags(active_task: ActiveTask, template: Dict[str, Any]) -> List[bool]:
    objectives = template.get("objectives") or []
    completed_flags = list((active_task.objective_state or {}).get("completed") or [])
    if len(completed_flags) < len(objectives):
        completed_flags.extend([False] * (len(objectives) - len(completed_flags)))
    elif len(completed_flags) > len(objectives):
        completed_flags = completed_flags[: len(objectives)]
    return completed_flags


def _format_story_value(value: Any, placeholders: Dict[str, Any]) -> Any:
    if isinstance(value, dict):
        return {key: _format_story_value(val, placeholders) for key, val in value.items()}
    if isinstance(value, list):
        return [_format_story_value(item, placeholders) for item in value]
    return resolve_placeholders_in_value(value, placeholders)


def _build_story_dialogs_for_task(
    agent: Agent | None,
    active_task: ActiveTask,
    template: Dict[str, Any],
) -> List[Dict[str, Any]]:
    story_entries = template.get("story_dialogs") or []
    if not story_entries:
        return []

    placeholders = (active_task.objective_state or {}).get("placeholders") or {}
    completed_flags = _normalize_completed_flags(active_task, template)

    dialogs: List[Dict[str, Any]] = []
    for entry in story_entries:
        panel = entry.get("panel")
        if not panel:
            continue

        objective_index = entry.get("objective_index")
        if objective_index is not None:
            if objective_index < len(completed_flags) and completed_flags[objective_index]:
                continue

        requires_completed = entry.get("requires_completed_indices") or []
        requirement_failed = False
        for required_idx in requires_completed:
            if required_idx >= len(completed_flags) or not completed_flags[required_idx]:
                requirement_failed = True
                break
        if requirement_failed:
            continue

        required_city_placeholder = entry.get("requires_agent_in_city_placeholder")
        if required_city_placeholder:
            required_city = placeholders.get(required_city_placeholder)
            if (
                agent
                and required_city
                and agent.current_city
                and agent.current_city.name
                and agent.current_city.name.lower() != required_city.lower()
            ):
                continue

        payload: Dict[str, Any] = {
            "panel": panel,
            "task_id": active_task.task_id,
            "objective_index": objective_index,
        }

        for key in ("cache_key", "title", "body", "confirm_label", "button_label"):
            if key in entry:
                payload[key] = _format_story_value(entry[key], placeholders)

        character_data = entry.get("character")
        if character_data:
            payload["character"] = _format_story_value(character_data, placeholders)

        dialogs.append(payload)

    return dialogs


def get_pending_story_dialogs(agent: Agent | None) -> List[Dict[str, Any]]:
    """Vrátí seznam dialogů, které má FE zobrazit (např. brífing v laboratoři)."""
    if not agent:
        return []

    dialogs: List[Dict[str, Any]] = []
    for active in ensure_task_pipeline(agent):
        template = get_task_template(active.task_id)
        if not template:
            continue
        dialogs.extend(_build_story_dialogs_for_task(agent, active, template))

    return dialogs
