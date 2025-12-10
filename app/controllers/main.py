from __future__ import annotations

from flask import Blueprint, jsonify, render_template, request

from app.models.city import City
from app.models.train_line import TrainLine
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
