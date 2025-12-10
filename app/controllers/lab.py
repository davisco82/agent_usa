from __future__ import annotations

from flask import Blueprint, jsonify

from app.models.agent import Agent
from app.services.lab_service import build_lab_overview

bp = Blueprint("lab", __name__, url_prefix="/api/lab")


@bp.get("/actions")
def api_lab_actions():
    agent = Agent.query.order_by(Agent.id.asc()).first()
    overview = build_lab_overview(agent)
    return jsonify(overview)
