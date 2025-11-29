# seeds/trainlines_seed.py

import math
from models import db
from models.city import City
from models.region import Region
from models.train_line import TrainLine


MIN_NEIGHBORS = 4  # minimální počet sousedních měst pro každé město (změň na 2, když chceš míň)
HUB_NEIGHBORS_ACROSS_REGIONS = 3  # kolik nejbližších hubů v jiných regionech


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
      imp 3:
        - 2 spoje do importance 1
        - 3–5 spojů do nejbližších importance 2 nebo 3
      imp 2:
        - 2–3 spoje do importance 1
        - 3–5 spojů do nejbližších importance 2 nebo 3
      imp 1:
        - 3–5 spojů do importance 1
        - 4–7 spojů do importance 2 nebo 3
    """
    entries = []
    for nid in neighbor_ids:
        other = cities_by_id[nid]
        dist = _compute_distance(city, other)
        entries.append((nid, dist, other.importance))

    entries.sort(key=lambda x: x[1])  # nejbližší první

    imp = city.importance or 3
    if imp == 3:
        max_total = 7
        hub_min = 2
        hub_max = 2
        peer_min = 3
        peer_max = 5
        peer_importances = {2, 3}
    elif imp == 2:
        max_total = 8
        hub_min = 2
        hub_max = 3
        peer_min = 3
        peer_max = 5
        peer_importances = {2, 3}
    else:  # imp == 1
        max_total = 12
        hub_min = 3
        hub_max = 5
        peer_min = 4
        peer_max = 7
        peer_importances = {2, 3}

    selected = set()

    def _take_candidates(candidates, min_needed, max_needed):
        """Vezmi kandidáty podle vzdálenosti až do maxima, při nedostatku vezmi, co je k dispozici."""
        taken = 0
        for nid, _, _ in candidates:
            if len(selected) >= max_total or taken >= max_needed:
                break
            selected.add(nid)
            taken += 1

        if taken < min_needed:
            for nid, _, _ in candidates:
                if len(selected) >= max_total or taken >= min_needed:
                    break
                if nid in selected:
                    continue
                selected.add(nid)
                taken += 1

        return taken

    hub_candidates = [e for e in entries if e[2] == 1]
    _take_candidates(hub_candidates, hub_min, hub_max)

    peer_candidates = [e for e in entries if e[2] in peer_importances and e[0] not in selected]
    _take_candidates(peer_candidates, peer_min, peer_max)

    # doplň nejbližšími, pokud nesplňujeme minimální počet (napříč kategoriemi)
    desired_min_total = min(max_total, hub_min + peer_min)
    if len(selected) < desired_min_total:
        for nid, _, _ in entries:
            if len(selected) >= desired_min_total or len(selected) >= max_total:
                break
            selected.add(nid)

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

        def add_line(city_a: City, city_b: City):
            """Bezpečně přidá linku (neduplicitně) a aktualizuje adjacency."""
            if city_a.id == city_b.id:
                return

            key = tuple(sorted((city_a.id, city_b.id)))
            if key in created_pairs:
                return
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

        db.session.commit()
        print(f"  ➜ Ořežu linky podle důležitosti měst...")

        to_remove = set()
        for city in cities:
            allowed = _select_neighbors(city, neighbors[city.id], cities_by_id)
            for nid in list(neighbors[city.id]):
                if nid not in allowed:
                    pair = tuple(sorted((city.id, nid)))
                    to_remove.add(pair)

        removed_count = 0
        for pair in to_remove:
            line = lines_by_pair.get(pair)
            if line:
                db.session.delete(line)
                removed_count += 1

        db.session.commit()
        print(f"✅ Hotovo, vytvořeno {len(created_pairs) - removed_count} vlakových linek (odebráno {removed_count}).")
