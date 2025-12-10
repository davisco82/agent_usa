from __future__ import annotations

from flask import Flask
from flask_migrate import Migrate

from app.controllers import register_blueprints
from app.extensions import db
from seeds.agent_seed import register_agent_seed_commands
from seeds.cities_seed import register_city_seed_commands
from seeds.lab_seed import register_lab_seed_commands
from seeds.trainlines_seed import register_trainlines_commands


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.from_object("config.Config")

    db.init_app(app)
    Migrate(app, db)

    register_blueprints(app)
    register_city_seed_commands(app)
    register_trainlines_commands(app)
    register_lab_seed_commands(app)
    register_agent_seed_commands(app)

    return app
