# models/train_line.py
from models import db
from models.city import City
import math


class TrainLine(db.Model):
    __tablename__ = "train_lines"

    id = db.Column(db.Integer, primary_key=True)

    from_city_id = db.Column(db.Integer, db.ForeignKey("cities.id"), nullable=False)
    to_city_id   = db.Column(db.Integer, db.ForeignKey("cities.id"), nullable=False)

    # typ linky – zatím simple, ale můžeš rozšířit (intercity, express, freight…)
    line_type = db.Column(db.String(20), nullable=False, default="regional")
    # v minutách – interval mezi vlaky (např. 10, 20, 40)
    frequency_minutes = db.Column(db.Integer, nullable=False, default=30)

    # přibližná délka tratě – ať máš na čem stavět do budoucna (cena, čas, energie)
    distance_units = db.Column(db.Float)  # třeba na základě px/py, nebo km

    # volitelně – jestli je linka aktivní (pro budoucí game logiku)
    is_active = db.Column(db.Boolean, nullable=False, default=True)

    from_city = db.relationship("City", foreign_keys=[from_city_id])
    to_city   = db.relationship("City", foreign_keys=[to_city_id])

    def __repr__(self):
        return f"<TrainLine {self.from_city.name} ↔ {self.to_city.name}>"
    
    def compute_distance(a, b):
        dx = (a.px or 0) - (b.px or 0)
        dy = (a.py or 0) - (b.py or 0)
        return math.sqrt(dx*dx + dy*dy)
    

