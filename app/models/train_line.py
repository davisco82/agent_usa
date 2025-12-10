# models/train_line.py
import math

from app.extensions import db
from app.models.city import City


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
        """
        Vrátí vzdálenost v mílích mezi dvěma městy (priorita GPS).
        Fallback na px/py, pokud GPS chybí.
        """
        # 1.18 (realismus) * 1.20 (trať není vzdušná čára) = 1.416
        SCALE = 1.416
        if (
            getattr(a, "lat", None) is not None and getattr(a, "lon", None) is not None
            and getattr(b, "lat", None) is not None and getattr(b, "lon", None) is not None
        ):
            R = 3958.8
            lat1, lon1 = math.radians(a.lat), math.radians(a.lon)
            lat2, lon2 = math.radians(b.lat), math.radians(b.lon)
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            hav = (
                math.sin(dlat / 2) ** 2
                + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
            )
            c = 2 * math.atan2(math.sqrt(hav), math.sqrt(1 - hav))
            return R * c * SCALE

        dx = (a.px or 0) - (b.px or 0)
        dy = (a.py or 0) - (b.py or 0)
        return math.sqrt(dx*dx + dy*dy) * SCALE
    
