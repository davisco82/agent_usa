# seeds/trainlines_seed.py

import math
from models import db
from models.city import City
from models.region import Region
from models.train_line import TrainLine


MIN_NEIGHBORS = 3  # minimální počet sousedních měst pro každé město (změň na 2, když chceš míň)
HUB_NEIGHBORS_ACROSS_REGIONS = 3  # kolik nejbližších hubů v jiných regionech


def _compute_distance(city_a: City, city_b: City) -> float:
    dx = (city_a.px or 0) - (city_b.px or 0)
    dy = (city_a.py or 0) - (city_b.py or 0)
    return math.sqrt(dx * dx + dy * dy)


def _compute_frequency(imp_a: int, imp_b: int) -> int:
    """
    Frekvence podle nejdůležitějšího města z dvojice.
    1 → 15 min
    2 → 30 min
    3 → 90 min
    """
    highest = min(imp_a, imp_b)  # 1 je top
    if highest == 1:
        return 15
    if highest == 2:
        return 30
    return 90


def _compute_line_type(imp_a: int, imp_b: int) -> str:
    """
    express: 1–1 nebo 1–2
    regional: všechno ostatní
    """
    if imp_a == 1 and imp_b == 1:
        return "express"
    if min(imp_a, imp_b) == 1 and max(imp_a, imp_b) == 2:
        return "express"
    return "regional"


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
        print(f"✅ Hotovo, vytvořeno {len(created_pairs)} vlakových linek.")
