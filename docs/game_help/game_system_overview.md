# Agent USA — Game System Overview

Základní přehled klíčových systémů: ekonomika zdrojů, výroba energie a role budov v každém městě. Tyto informace se propisují do dalších nápověd.

## 1. Zdroje ve hře

Ve světě fungují tři hlavní zdroje, každý má jedinečný účel a nikde se nepřekrývá.

### 💰 Peníze
- **Co reprezentují:** běžnou měnu, obchodní hodnotu a dostupnost služeb na trhu.
- **K čemu slouží:** nákup generátorů, modulů, nástrojů, placení služeb (opravy, rezervace, doprava).
- **Kde se používají:** trh, nádraží (linky/doprava), HQ kanál (speciální kontrakty).
- **Jak se získávají:** odměny za mise, obchod, vedlejší úkoly, eventy.

### 🧱 Materiál
- **Co reprezentuje:** fyzické zdroje, komponenty, palivo, díly, suroviny – vše, co se při provozu spotřebovává.
- **K čemu slouží:** výroba energie, opravy vybavení, stavba/upgrady budov, později nouzové opravy v terénu.
- **Kde se používá:** dílna, laboratoř (pokročilé recepty), speciální terénní akce.
- **Jak se získává:** průzkum měst, opuštěná infrastruktura, vedlejší mise, rozebrání starého vybavení.
- **Motto:** materiál = udržitelnost a provoz světa.

### 📡 Data
- **Co reprezentují:** měření, vědecká zjištění, analýzy chování mlhy, obecnou znalost světa.
- **K čemu slouží:** odemykání technologií, nových typů misí, budov i upgradů, posun v příběhu.
- **Kde se používají:** laboratoř, HQ kanál, analytické panely.
- **Jak se získávají:** terénní měření, úspěšné mise, analýzy v laboratoři, speciální úkoly s Dr. Rookem.
- **Motto:** data = progres a poznání.

## 2. Energie – klíčový mechanismus

Bez energie nelze měřit anomálie, bez měření nevznikají data. Ekonomika energie stojí na dvou položkách:

### 🔌 Energy Generator
- **Co to je:** stacionární zařízení koupené na trhu; vyrábí energii, ale nelze ho nosit v terénu.
- **Kde se nachází:** v dílně vybraných měst.
- **K čemu slouží:** výroba energie a nabíjení Energy Modulů.
- **Co spotřebovává:** materiál.

### 🔋 Energy Module
- **Co to je:** přenosný zásobník energie („baterie do terénu“).
- **Limity:** sám energii nevyrábí, funguje jen po nabití.
- **K čemu slouží:** napájení měřicích zařízení a práci v mlze; postupně se vybíjí.
- **Kde se používá:** terénní mise a zasažené zóny.

### Výroba energie – krok za krokem
1. Pořídíš Energy Generator (typicky na trhu).
2. Nasbíráš materiál.
3. Dojdeš do dílny.
4. Spojíš generátor + materiál a nabiješ Energy Module.
5. Nabité moduly vezmeš s sebou do terénu.

## 3. Budovy ve městech

Rychlý přehled funkcí klíčových lokací:

| Budova / kanál | Hlavní účel | Pracuje se zdroji | Poznámky |
| --- | --- | --- | --- |
| 🚉 Nádraží | Cestování, správa linek, logistika | 💰 | Rozhoduje o dostupnosti spojů; náklady na transport. |
| ℹ️ Infocentrum | Přehled situace ve městě, dostupnost služeb, anomálie | 📡 (pasivně) | Slouží jako informační hub a příběhový kontext. |
| 🏭 Dílna | Výroba energie, nabíjení modulů, opravy vybavení, technické úpravy | 🧱 + 🔌 + 🔋 | Středobod energetického cyklu. |
| 🛒 Trh | Nákup/prodej vybavení, rezervace technologií, informace o dostupnosti | 💰 + předměty | Zdrojem jsou generátory, moduly, další zařízení. |
| 🧪 Laboratoř | Analýza dat, výzkum, odemykání technologií, pochopení mlhy | 📡 + (pokročile) 🧱 | Přímá vazba na příběh přes Dr. Rooka a výzkum. |
| 📡 HQ kanál | Komunikace s centrálou, mise, globální rozhodnutí, nové regiony | 📡 + 💰 | Přináší meta-progres a kontrakty. |

## 4. Základní herní smyčka (Core Loop)

1. 🔋 Nabiješ Energy Modul (materiál + generátor v dílně).
2. ⚠️ Vyrazíš do terénu (potřebuješ nabité moduly).
3. 📡 Provádíš měření a další operace.
4. 📊 Získáš data → odemykáš nové možnosti (mise, technologie, budovy).
5. 🔁 Dojdou zdroje/energie → vracíš se do měst, sháníš materiál a restartuješ cyklus.

## Poznámky k rozšíření

- Energie je vědomě úzké hrdlo: nutí hráče řešit materiál a logistiku mezi městy.
- HQ a laboratoř fungují jako gating mechanismy pro příběh i mechaniky (nové regiony, technologie).
- Další dokumenty (budovy, materiály, nástroje, regiony) mohou tuto osu rozvést do konkrétních návodů.
