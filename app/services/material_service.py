from __future__ import annotations

from datetime import datetime, timedelta
import random

from app.models.city import City


INFO_WEIGHTS = {
    1: [(0, 75), (1, 25)],
    2: [(0, 25), (1, 75)],
    3: [(0, 25), (1, 50), (2, 25)],
}

MARKET_RULES = {
    1: {"qty_min": 0, "qty_max": 5, "price_min": 200, "price_max": 250},
    2: {"qty_min": 0, "qty_max": 3, "price_min": 150, "price_max": 230},
    3: {"qty_min": 0, "qty_max": 2, "price_min": 100, "price_max": 180},
}


def _refresh_anchor(now: datetime) -> datetime:
    anchor = now.replace(hour=6, minute=0, second=0, microsecond=0)
    if now < anchor:
        anchor -= timedelta(days=1)
    return anchor


def _pick_weighted(options: list[tuple[int, int]], rng: random.Random) -> int:
    total = sum(weight for _, weight in options)
    if total <= 0:
        return options[-1][0]
    roll = rng.randint(1, total)
    running = 0
    for value, weight in options:
        running += weight
        if roll <= running:
            return value
    return options[-1][0]


def _pick_price(min_price: int, max_price: int, rng: random.Random) -> int:
    options = list(range(min_price, max_price + 1, 10))
    return rng.choice(options)


def maybe_refresh_material_state(city: City, now: datetime | None = None, rng: random.Random | None = None) -> bool:
    now = now or datetime.now()
    rng = rng or random.Random()
    anchor = _refresh_anchor(now)
    last_refresh = city.material_refreshed_at
    if last_refresh and last_refresh >= anchor:
        return False

    importance = city.importance or 3
    info_weights = INFO_WEIGHTS.get(importance, INFO_WEIGHTS[3])
    info_qty = _pick_weighted(info_weights, rng)

    market_rule = MARKET_RULES.get(importance, MARKET_RULES[3])
    market_qty = rng.randint(market_rule["qty_min"], market_rule["qty_max"])
    market_price = (
        _pick_price(market_rule["price_min"], market_rule["price_max"], rng)
        if market_qty > 0
        else None
    )

    city.material_info_qty = info_qty
    city.market_material_qty = market_qty
    city.market_material_price = market_price
    city.material_refreshed_at = now
    return True


def serialize_city_material_state(city: City) -> dict:
    return {
        "city_id": city.id,
        "info_qty": city.material_info_qty,
        "market_qty": city.market_material_qty,
        "market_price": city.market_material_price,
        "refreshed_at": city.material_refreshed_at.isoformat() if city.material_refreshed_at else None,
    }
