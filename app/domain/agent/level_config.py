# game/agent/level_config.py

AGENT_LEVELS = [
    # level, xp_needed_from_previous_level, energy_max, popis odemčení
    {"level": 1,  "xp_required":   0, "energy_max": 0, "unlock": "Základní cestování mezi městy."},
    {"level": 2,  "xp_required":  50, "energy_max": 1, "unlock": "+1 energie, malé XP bonusy za mise."},
    {"level": 3,  "xp_required":  50, "energy_max": 2, "unlock": "Zobrazování základních informací o mlze v okolí města."},
    {"level": 4,  "xp_required": 100, "energy_max": 3, "unlock": "+1 energie, lepší odměny ve malých městech."},

    {"level": 5,  "xp_required": 100, "energy_max": 3, "unlock": "Akce: rychlý sken mlhy v okolí (malý rádius)."},
    {"level": 6,  "xp_required": 200, "energy_max": 3, "unlock": "Levnější cestování (sleva na jízdenky)."},
    {"level": 7,  "xp_required": 200, "energy_max": 4, "unlock": "Regionální přehled mlhy (heatmapa regionu)."},
    {"level": 8,  "xp_required": 300, "energy_max": 4, "unlock": "+1 energie, efektivnější čištění jednoho města."},

    {"level": 9,  "xp_required": 400, "energy_max": 4, "unlock": "Akce: silnější vyčištění města (větší dopad na mlhu)."},
    {"level": 10, "xp_required": 500, "energy_max": 5, "unlock": "Odemknutí speciálních misí ve velkých městech."},
    {"level": 11, "xp_required": 600, "energy_max": 5, "unlock": "Rychlejší přesun mezi velkými městy (fast-travel)."},
    {"level": 12, "xp_required": 700, "energy_max": 6, "unlock": "+1 energie, bonusové zdroje z misí."},

    {"level": 13, "xp_required": 800, "energy_max": 6, "unlock": "Akce: dočasné zpomalení šíření mlhy v regionu."},
    {"level": 14, "xp_required": 900, "energy_max": 7, "unlock": "Odemknutí pokročilých úkolů v laboratořích."},
    {"level": 15, "xp_required": 1000, "energy_max": 7, "unlock": "Lepší přehled o stavu všech měst v regionu."},
    {"level": 16, "xp_required": 1200, "energy_max": 8, "unlock": "+1 energie, vyšší šance na vzácné odměny."},

    {"level": 17, "xp_required": 1400, "energy_max": 9, "unlock": "Národní mapa mlhy (globální overview)."},
    {"level": 18, "xp_required": 1600, "energy_max": 10, "unlock": "Silnější regionální čištění mlhy."},
    {"level": 19, "xp_required": 1800, "energy_max": 10, "unlock": "Přístup k přípravě finální operace proti mlze."},
    {"level": 20, "xp_required": 2000, "energy_max": 10, "unlock": "Finální level – odemčené závěrečné mise (endgame)."},
]
