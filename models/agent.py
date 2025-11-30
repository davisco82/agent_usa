# models/agent.py
from models import db


class Agent(db.Model):
    __tablename__ = "agents"

    id = db.Column(db.Integer, primary_key=True)
    xp = db.Column(db.Integer, nullable=False, default=0)
    level = db.Column(db.Integer, nullable=False, default=1)

    current_city_id = db.Column(db.Integer, db.ForeignKey("cities.id"), nullable=True)
    last_city_id = db.Column(db.Integer, db.ForeignKey("cities.id"), nullable=True)

    energy_current = db.Column(db.Integer, nullable=False, default=0)
    energy_max = db.Column(db.Integer, nullable=False, default=100)

    data_current = db.Column(db.Integer, nullable=False, default=0)
    data_max = db.Column(db.Integer, nullable=False, default=100)

    material_current = db.Column(db.Integer, nullable=False, default=0)
    material_max = db.Column(db.Integer, nullable=False, default=100)

    total_trips = db.Column(db.Integer, nullable=False, default=0)
    total_cleaned_cities = db.Column(db.Integer, nullable=False, default=0)
    total_failed_cities = db.Column(db.Integer, nullable=False, default=0)

    codename = db.Column(db.String(100), unique=True)
    credits = db.Column(db.Integer, nullable=False, default=0)
    infection_level = db.Column(db.Integer, nullable=False, default=0)  # 0-100 škála závažnosti
    last_action_at = db.Column(db.DateTime)

    is_active = db.Column(db.Boolean, nullable=False, default=True)
    is_infected = db.Column(db.Boolean, nullable=False, default=False)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        server_default=db.func.now(),
        onupdate=db.func.now(),
    )

    current_city = db.relationship("City", foreign_keys=[current_city_id])
    last_city = db.relationship("City", foreign_keys=[last_city_id])

    def __repr__(self):
        return f"<Agent id={self.id} level={self.level} xp={self.xp}>"
