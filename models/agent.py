# models/agent.py
from models import db
from game.agent.level_config import AGENT_LEVELS



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
    
    def get_level_config(self, level: int):
        """Vrátí config pro daný level (nebo None, pokud neexistuje)."""
        for cfg in AGENT_LEVELS:
            if cfg["level"] == level:
                return cfg
        return None

    def cumulative_xp_for_level(self, level: int) -> int:
        """Spočítá celkové XP nutné k dosažení dané úrovně (xp_required jsou přírůstky mezi levely)."""
        total = 0
        for cfg in AGENT_LEVELS:
            if cfg["level"] > level:
                break
            total += cfg.get("xp_required", 0)
        return total

    def max_level(self) -> int:
        return max(cfg["level"] for cfg in AGENT_LEVELS)

    def gain_xp(self, amount: int):
        """Přidá XP a případně zvedne level + energii dle configu."""
        if amount <= 0:
            return

        self.xp += amount

        # opakovaně kontrolujeme, jestli nedosáhl dalšího levelu
        while True:
            next_level = self.level + 1
            cfg = self.get_level_config(next_level)

            # žádný další level neexistuje
            if not cfg:
                break

            # nemá ještě dost XP na level-up (xp_required je přírůstek, proto porovnáváme s kumulativní hodnotou)
            if self.xp < self.cumulative_xp_for_level(next_level):
                break

            # zvedni level
            self.level = next_level

            # uprav max energii podle configu
            self.energy_max = cfg["energy_max"]

            # při level-upu můžeš doplnit energii na max (MVP varianta)
            self.energy_current = self.energy_max
