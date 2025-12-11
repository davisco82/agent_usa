# seeds/trainlines_seed.py

import math
from app.extensions import db
from app.models.city import City
from app.models.region import Region
from app.models.train_line import TrainLine


MIN_CONNECTIONS_PER_CITY = 5
MAX_CONNECTIONS_PER_CITY = 12
MIN_NEIGHBORS = MIN_CONNECTIONS_PER_CITY  # každé město dostane alespoň 5 sousedů ještě před ořezem
HUB_NEIGHBORS_ACROSS_REGIONS = 3  # kolik nejbližších hubů v jiných regionech
TRIM_LINES_BY_IMPORTANCE = True  # nech původní logiku jen pokud chceš síť prořezat


def _compute_distance(city_a: City, city_b: City) -> float:
    """
    Vrátí vzdálenost v mílích mezi dvěma městy.
    Primárně používá GPS, fallback na px/py (pro případ, že GPS chybí).
    """
    # 1.18 (realismus) * 1.20 (trať není vzdušná čára) = 1.416
    SCALE = 1.416
    if (
        city_a.lat is not None and city_a.lon is not None
        and city_b.lat is not None and city_b.lon is not None
    ):
        R = 3958.8  # Earth radius in miles
        lat1, lon1 = math.radians(city_a.lat), math.radians(city_a.lon)
        lat2, lon2 = math.radians(city_b.lat), math.radians(city_b.lon)
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c * SCALE

    dx = (city_a.px or 0) - (city_b.px or 0)
    dy = (city_a.py or 0) - (city_b.py or 0)
    return math.sqrt(dx * dx + dy * dy) * SCALE


def _compute_frequency(imp_a: int, imp_b: int) -> int:
    """
    Frekvence podle kombinace důležitostí (symetricky).
      1–1: 30 min
      1–2: 40 min
      1–3: 60 min
      2–2: 60 min
      2–3: 75 min
      3–3: 90 min
    """
    pair = tuple(sorted((imp_a or 3, imp_b or 3)))

    freq_map = {
        (1, 1): 30,
        (1, 2): 40,
        (1, 3): 60,
        (2, 2): 60,
        (2, 3): 75,
        (3, 3): 90,
    }

    return freq_map.get(pair, 90)


def _compute_line_type(imp_a: int, imp_b: int) -> str:
    """
    express: 1–1 nebo 1–2
    regional: 1–3, 2–2
    local: cokoliv s importance 3 (kromě 1–3, které bereme jako regional)
    """
    low = max(imp_a, imp_b)
    high = min(imp_a, imp_b)

    if high == 1 and low in (1, 2):
        return "express"
    if low == 3:
        # 1–3 nebo 2–3 považuj za local
        return "local"
    return "regional"


def _select_neighbors(city: City, neighbor_ids, cities_by_id) -> set:
    """
    Omezí počet sousedů podle importance města.
    Globální pravidla: min 5 spojů, max 12 spojů pro každé město (po ořezu).
      imp 3:
        - min 5 spojů celkem
        - alespoň 2 spoje do měst s vyšší úrovní (importance 1 nebo 2)
      imp 2:
        - min 7 spojů celkem
        - alespoň 1 spoj do města importance 1
      imp 1:
        - max 10 spojů celkem (min držíme na vyšší z MIN_NEIGHBORS a 7)
        - 2–3 spoje do dalších měst importance 1
    """
    entries = []
    for nid in neighbor_ids:
        other = cities_by_id[nid]
        dist = _compute_distance(city, other)
        entries.append((nid, dist, other.importance))

    entries.sort(key=lambda x: x[1])  # nejbližší první

    imp = city.importance or 3
    if imp == 3:
        min_total = max(MIN_NEIGHBORS, 5)
        max_total = min(MAX_CONNECTIONS_PER_CITY, 7)
        requirements = [{"importances": {1, 2}, "min": 2}]
        per_importance_caps = {}
    elif imp == 2:
        min_total = max(MIN_NEIGHBORS, 7)
        max_total = min(MAX_CONNECTIONS_PER_CITY, 9)
        requirements = [{"importances": {1}, "min": 1}]
        per_importance_caps = {}
    else:  # imp == 1
        min_total = max(MIN_NEIGHBORS, 7)
        max_total = MAX_CONNECTIONS_PER_CITY
        requirements = [{"importances": {1}, "min": 2}]
        per_importance_caps = {1: 3}

    selected = set()
    per_importance_counts = {1: 0, 2: 0, 3: 0}

    def _try_add(entry):
        nid, _, other_imp = entry
        if nid in selected or len(selected) >= max_total:
            return False

        max_cap = per_importance_caps.get(other_imp)
        if max_cap is not None and per_importance_counts.get(other_imp, 0) >= max_cap:
            return False

        selected.add(nid)
        per_importance_counts[other_imp] = per_importance_counts.get(other_imp, 0) + 1
        return True

    for requirement in requirements:
        taken = 0
        desired_importances = requirement["importances"]
        min_needed = requirement.get("min", 0)
        max_allowed = requirement.get("max")

        for entry in entries:
            if entry[2] not in desired_importances:
                continue
            if not _try_add(entry):
                continue
            taken += 1
            if (max_allowed is not None and taken >= max_allowed) or len(selected) >= max_total:
                break

        # pokud se nepodařilo splnit min kvůli kapacitám, nic dalšího s tím neuděláme –
        # zbytek doplníme nejbližšími městy v další fázi.
        if len(selected) < min_needed:
            # přidej další města z požadovaných úrovní (byť to znamená překročit max)
            for entry in entries:
                if entry[2] not in desired_importances:
                    continue
                if _try_add(entry):
                    taken += 1
                    if taken >= min_needed:
                        break

        if len(selected) >= max_total:
            break

    desired_total = min_total
    if len(selected) < desired_total:
        for entry in entries:
            if len(selected) >= desired_total:
                break
            _try_add(entry)

    return selected


def register_trainlines_commands(app):

    @app.cli.command("generate-trainlines")
    def generate_trainlines():
        """Auto-generate train lines based on city regions and importance."""
        print("🚂 Generuji vlakové linky...")

        # 0) Smazat existující linky
        TrainLine.query.delete()
        db.session.commit()

        cities = City.query.all()
        if not cities:
            print("❌ Žádná města v DB. Nejprve spusť: flask seed-cities")
            return

        # Indexy
        cities_by_id = {c.id: c for c in cities}
        regions_map = {}
        for city in cities:
            regions_map.setdefault(city.region_id, []).append(city)

        # pro kontrolu duplicit a stupně vrcholů
        created_pairs = set()          # { (min_id, max_id) }
        neighbors = {c.id: set() for c in cities}  # id → set sousedů

        lines_by_pair = {}

        def add_line(city_a: City, city_b: City) -> bool:
            """Bezpečně přidá linku (neduplicitně) a aktualizuje adjacency."""
            if city_a.id == city_b.id:
                return False

            key = tuple(sorted((city_a.id, city_b.id)))
            if key in created_pairs:
                return False
            created_pairs.add(key)

            dist = _compute_distance(city_a, city_b)
            freq = _compute_frequency(city_a.importance, city_b.importance)
            line_type = _compute_line_type(city_a.importance, city_b.importance)

            line = TrainLine(
                from_city_id=city_a.id,
                to_city_id=city_b.id,
                distance_units=dist,
                frequency_minutes=freq,
                line_type=line_type,
                is_active=True,
            )
            db.session.add(line)
            lines_by_pair[key] = line

            neighbors[city_a.id].add(city_b.id)
            neighbors[city_b.id].add(city_a.id)
            return True

        # ------------------------------------------------------
        # 1) HUB → všechna města v jeho regionu
        # ------------------------------------------------------
        print("  ➜ Generuji regionální hub linky...")
        for region_id, region_cities in regions_map.items():
            hubs = [c for c in region_cities if c.importance == 1]
            if not hubs:
                continue

            for hub in hubs:
                for city in region_cities:
                    if city.id != hub.id:
                        add_line(hub, city)

        # ------------------------------------------------------
        # 2) HUB ↔ nejbližší HUBY v jiných regionech
        # ------------------------------------------------------
        print("  ➜ Generuji meziregionální hub ↔ hub linky...")
        all_hubs = [c for c in cities if c.importance == 1]

        for hub in all_hubs:
            candidates = [c for c in all_hubs if c.region_id != hub.region_id]
            if not candidates:
                continue

            candidates_sorted = sorted(
                candidates, key=lambda x: _compute_distance(hub, x)
            )
            for other_hub in candidates_sorted[:HUB_NEIGHBORS_ACROSS_REGIONS]:
                add_line(hub, other_hub)

        # ------------------------------------------------------
        # 3) Každé město má alespoň N sousedů (globálně dle vzdálenosti)
        # ------------------------------------------------------
        print(f"  ➜ Zajišťuji min. {MIN_NEIGHBORS} sousedy pro každé město...")

        all_cities_list = list(cities)

        for city in all_cities_list:
            while len(neighbors[city.id]) < MIN_NEIGHBORS:
                # najít nejbližší město, které ještě není soused
                candidates = [
                    other for other in all_cities_list
                    if other.id != city.id and other.id not in neighbors[city.id]
                ]
                if not candidates:
                    break  # už není koho přidat

                candidates_sorted = sorted(
                    candidates, key=lambda x: _compute_distance(city, x)
                )
                nearest = candidates_sorted[0]
                add_line(city, nearest)

        removed_count = 0
        if TRIM_LINES_BY_IMPORTANCE:
            db.session.commit()
            print(f"  ➜ Ořežu linky podle důležitosti měst...")

            to_remove = set()
            for city in cities:
                allowed = _select_neighbors(city, neighbors[city.id], cities_by_id)
                for nid in list(neighbors[city.id]):
                    if nid not in allowed:
                        pair = tuple(sorted((city.id, nid)))
                        to_remove.add(pair)

            for pair in to_remove:
                line = lines_by_pair.get(pair)
                if line:
                    from_id = line.from_city_id
                    to_id = line.to_city_id
                    db.session.delete(line)
                    removed_count += 1
                    lines_by_pair.pop(pair, None)
                    created_pairs.discard(pair)
                    neighbors[from_id].discard(to_id)
                    neighbors[to_id].discard(from_id)

            db.session.commit()
        else:
            db.session.commit()
            print("  ➜ Přeskakuji ořez linek, nechávám plnou hustotu.")

        def _find_min_candidate(source_city: City):
            candidates = sorted(
                (
                    other for other in all_cities_list
                    if other.id != source_city.id and other.id not in neighbors[source_city.id]
                ),
                key=lambda other: _compute_distance(source_city, other),
            )
            for other in candidates:
                if len(neighbors[other.id]) >= MAX_CONNECTIONS_PER_CITY:
                    continue
                return other
            return None

        print("  ➜ Dorovnávám města pod minimem spojů...")
        min_topups = 0
        stuck_cities = []
        for city in all_cities_list:
            while len(neighbors[city.id]) < MIN_CONNECTIONS_PER_CITY:
                candidate = _find_min_candidate(city)
                if not candidate:
                    stuck_cities.append(city.name)
                    break
                if not add_line(city, candidate):
                    break
                min_topups += 1

        if min_topups:
            db.session.commit()

        if stuck_cities:
            print(f"  ⚠️ Nepodařilo se dorovnat minima pro: {', '.join(sorted(set(stuck_cities)))} (žádní dostupní kandidáti pod maximem).")

        final_count = TrainLine.query.count()
        print(f"✅ Hotovo, vytvořeno {final_count} vlakových linek (odebráno {removed_count}, doplněno {min_topups}).")
