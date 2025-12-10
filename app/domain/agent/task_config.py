# game/agent/task_config.py
"""
Konfigurace příběhových / operativních úkolů pro UI agenta.

Každý úkol je definovaný jako šablona s možností dynamicky vkládat názvy
míst podle regionu agenta. Textová pole (title, summary, location, description,
objectives, reward) mohou obsahovat placeholdery ve formátu {placeholder}. Ty
se nahradí hodnotami získanými z `dynamic_placeholders`.

Pole, která UI očekává na každém úkolu:
    - id (str): unikátní klíč, podle kterého se úkol vybírá.
    - title (str): název mise.
    - summary (str): krátký popis do karty.
    - location (str): kde se úkol odehrává (volné pole).
    - description (str): detailní briefing.
    - objectives (list[str]): jednotlivé kroky operace.
    - reward (str): textová informace o odměně.
    - status (str): aktuální stav („Probíhá“, „Čeká na potvrzení“…).
    - priority (str): slovní hodnocení priority.
    - eta (str): odhad doby dokončení.
    - progress (float 0–1): procenta na progress baru.
    - objective_rewards (list[int]): XP/odměny za každý krok.
    - objective_triggers (list[dict]): metadata pro auto-vyhodnocení kroků (např. návštěva města).
"""

from __future__ import annotations

import random
from typing import Any, Dict, Iterable, List, Optional, Tuple

from app.models.city import City
from app.models.region import Region


class _SafeFormatDict(dict):
    """Vrací původní placeholder, pokud není nalezen v replacements."""

    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def _format_template_value(value: Any, replacements: Dict[str, str]) -> Any:
    if isinstance(value, str):
        return value.format_map(_SafeFormatDict(replacements))
    if isinstance(value, list):
        return [_format_template_value(item, replacements) for item in value]
    if isinstance(value, dict):
        return {key: _format_template_value(val, replacements) for key, val in value.items()}
    return value


def _all_region_codes(exclude: Optional[str] = None) -> List[str]:
    query = Region.query
    if exclude:
        query = query.filter(Region.code != exclude)
    return [region.code for region in query.all()]


def _load_city_names(
    region_codes: Optional[Iterable[str]],
    *,
    importance_max: Optional[int] = None,
    importance_exact: Optional[int] = None,
    exclude_region_code: Optional[str] = None,
) -> List[str]:
    if not region_codes and not exclude_region_code:
        return []

    query = City.query.join(Region)
    if region_codes:
        query = query.filter(Region.code.in_(list(region_codes)))
    if exclude_region_code:
        query = query.filter(Region.code != exclude_region_code)
    if importance_exact is not None:
        query = query.filter(City.importance == importance_exact)
    elif importance_max is not None:
        query = query.filter(City.importance <= importance_max)
    return [city.name for city in query.all()]


def _resolve_placeholder_value(
    cfg: Dict[str, Any],
    agent_region_code: Optional[str],
    replacements: Dict[str, str],
    rng: random.Random,
) -> Optional[str]:
    preferred = list(cfg.get("preferred_regions") or [])
    overrides = cfg.get("agent_region_overrides") or {}
    fallback_regions = cfg.get("fallback_regions") or []

    if agent_region_code and agent_region_code in overrides:
        preferred = overrides[agent_region_code]
    elif cfg.get("allow_agent_region_fallback") and agent_region_code and agent_region_code not in preferred:
        preferred = [agent_region_code]
    elif not preferred and fallback_regions:
        preferred = fallback_regions
    elif not preferred and cfg.get("use_all_regions"):
        preferred = _all_region_codes(
            agent_region_code if cfg.get("exclude_agent_region") else None
        )

    candidates = _load_city_names(
        preferred,
        importance_max=cfg.get("importance_max"),
        importance_exact=cfg.get("importance_exact"),
        exclude_region_code=agent_region_code if cfg.get("exclude_agent_region") else None,
    )

    if not candidates:
        fallback_names = cfg.get("fallback_names") or []
        candidates = list(fallback_names)

    default_value = cfg.get("default")
    if not candidates:
        return default_value

    value = rng.choice(candidates)
    avoid_keys = cfg.get("avoid_duplicates_of") or []
    for key in avoid_keys:
        if replacements.get(key) == value:
            unique_candidates = [c for c in candidates if c != value]
            if unique_candidates:
                value = rng.choice(unique_candidates)
            break

    return value or default_value


def build_template_from_placeholders(template: Dict[str, Any], replacements: Dict[str, Any]) -> Dict[str, Any]:
    """Vrátí kopii templatu s aplikovanými placeholders."""
    resolved: Dict[str, Any] = {}
    for field, value in template.items():
        if field == "dynamic_placeholders":
            continue
        resolved[field] = _format_template_value(value, replacements)
    return resolved


def resolve_template_for_agent(
    template: Dict[str, Any],
    agent_region_code: Optional[str] = None,
    rng: Optional[random.Random] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    generator = rng or random
    replacements: Dict[str, Any] = {}
    for key, cfg in template.get("dynamic_placeholders", {}).items():
        value = _resolve_placeholder_value(cfg, agent_region_code, replacements, generator)
        if value is not None:
            replacements[key] = value
    resolved = build_template_from_placeholders(template, replacements)
    return resolved, replacements


AGENT_TASK_TEMPLATES = [
    {
        "id": "mission-rook-intro-01",
        "title": "Setkání s Dr. Rookem ve městě {rook_city}",
        "location": "{rook_city} – Místní laboratoř",
        "summary": (
            "Cestuj do města {rook_city} a setkej se s Dr. Rookem. Zjisti detaily o anomálii "
            "a naplánujte společně terénní měření."
        ),
        "description": (
            "Ve městě {rook_city} působí vědec Dr. Elias Rook, který hlásil první známky nestability "
            "v energetických pulzech blížící se mlhy. Je nutné jej navštívit a zjistit detaily.\n\n"
            "Po příjezdu ti Dr. Rook vysvětluje, že nedaleko se nachází město {target_city}, které je již "
            "částečně zasažené mlhou. Infrastruktura kolabuje a měření nelze provést bez vlastní energie.\n\n"
            "Dr. Rook navrhuje společnou výpravu do postižené oblasti, ale nejprve je potřeba získat "
            "startovní vybavení a vyrobit přenosný energetický modul."
        ),
        "objectives": [
            "Cestuj do {rook_city} a najdi laboratoř Dr. Rooka. (15 XP)",
            "Vyslechni Dr. Rooka a zjisti detaily o anomálii. (15 XP)",
        ],
        "reward": "30 XP",
        "status": "Probíhá",
        "priority": "Vysoká",
        "eta": "1–2 hodiny",
        "progress": 0.0,
        "objective_rewards": [15, 15],
        "objective_triggers": [
            {"type": "visit_city", "city_name": "{rook_city}"},
            {"type": "talk_to_npc", "npc": "Dr. Rook"},
        ],
        "dynamic_placeholders": {
            "rook_city": {
                "preferred_regions": [],
                "importance_exact": 1,
                "exclude_agent_region": True,
                "use_all_regions": True,
            },
            "target_city": {
                "preferred_regions": [],
                "importance_min": 1,
                "importance_max": 2,
                "exclude_agent_region": False,
                "use_all_regions": True,
            }
        },
    },
    {
        "id": "mission-equipment-01",
        "title": "Získej vybavení a vyrob přenosnou energii",
        "location": "{rook_city} → Centrála → Trh",
        "summary": (
            "Získej základní výbavu z centrály, zakup výrobní nástroje na trhu "
            "a vyrob svůj první Energy Module."
        ),
        "description": (
            "Dr. Rook tě požádal, abys zajistil energii nutnou k měření v městě {target_city}. "
            "To vyžaduje startovní vybavení, výrobní nástroje a výrobu prvního energetického modulu.\n\n"
            "V centrále získáš základní gear. Na trhu musíš zakoupit Energy Generator a materiály. "
            "Použitím generátoru následně vytvoříš svůj první Energy Module, který bude sloužit jako "
            "zdroj energie pro měření v zasaženém městě."
        ),
        "objectives": [
            "Navštiv centrálu a vyzvedni Startovní Toolkit. (10 XP)",
            "Navštiv trh a zakup Energy Generator. (10 XP)",
            "Doplň materiál potřebný k výrobě (+10 MATERIAL). (10 XP)",
            "Vyrob svůj první Energy Module. (20 XP)",
        ],
        "reward": "50 XP, +1 Energy Module, odemknutí měření",
        "status": "Čeká na dokončení",
        "priority": "Střední",
        "eta": "1–2 hodiny",
        "progress": 0.0,
        "objective_rewards": [10, 10, 10, 20],
        "objective_triggers": [
            {"type": "visit_city", "city_name": "HQ"},
            {"type": "buy_item", "item": "energy_generator"},
            {"type": "gain_material", "amount": 10},
            {"type": "craft_item", "item": "energy_module"},
        ],
        "dynamic_placeholders": {
            "rook_city": {
                "preferred_regions": [],
                "importance_exact": 1,
                "use_all_regions": True,
                "exclude_agent_region": False,
            },
            "target_city": {
                "preferred_regions": [],
                "importance_min": 1,
                "importance_max": 2,
                "exclude_agent_region": False,
                "use_all_regions": True,
            }
        },
    },
    {
        "id": "mission-measurement-01",
        "title": "První měření anomálie ve městě {target_city}",
        "location": "{target_city} – Zasažená zóna",
        "summary": (
            "Vydej se s Dr. Rookem do města {target_city}, použij Energy Module "
            "a aktivuj Pulse Detector k prvnímu měření mlhy."
        ),
        "description": (
            "Město {target_city} je již částečně pohlceno mlhou a trpí energetickými výpadky. "
            "Aby bylo možné provést měření, musíš doručit vlastní přenosný zdroj energie.\n\n"
            "Dr. Rook tě doprovodí k místu měření, kde společně aktivujete Pulse Detector. "
            "Je to první real-time měření anomálie a jeho výsledky budou klíčové pro další operace."
        ),
        "objectives": [
            "Cestuj do města {target_city} s Energy Module. (15 XP)",
            "Setkej se s Dr. Rookem v postižené oblasti. (15 XP)",
            "Použij Energy Module k napájení zařízení. (20 XP)",
            "Aktivuj Pulse Detector a proveď měření. (30 XP)",
        ],
        "reward": "80 XP, +40 DATA",
        "status": "Čeká na dokončení",
        "priority": "Vysoká",
        "eta": "1–2 hodiny",
        "progress": 0.0,
        "objective_rewards": [15, 15, 20, 30],
        "objective_triggers": [
            {"type": "visit_city", "city_name": "{target_city}"},
            {"type": "meet_npc", "npc": "Dr. Rook"},
            {"type": "use_item", "item": "energy_module"},
            {"type": "use_module", "module": "pulse_detector"},
        ],
        "dynamic_placeholders": {
            "target_city": {
                "preferred_regions": [],
                "importance_min": 1,
                "importance_max": 2,
                "exclude_agent_region": False,
                "use_all_regions": True,
            }
        },
    },
]



def get_agent_tasks(agent_region_code: Optional[str] = None, *, rng: Optional[random.Random] = None) -> List[Dict[str, Any]]:
    """
    Vrátí seznam úkolů s doplněnými dynamickými poli podle regionu agenta.

    Args:
        agent_region_code: kód regionu aktuálního města agenta (např. "northeast").
        rng: volitelný Random, pro deterministické testy.
    """
    random_generator = rng or random
    resolved_tasks: List[Dict[str, Any]] = []

    for template in AGENT_TASK_TEMPLATES:
        resolved_task, _ = resolve_template_for_agent(
            template,
            agent_region_code=agent_region_code,
            rng=random_generator,
        )
        resolved_tasks.append(resolved_task)

    return resolved_tasks
