# services/timetable_service.py

import math
from typing import List, Dict, Any
from models import db
from models.city import City
from models.train_line import TrainLine

START_BASE_MINUTES = 8 * 60  # 8:00

def get_spacing_for_importance(importance: int) -> int:
    """Jak daleko od sebe starty linek z jednoho města."""
    if importance == 1:
        return 3   # hustá doprava
    if importance == 2:
        return 5   # střední
    return 10      # méně vlaků (typicky importance 3)

def compute_next_departures(city: City, current_minutes: int, limit: int = 5) -> List[Dict[str, Any]]:
    """
    Vrátí seznam nejbližších odjezdů vlaků z daného města.

    current_minutes = herní čas v minutách (klidně od startu hry, my si to převedeme).
    Vrací pole dictů s klíči:
      departure_minutes, from_city, to_city, line
    """
    if city is None:
        return []

    # Budeme řešit rozestupy v rámci jednoho dne – mod 24h
    MINUTES_PER_DAY = 24 * 60
    day_minutes = current_minutes % MINUTES_PER_DAY

    importance = city.importance or 3
    spacing = get_spacing_for_importance(importance)

    # všechny aktivní linky z daného města (obě směry)
    from_lines = (
        TrainLine.query
        .filter_by(from_city_id=city.id, is_active=True)
        .order_by(TrainLine.id)
        .all()
    )
    to_lines = (
        TrainLine.query
        .filter_by(to_city_id=city.id, is_active=True)
        .order_by(TrainLine.id)
        .all()
    )

    candidates = []

    # FROM → TO
    for idx, line in enumerate(from_lines):
        freq = line.frequency_minutes or 60

        # každá linka dostane offset v rámci [0, freq)
        offset = (idx * spacing) % freq
        first_departure = START_BASE_MINUTES + offset  # např. 8:02, 8:05...

        # spočítáme první odjezd >= aktuální čas
        if day_minutes <= first_departure:
            next_dep = first_departure
        else:
            k = math.ceil((day_minutes - first_departure) / freq)
            next_dep = first_departure + k * freq

        # spočítáme délku cestování pro trasu
        travel_minutes = compute_travel_minutes(
            line,
            imp_a=line.from_city.importance,
            imp_b=line.to_city.importance,
        )

        # vygenerujeme pár dalších odjezdů této linky
        for i in range(5):
            dep_time = next_dep + i * freq
            candidates.append({
                "departure_minutes": dep_time,
                "from_city": city,
                "to_city": line.to_city,
                "line": line,
                "travel_minutes": travel_minutes,
                "distance_units": line.distance_units or 0.0,
            })

    # TO → FROM (vlak z "to_city" směrem zpět do current city)
    for idx, line in enumerate(to_lines):
        freq = line.frequency_minutes or 60
        offset = (idx * spacing) % freq
        first_departure = START_BASE_MINUTES + offset

        if day_minutes <= first_departure:
            next_dep = first_departure
        else:
            k = math.ceil((day_minutes - first_departure) / freq)
            next_dep = first_departure + k * freq

        for i in range(5):
            dep_time = next_dep + i * freq
            candidates.append({
                "departure_minutes": dep_time,
                "from_city": city,
                "to_city": line.from_city,
                "line": line,
            })

    # seřadíme podle času a vezmeme prvních N
    candidates.sort(key=lambda c: c["departure_minutes"])
    return candidates[:limit]

def compute_travel_minutes(line: TrainLine, imp_a: int, imp_b: int) -> int:
    """
    Spočítá dobu jízdy v minutách pro danou vlakovou linku.
    Vyšší importance = spíš rychlý vlak.
    Regional je pomalý (víc zastávek).
    """

    dist = line.distance_units or 0.0
    if dist <= 0:
        return 0  # stejná stanice / fallback

    # 1) typ linky → základní rychlost
    # units / min
    if line.line_type == "express" and imp_a == 1 and imp_b == 1:
        base_speed = 6.0   # nejrychlejší hub ↔ hub
    elif line.line_type == "express":
        base_speed = 4.0   # express 1–2
    else:
        base_speed = 2.0   # regionální linky

    # 2) penalty podle nejméně důležitého města
    lowest = max(imp_a, imp_b)  # 3 = nejmenší město

    if lowest == 1:
        penalty = 1.0
    elif lowest == 2:
        penalty = 1.15
    else:
        penalty = 1.30

    # 3) hrubý čas = vzdálenost / rychlost * penalty
    raw_minutes = dist / base_speed * penalty

    # zaokrouhlení nahoru – ať nejsou 0 min na krátké trasy
    return max(1, int(math.ceil(raw_minutes)))