# models/agent_task_progress.py
from app.extensions import db


class AgentTaskProgress(db.Model):
    __tablename__ = "agent_task_progress"

    id = db.Column(db.Integer, primary_key=True)
    agent_id = db.Column(db.Integer, db.ForeignKey("agents.id"), nullable=False)
    task_id = db.Column(db.String(120), nullable=False)
    objectives_state = db.Column(db.JSON, nullable=False, default=list)
    xp_earned = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        server_default=db.func.now(),
        onupdate=db.func.now(),
    )

    agent = db.relationship("Agent", backref=db.backref("task_progress", lazy="dynamic"))

    __table_args__ = (
        db.UniqueConstraint("agent_id", "task_id", name="uq_agent_task_progress_agent_task"),
    )

    def ensure_state_length(self, objective_count: int) -> list:
        """Vrátí pole splněných cílů s délkou odpovídající konfiguraci."""
        state = list(self.objectives_state or [])
        if objective_count <= 0:
            state = []
        elif len(state) < objective_count:
            state.extend([False] * (objective_count - len(state)))
        elif len(state) > objective_count:
            state = state[:objective_count]
        self.objectives_state = state
        return state

    def completed_count(self) -> int:
        return sum(1 for flag in (self.objectives_state or []) if flag)
