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
    Frekvence podle MÉNĚ důležitého města z dvojice.
    1 → 15 min  (1–1)
    2 → 30 min  (1–2, 2–2)
    3 → 90 min  (cokoli s 3)
    """
    lowest = max(imp_a, imp_b)  # 3 = nejméně důležité

    if lowest == 1:
        return 15
    if lowest == 2:
        return 30
    return 90


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
      imp 3: max 5 (snaha 4–5), z toho 1–2 do nejdůležitějších
      imp 2: max 7, z toho 1–2 do nejdůležitějších
      imp 1: max 10, z toho 3–4 do importance 1
    """
    entries = []
    for nid in neighbor_ids:
        other = cities_by_id[nid]
        dist = _compute_distance(city, other)
        entries.append((nid, dist, other.importance))

    entries.sort(key=lambda x: x[1])  # nejbližší první

    imp = city.importance or 3
    if imp == 3:
        max_total = 5
        high_min = 1
        high_max = 2
        high_importances = {1}
    elif imp == 2:
        max_total = 7
        high_min = 1
        high_max = 2
        high_importances = {1}
    else:  # imp == 1
        max_total = 10
        high_min = 3
        high_max = 4
        high_importances = {1}

    selected = set()

    # nejdřív high (importance 1), případně fallback na importance 2 pokud žádný high není a potřebujeme min
    high_candidates = [e for e in entries if e[2] in high_importances]
    for nid, _, _ in high_candidates[:high_max]:
        selected.add(nid)

    if len(selected) < high_min:
        fallback = [e for e in entries if e[2] == 2 and e[0] not in selected]
        for nid, _, _ in fallback:
            selected.add(nid)
            if len(selected) >= high_min:
                break

    # doplň zbytek nejbližšími, dokud nepřekročíme max_total
    for nid, _, _ in entries:
        if len(selected) >= max_total:
            break
        if nid in selected:
            continue
        selected.add(nid)

    # pokud by zbylo moc (teoreticky), zkrať na max_total podle vzdálenosti
    if len(selected) > max_total:
        entries_filtered = [e for e in entries if e[0] in selected]
        entries_filtered.sort(key=lambda x: x[1])
        selected = set(nid for nid, _, _ in entries_filtered[:max_total])

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
