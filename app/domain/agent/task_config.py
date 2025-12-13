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
from app.models.train_line import TrainLine
from sqlalchemy import or_


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
    include_city_ids: Optional[Iterable[int]] = None,
) -> List[str]:
    if not region_codes and not exclude_region_code and not include_city_ids:
        return []

    query = City.query.join(Region)

    if include_city_ids is not None:
        ids = list(include_city_ids)
        if not ids:
            return []
        query = query.filter(City.id.in_(ids))

    if region_codes:
        query = query.filter(Region.code.in_(list(region_codes)))
    if exclude_region_code:
        query = query.filter(Region.code != exclude_region_code)
    if importance_exact is not None:
        query = query.filter(City.importance == importance_exact)
    elif importance_max is not None:
        query = query.filter(City.importance <= importance_max)
    return [city.name for city in query.all()]


def _get_city_by_name(city_name: Optional[str]) -> Optional[City]:
    if not city_name:
        return None
    return City.query.filter(City.name == city_name).first()


def _resolve_placeholder_value(
    cfg: Dict[str, Any],
    agent_region_code: Optional[str],
    replacements: Dict[str, str],
    rng: random.Random,
    *,
    agent_city: Optional[City] = None,
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

    include_city_ids: Optional[List[int]] = None
    source = cfg.get("source")
    if source == "agent_city":
        if agent_city:
            include_city_ids = [agent_city.id]
        else:
            include_city_ids = None

    connected_placeholder = cfg.get("connected_to_placeholder")
    if connected_placeholder:
        anchor_name = replacements.get(connected_placeholder)
        anchor_city = _get_city_by_name(anchor_name)
        if anchor_city:
            lines = (
                TrainLine.query.filter(
                    TrainLine.is_active == True,
                    or_(
                        TrainLine.from_city_id == anchor_city.id,
                        TrainLine.to_city_id == anchor_city.id,
                    ),
                ).all()
            )
            neighbor_ids = set()
            for line in lines:
                if line.from_city_id == anchor_city.id:
                    neighbor_ids.add(line.to_city_id)
                else:
                    neighbor_ids.add(line.from_city_id)
            if include_city_ids is None:
                include_city_ids = list(neighbor_ids)
            else:
                include_city_ids = [cid for cid in include_city_ids if cid in neighbor_ids]

    candidates = _load_city_names(
        preferred,
        importance_max=cfg.get("importance_max"),
        importance_exact=cfg.get("importance_exact"),
        exclude_region_code=agent_region_code if cfg.get("exclude_agent_region") else None,
        include_city_ids=include_city_ids,
    )

    if source == "agent_city" and agent_city and agent_city.name and not candidates:
        candidates = [agent_city.name]

    exclusion_values = set()
    if cfg.get("exclude_agent_city") and agent_city and agent_city.name:
        exclusion_values.add(agent_city.name)

    if connected_placeholder and replacements.get(connected_placeholder):
        exclusion_values.add(replacements[connected_placeholder])

    for key in cfg.get("avoid_duplicates_of") or []:
        value = replacements.get(key)
        if value:
            exclusion_values.add(value)

    extra_excluded = cfg.get("exclude_names") or []
    exclusion_values.update(extra_excluded)

    if exclusion_values:
        candidates = [c for c in candidates if c not in exclusion_values]

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
    *,
    agent_city: Optional[City] = None,
    rng: Optional[random.Random] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    generator = rng or random
    replacements: Dict[str, Any] = {}
    for key, cfg in template.get("dynamic_placeholders", {}).items():
        value = _resolve_placeholder_value(
            cfg,
            agent_region_code,
            replacements,
            generator,
            agent_city=agent_city,
        )
        if value is not None:
            replacements[key] = value
    resolved = build_template_from_placeholders(template, replacements)
    return resolved, replacements


AGENT_TASK_TEMPLATES = [
    {
        "id": "mission-rook-intro-01",
        "title": "Nový případ ve městě {rook_city}",
        "location": "{rook_city} – Místní laboratoř",
        "summary": (
            "Byl jsi vyslán do města {rook_city}, kde vědec Dr. Rook zaznamenal "
            "neznámou energetickou anomálii. Tvým úkolem je zjistit, co objevil, "
            "a rozhodnout o dalším postupu."
        ),
        "description": (
            "Z centrály přichází jasný rozkaz: najít Dr. Eliase Rooka. "
            "Jeho zprávy o nestabilní mlze a energetických výpadcích "
            "byly natolik znepokojivé, že byl případ předán tobě, agente\n\n"
            "V laboratoři v {rook_city} na Tebe Dr. Rook čeká. Pospěš si!\n\n"
            "Hodně štěstí!"
        ),
        "objectives": [
            "Cestuj do {rook_city} a najdi laboratoř Dr. Rooka. (15 XP)",
            "Vyslechni Dr. Rooka a převezmi tento případ. (15 XP)",
        ],
        "reward": "30 XP",
        "status": "Probíhá",
        "priority": "Vysoká",
        "eta": "24 hodin",
        "progress": 0.0,
        "objective_rewards": [15, 15],
        "objective_triggers": [
            {"type": "visit_city", "city_name": "{rook_city}"},
            {"type": "talk_to_npc", "npc": "Dr. Rook"},
        ],
        "story_dialogs": [
            {
                "panel": "lab",
                "objective_index": 1,
                "requires_completed_indices": [0],
                "requires_agent_in_city_placeholder": "rook_city",
                "button_label": "Brífink Dr. Rooka",
                "title": "Brífink Dr. Rooka",
                "body": (
                    "„Dobře, agente… to, co vám teď ukážu, jsem zatím nikomu neposílal.“\n\n"
                    "Dr. Rook přepne projekci a na obrazovce se rozběhnou nestabilní křivky.\n"
                    "„Ty pulzy se objevují vždy těsně předtím, než se mlha zahustí. Nejde jen o ztrátu energie — "
                    "mlha ji aktivně narušuje. Jako by… ji rozkládala.“\n\n"
                    "Na chvíli se odmlčí.\n\n"
                    "„Zkoušel jsem tam dostat standardní měřicí zařízení. Selhala během několika sekund. "
                    "Všechno, co není energeticky izolované, je v té zóně nepoužitelné.“\n\n"
                    "„Pokud chceme provést skutečné měření přímo v terénu, budeme potřebovat vlastní zdroj energie. "
                    "Něco přenosného. Něco, co dokáže udržet stabilní výkon i v přítomnosti mlhy.“\n\n"
                    "Podívá se na tebe.\n"
                    "„Já vám dodám data a výpočty. Ale vybavení… to už je na vás. Sežeňte, co bude potřeba. "
                    "Až budete mít energii pod kontrolou, dejte mi vědět. Pak se můžeme sejít na místě "
                    "a konečně zjistit, s čím máme tu čest.“\n"
                    "„A věřte mi — čím dřív, tím lépe. Mám takový dojem, že to nechce zůstat na jednom místě.“"
                ),
                "confirm_label": "Dokončit briefing",
                "character": {
                    "name": "Dr. Elias Rook",
                    "role": "Vedoucí biometrického programu",
                    "image_url": "/static/assets/figures/dr_rook.webp",
                },
            }
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
        "title": "Příprava operace: získání vybavení",
        "location": "{hq_city} – Centrála",
        "summary": (
            "Dostav se na centrálu v {hq_city} a vyzvedni si Startovní Toolkit."
            "Na trhu se podívej po generátoru."
        ),
        "description": (
            "Vyraž na centrálu a vyzvedni si startovní vybavení pro operaci s Dr. Rookem. "
            "Po návštěvě centrály ve městě {hq_city} si otevřeš nové možnosti.\n\n"
            "Zjisti, zda je na zdejším trhu k dispozici Energy Modul nebo alespoň "
            "generátor. Bez stabilního zdroje energie nebude možné provést žádné měření v terénu.\n\n"
        ),
        "objectives": [
            "Navštiv centrálu ve městě {hq_city} a přihlas se k operaci. (10 XP)",
            "Prověř trh v {hq_city} a zjisti stav zásob. (10 XP)",
        ],
        "reward": "20 XP",
        "status": "Čeká na dokončení",
        "priority": "Vysoká",
        "eta": "24 hodin",
        "progress": 0.0,
        "objective_rewards": [10, 10],
        "objective_triggers": [
            {"type": "visit_city", "city_name": "{hq_city}"},
            {"type": "story_dialog", "panel": "market"},
        ],
        "story_dialogs": [
            {
                "panel": "market",
                "objective_index": 1,
                "requires_completed_indices": [0],
                "requires_agent_in_city_placeholder": "hq_city",
                "button_label": "Zpráva z trhu",
                "title": "Zpráva od Stevea Hatcheta",
                "body": (
                    "„Agente, pardón, ale tohle zboží teď není skladem. Všechno se vypařilo,“ pronese Steve Hatchet a mizí "
                    "se záznamníkem v ruce. Po patnácti minutách se vrací zpátky k přepážce.\n\n"
                    "„Obvolal jsem pár známých v okolí. Máte štěstí — jeden kus Energy Modulu hlásí sklad ve městě {market_lead_city}. "
                    "Je to úroveň 2, jede tam přímá linka z {hq_city}. Chcete, abych vám ho držel?“\n\n"
                    "HQ doporučuje vyrazit po trati hned, dokud rezervace platí."
                ),
                "confirm_label": "Rezervovat u Stevea",
                "character": {
                    "name": "Steve Hatchet",
                    "role": "Obchodník na trhu",
                    "image_url": "/static/assets/figures/steve_hatchet.webp",
                },
            }
        ],
        "dynamic_placeholders": {
            "hq_city": {
                "preferred_regions": [],
                "importance_exact": 1,
                "use_all_regions": True,
                "exclude_agent_region": False,
                "exclude_agent_city": True,
            },
            "market_lead_city": {
                "preferred_regions": [],
                "importance_min": 2,
                "importance_max": 3,
                "connected_to_placeholder": "hq_city",
                "use_all_regions": True,
                "exclude_agent_region": False,
                "exclude_agent_city": True,
                "avoid_duplicates_of": ["hq_city"],
            },
        },
    },
    {
        "id": "mission-equipment-02",
        "title": "Příprava operace: energie pro měření",
        "location": "{hq_city} → Centrála → {generator_city}",
        "summary": (
            "V {hq_city} není jediný Energy Modul. "
            "Vydej se vlakem do {generator_city}, přivez Energy Generator a sestroj vlastní modul."
        ),
        "description": (
            "Inventura v HQ potvrdila, že bez přesunu do dalšího města se neobejdeš. "
            "Zásoby Energy Generatorů se drží jen v několika uzlech napojených na tratě z {hq_city}.\n\n"
            "Vyraz po lince do {generator_city}, kde ještě funguje trh s technologiemi. "
            "Získej generátor, doplň potřebný materiál a dokonči přenosný Energy Module. "
            "Teprve potom může Dr. Rook spustit měření přímo v terénu."
        ),
        "objectives": [
            "Opusť {hq_city} a doraz do města {generator_city}. (10 XP)",
            "Najdi Stevea Hatcheta na trhu v {generator_city}. (10 XP)",
            "Na trhu v {generator_city} zakup Energy Generator. (10 XP)",
            "Získej materiál potřebný k výrobě (+10 MATERIAL). (10 XP)",
            "Vyrob a připrav Energy Module k použití. (20 XP)",
        ],
        "reward": "60 XP",
        "status": "Čeká na dokončení",
        "priority": "Vysoká",
        "eta": "36 hodin",
        "progress": 0.0,
        "objective_rewards": [10, 10, 10, 10, 20],
        "objective_triggers": [
            {"type": "visit_city", "city_name": "{generator_city}"},
            {"type": "story_dialog", "panel": "market"},
            {"type": "buy_item", "item": "energy_generator", "city_name": "{generator_city}"},
            {"type": "gain_material", "amount": 10},
            {"type": "craft_item", "item": "energy_module"},
        ],
        "story_dialogs": [
            {
                "panel": "market",
                "objective_index": 1,
                "requires_completed_indices": [0],
                "requires_agent_in_city_placeholder": "generator_city",
                "button_label": "Jednat se Stevem",
                "title": "Rezervace přes Stevea Hatcheta",
                "body": (
                    "„Agente, pardón, ale Energy Generatory tu fakt nejsou. Nech mě obvolat pár známých,“ "
                    "řekne Steve Hatchet a ztratí se mezi stánky. O čtvrthodinu později se vrací.\n\n"
                    "„Tak máte štěstí — jeden kus se drží ve skladu v {generator_city}. Jede tam linka přímo odsud. "
                    "Mám ti ho tam zarezervovat?“\n\n"
                    "Jakmile potvrdíš rezervaci, můžeš se pustit do shánění zbytku vybavení."
                ),
                "confirm_label": "Rezervovat",
                "character": {
                    "name": "Steve Hatchet",
                    "role": "Obchodník na trhu",
                    "image_url": "/static/assets/figures/steve_hatchet.webp",
                },
            }
        ],
        "dynamic_placeholders": {
            "hq_city": {
                "source": "agent_city",
                "preferred_regions": [],
                "use_all_regions": True,
            },
            "generator_city": {
                "preferred_regions": [],
                "importance_max": 3,
                "connected_to_placeholder": "hq_city",
                "use_all_regions": True,
                "exclude_agent_region": False,
                "exclude_agent_city": True,
                "avoid_duplicates_of": ["hq_city"],
            },
        },
    },
    {
        "id": "mission-measurement-01",
        "title": "Terénní operace: měření anomálie v {target_city}",
        "location": "{target_city} – Zasažená zóna",
        "summary": (
            "Po dokončení Energy Modulu přichází zpráva od Dr. Rooka. "
            "Sejdete se ve městě {target_city} a provedete první měření mlhy."
        ),
        "description": (
            "Krátce po dokončení Energy Modulu tě kontaktuje Dr. Rook. "
            "Na základě nových výpočtů určil město {target_city} "
            "jako ideální místo pro první terénní měření.\n\n"
            "Tvým úkolem je dorazit na místo s připraveným zdrojem energie. "
            "Mlha zde už způsobuje výpadky infrastruktury a nestabilitu okolí.\n\n"
            "Na místě se setkáš s Dr. Rookem a společně aktivujete Pulse Detector. "
            "Půjde o první přímé měření anomálie v reálném prostředí — "
            "data, která získáte, určí další směr celé operace."
        ),
        "objectives": [
            "Cestuj do města {target_city} s Energy Module. (15 XP)",
            "Setkej se s Dr. Rookem na místě měření. (15 XP)",
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




def get_agent_tasks(
    agent_region_code: Optional[str] = None,
    *,
    agent_city: Optional[City] = None,
    rng: Optional[random.Random] = None,
) -> List[Dict[str, Any]]:
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
            agent_city=agent_city,
            rng=random_generator,
        )
        resolved_tasks.append(resolved_task)

    return resolved_tasks
