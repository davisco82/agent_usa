# app.py
from flask import Flask, jsonify, render_template, request
from flask_migrate import Migrate
from models import db
from models.train_line import TrainLine
from models.city import City
from seeds.cities_seed import register_city_seed_commands
from seeds.trainlines_seed import register_trainlines_commands  
from services.timetable_service import (
    compute_line_distance_miles,
    compute_next_departures,
    compute_travel_minutes,
)



def create_app():
    app = Flask(__name__)
    app.config.from_object("config.Config")

    db.init_app(app)
    Migrate(app, db)

    # CLI příkazy (seed)
    register_city_seed_commands(app)
    register_trainlines_commands(app)

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
                "lat": c.lat,
                "lon": c.lon,
                "px": c.px,
                "py": c.py,
                "grid_x": c.grid_x,
                "grid_y": c.grid_y,
            })

        return jsonify(data)

    
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


    return app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
