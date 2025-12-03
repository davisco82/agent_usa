# game/agent/task_config.py
"""
Konfigurace příběhových / operativních úkolů pro UI agenta.

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

Níže nechte prázdný seznam a přidejte si vlastní položky nebo si zkopírujte
komentovaný příklad a upravte jeho hodnoty.
"""

# Příklad struktury (ponechte zakomentovaný nebo si jej upravte pro první úkol):
# AGENT_TASKS = [
#     {
#         "id": "unikatni-id",
#         "title": "Název úkolu",
#         "location": "Město, stát",
#         "summary": "Krátké shrnutí...",
#         "description": "Delší briefing…",
#         "objectives": [
#             "Krok číslo 1",
#             "Krok číslo 2",
#         ],
#         "reward": "+100 XP",
#         "status": "Probíhá",
#         "priority": "Střední",
#         "eta": "24 h",
#         "progress": 0.25,
#     },
# ]

AGENT_TASKS = []
