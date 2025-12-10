# models/lab_action.py
from app.extensions import db


class LabAction(db.Model):
    __tablename__ = "lab_actions"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(64), unique=True, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(40), nullable=False)
    description = db.Column(db.Text)

    unlock_level = db.Column(db.Integer, nullable=False, default=1)
    unlock_cleaned_cities = db.Column(db.Integer, nullable=False, default=0)
    unlock_requirements = db.Column(db.JSON, nullable=False, default=dict)

    energy_cost = db.Column(db.Integer, nullable=False, default=0)
    data_cost = db.Column(db.Integer, nullable=False, default=0)
    material_cost = db.Column(db.Integer, nullable=False, default=0)
    cooldown_minutes = db.Column(db.Integer, nullable=False, default=0)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        server_default=db.func.now(),
        onupdate=db.func.now(),
    )

    states = db.relationship("LabActionState", back_populates="action", cascade="all, delete-orphan")


class LabActionState(db.Model):
    __tablename__ = "lab_action_states"

    id = db.Column(db.Integer, primary_key=True)
    lab_action_id = db.Column(db.Integer, db.ForeignKey("lab_actions.id"), nullable=False)
    agent_id = db.Column(db.Integer, db.ForeignKey("agents.id"), nullable=False)

    is_unlocked = db.Column(db.Boolean, nullable=False, default=False)
    is_disabled = db.Column(db.Boolean, nullable=False, default=False)
    last_used_at = db.Column(db.DateTime)
    uses_count = db.Column(db.Integer, nullable=False, default=0)
    notes = db.Column(db.Text)

    created_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        server_default=db.func.now(),
        onupdate=db.func.now(),
    )

    action = db.relationship("LabAction", back_populates="states")
    agent = db.relationship("Agent", backref=db.backref("lab_action_states", cascade="all, delete-orphan"))

    __table_args__ = (
        db.UniqueConstraint("lab_action_id", "agent_id", name="uq_lab_action_state"),
    )
