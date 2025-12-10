from __future__ import annotations

from flask import Flask

from . import agent, lab, main, tasks


def register_blueprints(app: Flask) -> None:
    app.register_blueprint(main.bp)
    app.register_blueprint(agent.bp)
    app.register_blueprint(lab.bp)
    app.register_blueprint(tasks.bp)
