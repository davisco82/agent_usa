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
from typing import Any, Dict, Iterable, List, Optional

from models.city import City
from models.region import Region


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


def _load_city_names(
    region_codes: Optional[Iterable[str]],
    *,
    importance_max: Optional[int] = None,
) -> List[str]:
    if not region_codes:
        return []

    query = City.query.join(Region)
    query = query.filter(Region.code.in_(list(region_codes)))
    if importance_max is not None:
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

    candidates = _load_city_names(
        preferred,
        importance_max=cfg.get("importance_max"),
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


AGENT_TASK_TEMPLATES = [
    {
        "id": "mission-city-intel-01",
        "title": "První stopa: {entry_city}",
        "location": "{entry_city} – Záchytné středisko",
        "summary": (
            "Agent má vyrazit do {entry_city}, aby rozkryl první indicie o podivné aktivitě v regionu."
        ),
        "description": (
            "Z centrály přišla zpráva o nestandardních radarových odchylkách, které se objevují "
            "v okolí jednoho z nejbližších epicenter formující se mlhy. Agent je vyslán do města "
            "{entry_city}, aby navštívil místní záchytné středisko a získal detaily o posledních "
            "měřeních.\n\n"
            "Klíčové informace drží biolog **Dr. Elias Rook**, který se aktuálně nachází ve městě "
            "{doctor_city}. Rook má svědectví o zvláštní anomálii – periodické pulzy energie, které "
            "nesouhlasí s žádnými známými přírodními jevy.\n\n"
            "Úkolem agenta je dorazit do {entry_city}, najít Dr. Rooka v {doctor_city}, vyslechnout "
            "ho a připravit další kroky vyšetřování."
        ),
        "objectives": [
            "Navštiv {entry_city} a prohledej Záchytné středisko pro první indicie. (50 XP)",
            "Najdi Dr. Eliase Rooka ve městě {doctor_city} a získej jeho důvěru. (50 XP)",
            "Zjisti přesný výskyt popisované anomálie a odnes kompletní data. (50 XP)",
        ],
        "reward": "50 XP za splněnou podčást (celkem 150 XP) + zpřístupnění další dějové linie",
        "status": "Probíhá",
        "priority": "Vysoká",
        "eta": "2–3 hodiny",
        "progress": 0.0,
        "objective_rewards": [10, 20, 30],
        "objective_triggers": [
            {"type": "visit_city", "city_name": "{entry_city}"},
            {"type": "visit_city", "city_name": "{doctor_city}"},
            {"type": "manual", "action": "report_anomaly"},
        ],
        "dynamic_placeholders": {
            "entry_city": {
                "preferred_regions": ["southwest"],
                "allow_agent_region_fallback": True,
                "importance_max": 2,
                "fallback_names": ["Albuquerque", "Santa Fe", "Phoenix"],
            },
            "doctor_city": {
                "preferred_regions": ["southwest"],
                "allow_agent_region_fallback": True,
                "importance_max": 2,
                "fallback_names": ["Santa Fe", "Phoenix", "Albuquerque"],
                "avoid_duplicates_of": ["entry_city"],
            },
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
        replacements: Dict[str, str] = {}
        for key, cfg in template.get("dynamic_placeholders", {}).items():
            value = _resolve_placeholder_value(cfg, agent_region_code, replacements, random_generator)
            if value is not None:
                replacements[key] = value

        resolved_task: Dict[str, Any] = {}
        for field, value in template.items():
            if field == "dynamic_placeholders":
                continue
            resolved_task[field] = _format_template_value(value, replacements)

        resolved_tasks.append(resolved_task)

    return resolved_tasks
