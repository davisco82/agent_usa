# models/city.py
from models import db

class City(db.Model):
    __tablename__ = "cities"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)

    region_id = db.Column(db.Integer, db.ForeignKey("regions.id"), nullable=False)
    importance = db.Column(db.Integer, nullable=False, default=3)  # 1 = hlavní, 2 = střední, 3 = malé

    state = db.Column(db.String(100))
    state_shortcut = db.Column(db.String(10))
    description = db.Column(db.Text)

    lat = db.Column(db.Float)
    lon = db.Column(db.Float)
    px = db.Column(db.Float)
    py = db.Column(db.Float)
    grid_x = db.Column(db.Integer)
    grid_y = db.Column(db.Integer)
    population = db.Column(db.Integer)

    region = db.relationship("Region", back_populates="cities")
