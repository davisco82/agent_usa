# models/tool.py

from models import db

class Tool(db.Model):
    __tablename__ = "tools"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False)  # např. "detector_pulse"
    name = db.Column(db.String(100), nullable=False)

    energy_cost = db.Column(db.Integer, default=0)
    material_cost = db.Column(db.Integer, default=0)

    data_gain = db.Column(db.Integer, default=0)      # kolik získáš dat
    energy_gain = db.Column(db.Integer, default=0)    # např. generátor
    material_gain = db.Column(db.Integer, default=0)  # kdyby se ti někdy hodilo

    # později: efekt na mlhu, region, město…