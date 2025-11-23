# app.py
from flask import Flask, jsonify, render_template
from flask_migrate import Migrate
from models import db
from models.train_line import TrainLine
from models.city import City
from seeds.cities_seed import register_city_seed_commands
from seeds.trainlines_seed import register_trainlines_commands  

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
                "distance_units": line.distance_units,
            })

        return jsonify(data)



    return app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
