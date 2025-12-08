# Audio Assets

Struktura složky `static/sounds`:

- `click/` – krátké UI zvuky (kliknutí, potvrzení, zavření panelu)
- `travel/` – delší efekty spojené s cestováním (odjezd vlaku, příjezd, průjezd)
- `ambient/` – atmosférické smyčky nebo jiné podkresy, které se mohou míchat do UI

Každou kategorii držíme v samostatných podsložkách, aby se v Asset loaderu daly snadno mapovat. Doporučené konvence:

1. Pojmenovávej soubory podle kontextu (`click_primary.mp3`, `travel_depart.wav`).
2. Preferuj formáty `mp3` nebo `ogg` kvůli velikosti, maximálně 44.1 kHz / 16-bit.
3. Pokud přidáš nový typ zvuku, vytvoř vlastní podsložku a krátce ji popiš zde.

Pro bundler stačí odkázat na `/static/sounds/<category>/<file>`. EOF