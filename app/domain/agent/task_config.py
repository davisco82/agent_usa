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
    shared_replacements: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    generator = rng or random
    replacements: Dict[str, Any] = {}
    for key, cfg in template.get("dynamic_placeholders", {}).items():
        if shared_replacements is not None and key in shared_replacements:
            replacements[key] = shared_replacements[key]
            continue
        value = _resolve_placeholder_value(
            cfg,
            agent_region_code,
            replacements,
            generator,
            agent_city=agent_city,
        )
        if value is not None:
            replacements[key] = value
            if shared_replacements is not None:
                shared_replacements[key] = value
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
            "byly natolik znepokojivé, že byl případ předán tobě, agente."
            "V laboratoři v {rook_city} na Tebe Dr. Rook čeká. Pospěš si!"
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
                    "„Dobře, agente… to, co vám teď ukážu, jsem zatím nikomu neposílal.“ "
                    "Dr. Rook přepne projekci a na obrazovce se rozběhnou nestabilní křivky.\n\n"
                    "„Ty pulzy se objevují vždy těsně předtím, než se mlha zahustí. Nejde jen o ztrátu energie — "
                    "mlha ji aktivně narušuje, jako by ji rozkládala.“\n\n"
                    "„Zkoušel jsem tam dostat standardní měřicí zařízení. Selhala během několika sekund. "
                    "Všechno, co není energeticky izolované, je v té zóně nepoužitelné. Potřebujeme vlastní, "
                    "přenosný zdroj energie, který udrží stabilní výkon i v mlze.“\n\n"
                    "„Já dodám data a výpočty, ale vybavení je na vás. Sežeňte, co bude potřeba, "
                    "až budete mít energii pod kontrolou, dejte mi vědět. Pak se sejdeme na místě.“ "
                    "„A věřte mi — čím dřív, tím lépe. Mám dojem, že to nechce zůstat na jednom místě.“"
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
        "title": "Logistický průzkum: hledání zdroje energie",
        "location": "{hq_city} – Centrála → Trh",
        "summary": (
            "Na centrále si vyzvedneš základní vybavení. Zamiř na místní trh pro získání Energy Generatoru."
        ),
        "description": (
            "Po brífinku s Dr. Rookem je jasné, že bez vlastního zdroje energie "
            "nelze v zasažené oblasti provést žádné měření.\n\n"
            "Na centrále v {hq_city} si vyzvedni startovní výbavu a přihlás se k operaci. "
            
        ),
        "objectives": [
            "Navštiv centrálu ve městě {hq_city} a přihlas se k operaci. (10 XP, +250 $)",
            "Prověř trh v {hq_city} a zjisti dostupnost Energy Generatorů. (10 XP)",
        ],
        "reward": "20 XP",
        "status": "Čeká na dokončení",
        "priority": "Vysoká",
        "eta": "24 hodin",
        "progress": 0.0,
        "objective_rewards": [10, 10],
        "objective_rewards_money": [250, 0],
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
                "button_label": "Jednat se Stevem",
                "title": "Informace z trhu",
                "body": (
                    "„Agente, kdybych měl generátor skladem, už by byl pryč,“ uchechtne se Steve Hatchet "
                    "a projede databázi na svém terminálu.\n\n"
                    "„Tady ve městě nic není. Ale…“ odmlčí se a nakloní se blíž. "
                    "„Jeden funkční Energy Generator hlásí sklad ve městě {market_lead_city}. "
                    "Je to regionální uzel a vede tam přímá linka z {hq_city}.“\n\n"
                    "„Můžu ho pro tebe zarezervovat. Na pár hodin. "
                    "Jestli ho chceš, budeš si pro něj muset dojet osobně.“"
                ),
                "confirm_label": "Potvrdit rezervaci",
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
        "title": "Zdroj energie: generátor a nabití modulu",
        "location": "{hq_city} → {market_lead_city} – Trh & dílna",
        "summary": (
            "Rezervace z trhu tě zavádí do města {market_lead_city}. "
            "Získej Energy Generator, sežeň spotřební materiál a v místní dílně "
            "poprvé nabij Energy Modul."
        ),
        "description": (
            "Informace od Stevea Hatcheta potvrdily, že v {market_lead_city} je stále k dispozici "
            "funkční Energy Generator. Bez něj není možné vyrábět energii.\n\n"
            "Po jeho získání musíš zajistit spotřební materiál — palivo potřebné "
            "k samotné výrobě energie. Materiál lze získat průzkumem města "
            "nebo rozebráním nefunkční infrastruktury.\n\n"
            "Jakmile máš generátor i materiál, zamiř do místní dílny. "
            "Zde můžeš energii vyrobit a poprvé nabít svůj Energy Modul. "
            "Teprve poté budeš připraven vyrazit do zasažené oblasti."
        ),
        "objectives": [
            "Cestuj do města {market_lead_city}. (10 XP)",
            "Na trhu získej rezervovaný Energy Generator. (10 XP)",
            "Proveď průzkum města a získej spotřební materiál (+10 MATERIAL). (10 XP)",
            "V místní dílně vyrob energii a nabij Energy Modul. (20 XP)",
        ],
        "reward": "60 XP, Energy Modul (nabito)",
        "status": "Čeká na dokončení",
        "priority": "Vysoká",
        "eta": "36 hodin",
        "progress": 0.0,
        "objective_rewards": [10, 10, 10, 20],
        "objective_triggers": [
            {"type": "visit_city", "city_name": "{market_lead_city}"},
            {"type": "buy_item", "item": "energy_generator"},
            {"type": "gain_material", "amount": 10},
            {"type": "charge_item", "item": "energy_module"},
        ],
        "dynamic_placeholders": {
            "hq_city": {
                "source": "agent_city",
                "use_all_regions": True,
            },
            "market_lead_city": {
                "importance_max": 3,
                "connected_to_placeholder": "hq_city",
                "exclude_agent_city": True,
                "use_all_regions": True,
            },
        },
    },

    {
        "id": "mission-measurement-01",
        "title": "Terénní operace: první měření anomálie",
        "location": "{target_city} – Zasažená zóna",
        "summary": (
            "S nabitým Energy Modulem přichází zpráva od Dr. Rooka. "
            "Sejděte se ve městě {target_city} a proveďte první měření mlhy."
        ),
        "description": (
            "Jakmile je Energy Modul připraven, ozývá se Dr. Rook. "
            "Na základě nejnovějších výpočtů určil město {target_city} "
            "jako vhodné místo pro první terénní měření.\n\n"
            "Tvým úkolem je dorazit do zasažené zóny s vlastním zdrojem energie. "
            "Místní infrastruktura selhává a běžná zařízení zde nejsou schopna fungovat.\n\n"
            "Na místě se setkáš s Dr. Rookem. "
            "Pomocí Energy Modulu napájíš Pulse Detector "
            "a společně provedete první přímé měření anomálie. "
            "Získaná data budou klíčová pro další výzkum i budoucí rozhodnutí."
        ),
        "objectives": [
            "Cestuj do města {target_city} s nabitým Energy Modulem. (15 XP)",
            "Setkej se s Dr. Rookem v zasažené zóně. (15 XP)",
            "Použij Energy Modul k napájení Pulse Detectoru. (20 XP)",
            "Proveď první terénní měření anomálie. (30 XP)",
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
                "importance_min": 1,
                "importance_max": 2,
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
    shared_replacements: Dict[str, Any] = {}

    for template in AGENT_TASK_TEMPLATES:
        resolved_task, _ = resolve_template_for_agent(
            template,
            agent_region_code=agent_region_code,
            agent_city=agent_city,
            rng=random_generator,
            shared_replacements=shared_replacements,
        )
        resolved_tasks.append(resolved_task)

    return resolved_tasks
