# seeds/lab_seed.py

from models import db
from models.lab_action import LabAction


LAB_ACTIONS = [
    {
        "code": "fog_level",
        "name": "Úroveň šíření mlhy",
        "category": "info",
        "description": "Průběžný odhad šíření v aktuálním regionu.",
        "unlock_level": 1,
        "unlock_cleaned_cities": 0,
        "unlock_requirements": {},
    },
    {
        "code": "fog_analysis",
        "name": "Analýza mlhy",
        "category": "analysis",
        "description": "Zjistí chemické složení a hustotu šíření.",
        "unlock_level": 2,
        "unlock_cleaned_cities": 0,
        "unlock_requirements": {"min_data": 10},
        "data_cost": 5,
    },
    {
        "code": "direction_detection",
        "name": "Detekce směru",
        "category": "analysis",
        "description": "Predictivní model určí nejbližší ohrožené město.",
        "unlock_level": 3,
        "unlock_cleaned_cities": 1,
        "unlock_requirements": {"min_data": 20},
        "data_cost": 10,
    },
    {
        "code": "slow_spread",
        "name": "Zpomalení šíření",
        "category": "counter",
        "description": "Aktivuje regionální bariéry a sníží rychlost mlhy.",
        "unlock_level": 2,
        "unlock_cleaned_cities": 2,
        "unlock_requirements": {"min_material": 15},
        "material_cost": 10,
    },
    {
        "code": "local_filter",
        "name": "Lokální ochranný filtr",
        "category": "counter",
        "description": "Instaluje ochrannou kopuli nad vybraným městem.",
        "unlock_level": 3,
        "unlock_cleaned_cities": 3,
        "unlock_requirements": {"min_material": 25},
        "material_cost": 20,
    },
    {
        "code": "local_serum",
        "name": "Lokální sérum",
        "category": "counter",
        "description": "Neutralizuje ložiska v jednom městě pomocí séra.",
        "unlock_level": 4,
        "unlock_cleaned_cities": 5,
        "unlock_requirements": {"min_data": 25, "min_material": 30},
        "data_cost": 15,
        "material_cost": 25,
    },
]


def register_lab_seed_commands(app):
    @app.cli.command("seed-lab")
    def seed_lab_actions():
        """Seed laboratorní akce."""

        print("Seeding lab actions...")
        for payload in LAB_ACTIONS:
            action = LabAction.query.filter_by(code=payload["code"]).first()
            if not action:
                action = LabAction(code=payload["code"])
                db.session.add(action)

            action.name = payload["name"]
            action.category = payload["category"]
            action.description = payload["description"]
            action.unlock_level = payload.get("unlock_level", 1)
            action.unlock_cleaned_cities = payload.get("unlock_cleaned_cities", 0)
            action.unlock_requirements = payload.get("unlock_requirements", {})
            action.energy_cost = payload.get("energy_cost", 0)
            action.data_cost = payload.get("data_cost", 0)
            action.material_cost = payload.get("material_cost", 0)
            action.cooldown_minutes = payload.get("cooldown_minutes", 0)

        db.session.commit()
        print("✅ Lab actions ready")
