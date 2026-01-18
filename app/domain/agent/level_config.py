# game/agent/level_config.py

AGENT_LEVELS = [
    # level, xp_needed_from_previous_level, energy_max, popis odemčení
    {"level": 1,  "xp_required":   0, "energy_max": 0, "material_max": 0, "data_max": 0, "unlock": "Základní cestování mezi městy."},
    {"level": 2,  "xp_required":  50, "energy_max": 1, "material_max": 5, "data_max": 0, "unlock": "Energie a materiály jsou nyní dostupné. V Infocentru lze nově objevovat materiál. Dílna je nově k dispozici ve vybraných městech.",
     "unlock_items": [
         {"type": "energy", "description": "Základ 1"},
         {"type": "materials", "description": "Základ 0"},
         {"type": "credits", "amount": 500},
         {"type": "building", "name": "Dílna", "description": "Dostupná ve vybraných městech."},
     ]},
    {"level": 3,  "xp_required":  50, "energy_max": 2, "material_max": 5, "data_max": 5, "unlock": "Data jsou nyní dostupná. Zobrazování základních informací o mlze v okolí města.",
     "unlock_items": [
         {"type": "data"},
     ]},
    {"level": 4,  "xp_required": 100, "energy_max": 3, "material_max": 5, "data_max": 5, "unlock": "+1 energie, lepší odměny ve malých městech."},

    {"level": 5,  "xp_required": 100, "energy_max": 3, "material_max": 10, "data_max": 10, "unlock": "Akce: rychlý sken mlhy v okolí (malý rádius)."},
    {"level": 6,  "xp_required": 200, "energy_max": 3, "material_max": 10, "data_max": 10, "unlock": "Levnější cestování (sleva na jízdenky)."},
    {"level": 7,  "xp_required": 200, "energy_max": 4, "material_max": 10, "data_max": 10, "unlock": "Regionální přehled mlhy (heatmapa regionu)."},
    {"level": 8,  "xp_required": 300, "energy_max": 4, "material_max": 15, "data_max": 15, "unlock": "+1 energie, efektivnější čištění jednoho města."},

    {"level": 9,  "xp_required": 400, "energy_max": 4, "material_max": 15, "data_max": 15, "unlock": "Akce: silnější vyčištění města (větší dopad na mlhu)."},
    {"level": 10, "xp_required": 500, "energy_max": 5, "material_max": 20, "data_max": 20, "unlock": "Odemknutí speciálních misí ve velkých městech."},
    {"level": 11, "xp_required": 600, "energy_max": 5, "material_max": 20, "data_max": 20, "unlock": "Rychlejší přesun mezi velkými městy (fast-travel)."},
    {"level": 12, "xp_required": 700, "energy_max": 6, "material_max": 20, "data_max": 20, "unlock": "+1 energie, bonusové zdroje z misí."},

    {"level": 13, "xp_required": 800, "energy_max": 6, "material_max": 20, "data_max": 20, "unlock": "Akce: dočasné zpomalení šíření mlhy v regionu."},
    {"level": 14, "xp_required": 900, "energy_max": 7, "material_max": 20, "data_max": 20, "unlock": "Odemknutí pokročilých úkolů v laboratořích."},
    {"level": 15, "xp_required": 1000, "energy_max": 7, "material_max": 25, "data_max": 25, "unlock": "Lepší přehled o stavu všech měst v regionu."},
    {"level": 16, "xp_required": 1200, "energy_max": 8, "material_max": 25, "data_max": 25, "unlock": "+1 energie, vyšší šance na vzácné odměny."},

    {"level": 17, "xp_required": 1400, "energy_max": 9, "material_max": 25, "data_max": 25, "unlock": "Národní mapa mlhy (globální overview)."},
    {"level": 18, "xp_required": 1600, "energy_max": 10, "material_max": 25, "data_max": 25, "unlock": "Silnější regionální čištění mlhy."},
    {"level": 19, "xp_required": 1800, "energy_max": 10, "material_max": 25, "data_max": 25, "unlock": "Přístup k přípravě finální operace proti mlze."},
    {"level": 20, "xp_required": 2000, "energy_max": 10, "material_max": 25, "data_max": 25, "unlock": "Finální level – odemčené závěrečné mise (endgame)."},
]
