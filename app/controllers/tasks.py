from __future__ import annotations

from flask import Blueprint, jsonify

from app.models.agent import Agent
from app.services.task_service import (
    claim_reward,
    complete_objective_step,
    ensure_task_pipeline,
    get_pending_story_dialogs,
    list_task_payloads,
    reset_task_pipeline,
)

bp = Blueprint("tasks", __name__, url_prefix="/api/tasks")


@bp.get("")
@bp.get("/")
def api_tasks():
    """Return active/completed tasks for the main quest pipeline."""
    agent = Agent.query.order_by(Agent.id.asc()).first()
    if not agent:
        return jsonify({"tasks": []})
    tasks = list_task_payloads(agent)
    return jsonify({"tasks": tasks})


@bp.get("/story-dialogs")
def api_story_dialogs():
    """Return dialogs that should appear in contextual panels (lab, HQ, ...)."""
    agent = Agent.query.order_by(Agent.id.asc()).first()
    if not agent:
        return jsonify({"dialogs": []})
    dialogs = get_pending_story_dialogs(agent)
    return jsonify({"dialogs": dialogs})


@bp.post("/<task_id>/objectives/<int:objective_index>/complete")
def api_complete_task_objective(task_id: str, objective_index: int):
    """Mark an objective as completed and grant rewards."""
    agent = Agent.query.order_by(Agent.id.asc()).first()
    if not agent:
        return jsonify({"error": "Agent not found"}), 404

    result = complete_objective_step(agent, task_id, objective_index)
    if not result.get("ok"):
        return jsonify({"error": result.get("reason", "unknown")}), 400

    ensure_task_pipeline(agent)

    response = {"task": result.get("task")}
    if result.get("xp_awarded"):
        response["xp_awarded"] = result["xp_awarded"]
    return jsonify(response)


@bp.post("/<task_id>/claim")
def api_claim_task_reward(task_id: str):
    """Claim reward for a completed task."""
    agent = Agent.query.order_by(Agent.id.asc()).first()
    if not agent:
        return jsonify({"error": "Agent not found"}), 404

    result = claim_reward(agent, task_id)
    if not result.get("ok"):
        return jsonify({"error": result.get("reason", "unknown")}), 400

    ensure_task_pipeline(agent)

    response = {"task": result.get("task")}
    if result.get("xp_awarded"):
        response["xp_awarded"] = result["xp_awarded"]
    return jsonify(response)


@bp.post("/reset")
def api_reset_tasks():
    """Reset the task pipeline and enqueue a fresh set."""
    agent = Agent.query.order_by(Agent.id.asc()).first()
    if not agent:
        return jsonify({"error": "Agent not found"}), 404

    reset_task_pipeline(agent)
    tasks = list_task_payloads(agent)
    return jsonify({"tasks": tasks})
