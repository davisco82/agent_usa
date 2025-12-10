# app.py
from __future__ import annotations

from flask import Flask, jsonify, render_template, request
from typing import Any, Dict
from flask_migrate import Migrate
from models import db
from models.train_line import TrainLine
from models.city import City
from models.agent import Agent
from game.agent.level_config import AGENT_LEVELS
from services.task_service import (
    list_task_payloads,
    complete_objective_step,
    ensure_task_pipeline,
    reset_task_pipeline,
)
from seeds.cities_seed import register_city_seed_commands
from seeds.trainlines_seed import register_trainlines_commands
from seeds.lab_seed import register_lab_seed_commands
from seeds.agent_seed import register_agent_seed_commands
from services.timetable_service import (
    compute_line_distance_miles,
    compute_next_departures,
    compute_travel_minutes,
)
from services.lab_service import build_lab_overview


def create_app():
    app = Flask(__name__)
    app.config.from_object("config.Config")

    db.init_app(app)
    Migrate(app, db)

    # CLI příkazy (seed)
    register_city_seed_commands(app)
    register_trainlines_commands(app)
    register_lab_seed_commands(app)
    register_agent_seed_commands(app)

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

    def level_cfg(level):
        for cfg in AGENT_LEVELS:
            if cfg["level"] == level:
                return cfg
        return None

    def serialize_agent(agent: Agent | None) -> Dict[str, Any]:
        """Sjednocené sestavení payloadu agenta včetně aktuální lokace."""
        if not agent:
            fallback_cfg = level_cfg(1) or {"energy_max": 5}
            return {
                "level": 1,
                "xp": 0,
                "energy_current": fallback_cfg.get("energy_max", 5),
                "energy_max": fallback_cfg.get("energy_max", 5),
                "current_city_id": None,
                "current_city_name": None,
            }

        cfg = level_cfg(agent.level) or level_cfg(1) or {"energy_max": agent.energy_max}
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

    @app.get("/api/agent")
    def api_agent():
        """Vrátí aktuálního agenta + konfiguraci levelů pro UI."""
        agent = Agent.query.order_by(Agent.id.asc()).first()

        return jsonify({
            "agent": serialize_agent(agent),
            "levels": AGENT_LEVELS,
        })

    @app.post("/api/agent/location")
    def api_agent_update_location():
        """Uloží aktuální město agenta podle FE."""
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

        return jsonify({"agent": serialize_agent(agent)})

    @app.get("/api/tasks")
    def api_tasks():
        """Vrátí seznam aktivních/ukončených úkolů agenta ze stavového stroje."""
        agent = Agent.query.order_by(Agent.id.asc()).first()
        if not agent:
            return jsonify({"tasks": []})
        tasks = list_task_payloads(agent)
        return jsonify({"tasks": tasks})

    @app.post("/api/tasks/<task_id>/objectives/<int:objective_index>/complete")
    def api_complete_task_objective(task_id: str, objective_index: int):
        """Označí konkrétní krok úkolu jako splněný + případně přidělí odměnu."""
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

    @app.post("/api/tasks/reset")
    def api_reset_tasks():
        """Resetuje pipeline úkolů a vytvoří nové active_tasks pro agenta."""
        agent = Agent.query.order_by(Agent.id.asc()).first()
        if not agent:
            return jsonify({"error": "Agent not found"}), 404

        reset_task_pipeline(agent)
        tasks = list_task_payloads(agent)
        return jsonify({"tasks": tasks})


    return app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
