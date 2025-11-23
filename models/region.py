# models/region.py
from models import db

class Region(db.Model):
    __tablename__ = "regions"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False)  # např. "pacific_northwest"
    name = db.Column(db.String(100), nullable=False)              # např. "Pacific Northwest"

    cities = db.relationship("City", back_populates="region")
