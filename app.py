# app.py
from __future__ import annotations

import random

from flask import Flask, jsonify, render_template, request
from flask_migrate import Migrate
from models import db
from models.train_line import TrainLine
from models.city import City
from models.agent import Agent
from models.agent_task_progress import AgentTaskProgress
from game.agent.level_config import AGENT_LEVELS
from game.agent.task_config import get_agent_tasks
from seeds.cities_seed import register_city_seed_commands
from seeds.trainlines_seed import register_trainlines_commands
from seeds.lab_seed import register_lab_seed_commands
from services.timetable_service import (
    compute_line_distance_miles,
    compute_next_departures,
    compute_travel_minutes,
)
from services.lab_service import build_lab_overview


def _agent_region_code(agent: Agent | None) -> str | None:
    if not agent or not agent.current_city or not agent.current_city.region:
        return None
    return agent.current_city.region.code


def _resolve_tasks_for_agent(agent: Agent | None) -> list[dict]:
    region_code = _agent_region_code(agent)
    rng_seed = agent.id if agent and agent.id is not None else 0
    return get_agent_tasks(region_code, rng=random.Random(rng_seed))


def _inject_progress(tasks: list[dict], agent: Agent | None) -> list[dict]:
    if not tasks:
        return tasks

    objective_counts = {
        task["id"]: len(task.get("objectives") or [])
        for task in tasks
    }

    progress_by_task = {}
    if agent:
        task_ids = [task["id"] for task in tasks]
        if task_ids:
            rows = (
                AgentTaskProgress.query.filter(AgentTaskProgress.agent_id == agent.id)
                .filter(AgentTaskProgress.task_id.in_(task_ids))
                .all()
            )
            for row in rows:
                progress_by_task[row.task_id] = row

    for task in tasks:
        count = objective_counts.get(task["id"], 0)
        progress_row = progress_by_task.get(task["id"])
        if progress_row:
            state = progress_row.ensure_state_length(count)
        else:
            state = [False] * count
        completed = sum(1 for flag in state if flag)
        task["completed_objectives"] = state
        task["progress"] = (completed / count) if count else task.get("progress", 0.0) or 0.0

    return tasks


def create_app():
    app = Flask(__name__)
    app.config.from_object("config.Config")

    db.init_app(app)
    Migrate(app, db)

    # CLI příkazy (seed)
    register_city_seed_commands(app)
    register_trainlines_commands(app)
    register_lab_seed_commands(app)

   # ----------------- ROUTES -----------------

    @app.route("/")
    def index():
        # načte templates/index.html
        return render_template("index.html")
    
    @app.get("/api/cities")
    def api_cities():
        """Vrátí všechna města jako JSON pro canvas."""
        cities = City.query.all()

        data = []
        for c in cities:
            data.append({
                "id": c.id,
                "name": c.name,
                "region": c.region.code if c.region else None,
                "importance": c.importance,
                "state": c.state,
                "state_shortcut": c.state_shortcut,
                "description": c.description,
                "lat": c.lat,
                "lon": c.lon,
                "px": c.px,
                "py": c.py,
                "grid_x": c.grid_x,
                "grid_y": c.grid_y,
                "population": c.population,
            })

        return jsonify(data)

    @app.get("/api/lab/actions")
    def api_lab_actions():
        agent = Agent.query.order_by(Agent.id.asc()).first()
        overview = build_lab_overview(agent)
        return jsonify(overview)

    
    @app.get("/api/trainlines")
    def api_trainlines():
        """Vrátí všechny vlakové linky jako JSON pro canvas."""
        lines = TrainLine.query.all()

        data = []
        for line in lines:
            from_city = line.from_city   # relationship z modelu TrainLine
            to_city = line.to_city

            data.append({
                "from": {
                    "id": from_city.id,
                    "name": from_city.name,
                    "px": from_city.px,
                    "py": from_city.py,
                },
                "to": {
                    "id": to_city.id,
                    "name": to_city.name,
                    "px": to_city.px,
                    "py": to_city.py,
                },
                "line_type": line.line_type,
                "frequency_minutes": line.frequency_minutes,
                "distance_units": compute_line_distance_miles(line),
            })

        return jsonify(data)

    @app.get("/api/timetable")
    def api_timetable():
        city_id = request.args.get("city_id", type=int)
        current_minutes = request.args.get("minutes", type=int)
        limit = request.args.get("limit", default=30, type=int)

        if city_id is None or current_minutes is None:
            return jsonify({"error": "city_id and minutes are required"}), 400
        if limit is None or limit <= 0:
            limit = 30
        limit = min(limit, 100)

        city = City.query.get_or_404(city_id)

        departures = compute_next_departures(city, current_minutes, limit=limit)

        def to_dict(d):
            line = d["line"]

            # 👇 vezmu travel_minutes, a když tam není nebo je None,
            # dopočítám ho podle line + importance obou měst
            travel = d.get("travel_minutes")
            if travel is None:
                travel = compute_travel_minutes(
                    line,
                    line.from_city.importance,
                    line.to_city.importance,
                    distance_miles=distance_miles if distance_miles is not None else None,
                )

            distance_miles = d.get("distance_units")

            return {
                "departure_minutes": d["departure_minutes"],
                "from_city": {
                    "id": d["from_city"].id,
                    "name": d["from_city"].name,
                },
                "to_city": {
                    "id": d["to_city"].id,
                    "name": d["to_city"].name,
                },
                "line_type": line.line_type,
                "frequency_minutes": line.frequency_minutes,
                "distance_units": distance_miles if distance_miles is not None else compute_line_distance_miles(line),
                "travel_minutes": travel,
            }

        return jsonify([to_dict(dep) for dep in departures])

    @app.get("/api/agent")
    def api_agent():
        """Vrátí aktuálního agenta + konfiguraci levelů pro UI."""
        agent = Agent.query.order_by(Agent.id.asc()).first()

        def level_cfg(level):
            for cfg in AGENT_LEVELS:
                if cfg["level"] == level:
                    return cfg
            return None

        agent_payload = None
        if agent:
            cfg = level_cfg(agent.level) or level_cfg(1) or {"energy_max": agent.energy_max}
            energy_max = cfg.get("energy_max", agent.energy_max)
            agent_payload = {
                "level": agent.level,
                "xp": agent.xp,
                "energy_current": min(agent.energy_current, energy_max),
                "energy_max": energy_max,
            }
        else:
            # fallback, pokud v DB není agent
            fallback_cfg = level_cfg(1) or {"energy_max": 5}
            agent_payload = {
                "level": 1,
                "xp": 0,
                "energy_current": fallback_cfg.get("energy_max", 5),
                "energy_max": fallback_cfg.get("energy_max", 5),
            }

        return jsonify({
            "agent": agent_payload,
            "levels": AGENT_LEVELS,
        })

    @app.get("/api/tasks")
    def api_tasks():
        """Vrátí seznam konfigurovaných úkolů agenta (s dynamickými lokacemi)."""
        agent = Agent.query.order_by(Agent.id.asc()).first()
        tasks = _resolve_tasks_for_agent(agent)
        tasks = _inject_progress(tasks, agent)
        return jsonify({"tasks": tasks})

    @app.post("/api/tasks/<task_id>/objectives/<int:objective_index>/complete")
    def api_complete_task_objective(task_id: str, objective_index: int):
        """Označí konkrétní krok úkolu jako splněný + vrátí aktualizaci."""
        agent = Agent.query.order_by(Agent.id.asc()).first()
        if not agent:
            return jsonify({"error": "Agent not found"}), 404

        tasks = _resolve_tasks_for_agent(agent)
        task_payload = next((task for task in tasks if task["id"] == task_id), None)
        if not task_payload:
            return jsonify({"error": "Task not found"}), 404

        objectives = task_payload.get("objectives") or []
        if objective_index < 0 or objective_index >= len(objectives):
            return jsonify({"error": "Objective index out of range"}), 400

        progress_row = (
            AgentTaskProgress.query.filter_by(agent_id=agent.id, task_id=task_id).first()
        )
        if not progress_row:
            progress_row = AgentTaskProgress(
                agent_id=agent.id,
                task_id=task_id,
                objectives_state=[False] * len(objectives),
            )
            db.session.add(progress_row)

        state = progress_row.ensure_state_length(len(objectives))
        already_completed = bool(state[objective_index])

        xp_rewards = task_payload.get("objective_rewards") or []
        xp_to_grant = xp_rewards[objective_index] if objective_index < len(xp_rewards) else 0

        if not already_completed:
            state[objective_index] = True
            progress_row.objectives_state = state
            progress_row.xp_earned = (progress_row.xp_earned or 0) + xp_to_grant

        completed = sum(1 for flag in state if flag)
        progress_value = (completed / len(objectives)) if objectives else 0.0
        task_payload["completed_objectives"] = state
        task_payload["progress"] = progress_value

        db.session.commit()

        return jsonify({
            "task": task_payload,
            "xp_awarded": xp_to_grant if not already_completed else 0,
            "already_completed": already_completed,
        })


    return app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
