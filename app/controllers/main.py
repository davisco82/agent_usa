from __future__ import annotations

from datetime import datetime

from flask import Blueprint, jsonify, render_template, request

from app.extensions import db
from app.models.agent import Agent
from app.models.city import City
from app.models.train_line import TrainLine
from app.services.material_service import (
    maybe_refresh_material_state,
    serialize_city_material_state,
)
from app.services.timetable_service import (
    compute_line_distance_miles,
    compute_next_departures,
    compute_travel_minutes,
)

bp = Blueprint("main", __name__)


@bp.route("/")
def index():
    return render_template("index.html")


@bp.get("/api/cities")
def api_cities():
    """Return all cities for the canvas map."""
    cities = City.query.all()
    data = []
    for city in cities:
        data.append({
            "id": city.id,
            "name": city.name,
            "region": city.region.code if city.region else None,
            "importance": city.importance,
            "state": city.state,
            "state_shortcut": city.state_shortcut,
            "description": city.description,
            "lat": city.lat,
            "lon": city.lon,
            "px": city.px,
            "py": city.py,
            "grid_x": city.grid_x,
            "grid_y": city.grid_y,
            "population": city.population,
        })
    return jsonify(data)


@bp.get("/api/trainlines")
def api_trainlines():
    """Return all train lines for the canvas map."""
    lines = TrainLine.query.all()
    data = []
    for line in lines:
        from_city = line.from_city
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


@bp.get("/api/timetable")
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

    def to_dict(dep):
        line = dep["line"]
        travel = dep.get("travel_minutes")
        distance_miles = dep.get("distance_units")

        if travel is None:
            travel = compute_travel_minutes(
                line,
                line.from_city.importance,
                line.to_city.importance,
                distance_miles=distance_miles if distance_miles is not None else None,
            )

        return {
            "departure_minutes": dep["departure_minutes"],
            "from_city": {
                "id": dep["from_city"].id,
                "name": dep["from_city"].name,
            },
            "to_city": {
                "id": dep["to_city"].id,
                "name": dep["to_city"].name,
            },
            "line_type": line.line_type,
            "frequency_minutes": line.frequency_minutes,
            "distance_units": (
                distance_miles if distance_miles is not None else compute_line_distance_miles(line)
            ),
            "travel_minutes": travel,
        }

    return jsonify([to_dict(dep) for dep in departures])


def _get_primary_agent() -> Agent | None:
    return Agent.query.order_by(Agent.id.asc()).first()


@bp.get("/api/cities/<int:city_id>/materials")
def api_city_materials(city_id: int):
    city = City.query.get_or_404(city_id)
    maybe_refresh_material_state(city)
    db.session.commit()
    return jsonify(serialize_city_material_state(city))


@bp.post("/api/cities/<int:city_id>/materials/collect")
def api_collect_city_materials(city_id: int):
    city = City.query.get_or_404(city_id)
    agent = _get_primary_agent()
    if not agent:
        return jsonify({"error": "agent_not_found"}), 404
    if agent.current_city_id != city.id:
        return jsonify({"error": "agent_not_in_city"}), 400

    maybe_refresh_material_state(city)
    capacity = max(0, (agent.material_max or 0) - (agent.material_current or 0))
    collect_qty = min(city.material_info_qty or 0, capacity)
    if collect_qty <= 0:
        return jsonify({"error": "no_material_available"}), 400

    city.material_info_qty = max(0, (city.material_info_qty or 0) - collect_qty)
    agent.material_current = (agent.material_current or 0) + collect_qty
    db.session.commit()

    return jsonify(
        {
            "agent": {
                "material_current": agent.material_current,
                "material_max": agent.material_max,
            },
            "city_materials": serialize_city_material_state(city),
            "collected_qty": collect_qty,
        }
    )


@bp.post("/api/cities/<int:city_id>/materials/buy")
def api_buy_city_materials(city_id: int):
    payload = request.get_json(silent=True) or {}
    qty_requested = payload.get("quantity", 1)
    try:
        qty_requested = int(qty_requested)
    except (TypeError, ValueError):
        qty_requested = 1
    qty_requested = max(1, qty_requested)

    city = City.query.get_or_404(city_id)
    agent = _get_primary_agent()
    if not agent:
        return jsonify({"error": "agent_not_found"}), 404
    if agent.current_city_id != city.id:
        return jsonify({"error": "agent_not_in_city"}), 400

    maybe_refresh_material_state(city)
    if not city.market_material_qty or city.market_material_qty <= 0:
        return jsonify({"error": "market_empty"}), 400
    if not city.market_material_price:
        return jsonify({"error": "price_missing"}), 400

    capacity = max(0, (agent.material_max or 0) - (agent.material_current or 0))
    purchasable_qty = min(city.market_material_qty, qty_requested, capacity)
    if purchasable_qty <= 0:
        return jsonify({"error": "no_capacity"}), 400

    inventory = Agent.normalize_inventory(agent.inventory)
    money = inventory.get("money", 0)
    total_cost = purchasable_qty * city.market_material_price
    if money < total_cost:
        return jsonify({"error": "insufficient_funds"}), 400

    inventory["money"] = money - total_cost
    agent.inventory = inventory
    agent.material_current = (agent.material_current or 0) + purchasable_qty
    city.market_material_qty = max(0, city.market_material_qty - purchasable_qty)
    db.session.commit()

    return jsonify(
        {
            "agent": {
                "material_current": agent.material_current,
                "material_max": agent.material_max,
                "money": inventory["money"],
            },
            "city_materials": serialize_city_material_state(city),
            "purchased_qty": purchasable_qty,
            "total_cost": total_cost,
        }
    )


@bp.post("/api/debug/materials/refresh")
def api_debug_refresh_materials():
    payload = request.get_json(silent=True) or {}
    city_id = payload.get("city_id")
    refreshed = []
    if city_id is not None:
        try:
            city_id = int(city_id)
        except (TypeError, ValueError):
            return jsonify({"error": "invalid_city_id"}), 400
        city = City.query.get(city_id)
        if not city:
            return jsonify({"error": "city_not_found"}), 404
        maybe_refresh_material_state(city, now=datetime.now())
        refreshed.append(serialize_city_material_state(city))
    else:
        cities = City.query.all()
        for city in cities:
            maybe_refresh_material_state(city, now=datetime.now())
            refreshed.append(serialize_city_material_state(city))
    db.session.commit()
    return jsonify({"refreshed": refreshed, "count": len(refreshed)})
