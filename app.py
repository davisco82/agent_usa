# app.py
from flask import Flask
from flask_migrate import Migrate
from models import db
from seeds.cities_seed import register_city_seed_commands

def create_app():
    app = Flask(__name__)
    app.config.from_object("config.Config")

    db.init_app(app)
    Migrate(app, db)

    # CLI příkazy (seed)
    register_city_seed_commands(app)

    return app

app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
