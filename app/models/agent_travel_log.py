"""Travel history log for the agent."""

from app.extensions import db


class AgentTravelLog(db.Model):
    __tablename__ = "agent_travel_log"

    id = db.Column(db.Integer, primary_key=True)
    agent_id = db.Column(db.Integer, db.ForeignKey("agents.id"), nullable=False)
    from_city_id = db.Column(db.Integer, db.ForeignKey("cities.id"), nullable=True)
    to_city_id = db.Column(db.Integer, db.ForeignKey("cities.id"), nullable=False)

    action = db.Column(db.String(32), nullable=False, default="travel")

    game_minutes = db.Column(db.Integer, nullable=False)
    game_week = db.Column(db.Integer, nullable=False)
    game_day_index = db.Column(db.Integer, nullable=False)
    game_day_label = db.Column(db.String(16), nullable=False)
    game_time_label = db.Column(db.String(16), nullable=False)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())
    recorded_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())

    agent = db.relationship("Agent", backref=db.backref("travel_logs", lazy="dynamic"))
    from_city = db.relationship("City", foreign_keys=[from_city_id])
    to_city = db.relationship("City", foreign_keys=[to_city_id])

    def serialize(self) -> dict:
        """Return a structured representation for APIs."""
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "from_city_id": self.from_city_id,
            "to_city_id": self.to_city_id,
            "action": self.action,
            "game_minutes": self.game_minutes,
            "game_week": self.game_week,
            "game_day_index": self.game_day_index,
            "game_day_label": self.game_day_label,
            "game_time_label": self.game_time_label,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
