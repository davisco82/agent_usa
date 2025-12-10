# services/timetable_service.py

import math
from typing import List, Dict, Any, Optional

from app.models.city import City
from app.models.train_line import TrainLine

EARTH_RADIUS_MI = 3958.8
# 1.18 (realismus) * 1.20 (neletíš vzdušnou čarou) = 1.416
DISTANCE_SCALE = 1.416  # prodloužené vzdálenosti pro vlakové trasy

def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Spočítá vzdálenost mezi dvěma GPS body v mílích."""
    lat1_rad, lon1_rad = math.radians(lat1), math.radians(lon1)
    lat2_rad, lon2_rad = math.radians(lat2), math.radians(lon2)

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_MI * c

def compute_line_distance_miles(line: TrainLine) -> float:
    """
    Vrátí vzdálenost trasy v mílích. Primárně používá GPS (lat/lon),
    fallback na uložené distance_units nebo px/py, pokud chybí souřadnice.
    """
    if line and line.from_city and line.to_city:
        fa, fb = line.from_city, line.to_city
        if (
            fa.lat is not None and fa.lon is not None
            and fb.lat is not None and fb.lon is not None
        ):
            return _haversine_miles(fa.lat, fa.lon, fb.lat, fb.lon) * DISTANCE_SCALE

    if line and line.distance_units:
        return line.distance_units * DISTANCE_SCALE

    if line and line.from_city and line.to_city:
        # fallback na obrazovkové vzdálenosti (užitečné jen pro debug)
        return TrainLine.compute_distance(line.from_city, line.to_city) * DISTANCE_SCALE

    return 0.0

# První odjezdy dne začínají hned po půlnoci, ne až v 8:00
START_BASE_MINUTES = 0

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
    day_start_minutes = current_minutes - day_minutes  # absolutní začátek dne (Po 8:00 = 480)

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
    used_departure_minutes = set()

    def spread_offset(idx: int, freq: int, total: int) -> int:
        """
        Vrátí offset v rámci intervalu [0, freq), který rovnoměrně rozprostře linky.
        """
        if total <= 1:
            return 0
        # rozprostření mezi 0 a freq (exkluzivně)
        return int(round((idx + 1) * freq / (total + 1)))

    total_lines = len(from_lines) + len(to_lines)

    # FROM → TO
    for idx, line in enumerate(from_lines):
        freq = line.frequency_minutes or 60
        distance_miles = compute_line_distance_miles(line)
        offset = spread_offset(idx, freq, total_lines)

        first_departure = START_BASE_MINUTES + offset  # např. 8:02, 8:05...

        # spočítáme první odjezd >= aktuální čas
        if day_minutes <= first_departure:
            next_dep = first_departure
        else:
            k = math.ceil((day_minutes - first_departure) / freq)
            next_dep = first_departure + k * freq

        # převod na absolutní čas v minutách od startu hry
        next_dep_abs = day_start_minutes + next_dep

        # spočítáme délku cestování pro trasu
        travel_minutes = compute_travel_minutes(
            line,
            imp_a=line.from_city.importance,
            imp_b=line.to_city.importance,
            distance_miles=distance_miles,
        )

        # vygenerujeme pár dalších odjezdů této linky
        for i in range(5):
            dep_time = next_dep_abs + i * freq
            while dep_time in used_departure_minutes:
                dep_time += 5  # posuň o 5 minut, aby se časy nekumulovaly
            used_departure_minutes.add(dep_time)
            candidates.append({
                "departure_minutes": dep_time,
                "from_city": city,
                "to_city": line.to_city,
                "line": line,
                "travel_minutes": travel_minutes,
                "distance_units": distance_miles,
            })

    # TO → FROM (vlak z "to_city" směrem zpět do current city)
    for idx, line in enumerate(to_lines):
        freq = line.frequency_minutes or 60
        distance_miles = compute_line_distance_miles(line)
        offset = spread_offset(len(from_lines) + idx, freq, total_lines)
        first_departure = START_BASE_MINUTES + offset

        if day_minutes <= first_departure:
            next_dep = first_departure
        else:
            k = math.ceil((day_minutes - first_departure) / freq)
            next_dep = first_departure + k * freq

        next_dep_abs = day_start_minutes + next_dep

        travel_minutes = compute_travel_minutes(
            line,
            imp_a=line.from_city.importance,
            imp_b=line.to_city.importance,
            distance_miles=distance_miles,
        )

        for i in range(5):
            dep_time = next_dep_abs + i * freq
            while dep_time in used_departure_minutes:
                dep_time += 5
            used_departure_minutes.add(dep_time)
            candidates.append({
                "departure_minutes": dep_time,
                "from_city": city,
                "to_city": line.from_city,
                "line": line,
                "travel_minutes": travel_minutes,
                "distance_units": distance_miles,
            })

    # seřadíme podle času a vezmeme prvních N
    candidates.sort(key=lambda c: c["departure_minutes"])
    return candidates[:limit]

def _get_speed_level(line: TrainLine, imp_a: int, imp_b: int) -> int:
    """Určí rychlostní úroveň vlaku (1–3) podle typu linky a důležitosti měst."""
    line_type = (line.line_type or "").lower() if line else ""

    if line_type == "express":
        return 1  # nejrychlejší
    if line_type in ("intercity", "ic"):
        return 2

    # regionální – pokud vede mezi většími městy, ber to jako úroveň 2, jinak 3
    if imp_a is not None and imp_b is not None:
        lowest = max(imp_a or 3, imp_b or 3)
        if lowest <= 2:
            return 2
    return 3

def compute_travel_minutes(
    line: TrainLine,
    imp_a: int,
    imp_b: int,
    distance_miles: Optional[float] = None,
) -> int:
    """
    Spočítá dobu jízdy v minutách – podle reálné vzdálenosti (míle)
    a rychlostní úrovně vlaku:
      Úroveň 1 = 190 mph, Úroveň 2 = 100 mph, Úroveň 3 = 60 mph.
    """
    if distance_miles is None:
        distance_miles = compute_line_distance_miles(line)
    dist = distance_miles or 0.0
    if dist <= 0:
        return 0  # stejná stanice / fallback

    speed_level = _get_speed_level(line, imp_a, imp_b)
    if speed_level == 1:
        speed_mph = 190
    elif speed_level == 2:
        speed_mph = 100
    else:
        speed_mph = 60

    hours = dist / speed_mph
    raw_minutes = hours * 60.0

    # zaokrouhlení nahoru – ať nejsou 0 min na krátké trasy
    return max(1, int(math.ceil(raw_minutes)))
