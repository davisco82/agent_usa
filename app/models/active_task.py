from app.extensions import db
from datetime import datetime

class ActiveTask(db.Model):
    __tablename__ = "active_tasks"

    id = db.Column(db.Integer, primary_key=True)

    agent_id = db.Column(db.Integer, db.ForeignKey("agents.id"), nullable=False)
    task_id = db.Column(db.String(100), nullable=False)  # např. "mission-rook-intro-01"

    status = db.Column(db.String(50), default="active")  
    # active = probíhá, completed = splněno, rewarded = odměna přidělena

    current_objective = db.Column(db.Integer, default=0)  
    # index v poli "objectives" v templatu

    progress = db.Column(db.Float, default=0.0)  
    # 0.0–1.0 průběh mise

    reward_claimed = db.Column(db.Boolean, default=False)

    # JSON stav objektivů / triggerů
    objective_state = db.Column(db.JSON, default=dict)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow,
                           onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<ActiveTask agent={self.agent_id} task={self.task_id} step={self.current_objective}>"
