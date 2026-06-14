# Design System — ytTranscript

> Category: Reading + Triage Utility
> Local-first web tool that turns fragmented YouTube captions into readable paragraphs and a clean bullet summary. Calm, evidence-aware, read-first, action-on-demand.

> Lokalny adapter:
>
> - nadrzędny kontrakt GUI: `ZOLZOTRON_APP_DESIGN_SYSTEM.md` (wspólne dla wszystkich aplikacji Zołzotrona)
> - proceduralny playbook: `UI_UX_REDESIGN_PLAYBOOK.md` (CORE_NOW / OPTIONAL_LATER / REJECT)
> - lokalny review: brak (projekt jeszcze nie przeszedł formalnego `UI_UX_REVIEW_YT_TRANSCRIPT.md`)
> - pozycjonowanie marki: `02_positioning/DESIGN.md` (warstwa marki, poza zakresem tego pliku)

## 1. Visual Theme & Atmosphere

ytTranscript to **osobista czytelnia transkrypcji YouTube** — narzędzie, nie platforma. User wchodzi z linkiem, wychodzi z czytelnym tekstem i (opcjonalnie) streszczeniem albo plikiem audio. Wszystko dzieje się lokalnie.

- Visual style: czytelny, ciepły, evidence-aware, spokojny, **read-first**
- Product feel: notatnik z jednym wyraźnym narzędziem AI, a nie „appka z 14 przyciskami"
- Color stance: ciepłe neutralne tło, głęboki tekst, jeden akcent dla stanu „AI pracuje", drugi dla artefaktów końcowych
- Design intent: Niech użytkownik **przeczyta transkrypt szybciej niż ogląda wideo** i poczuje, że ma kontrolę nad tekstem — nie nad „algorytmem"

Interfejs powinien sprawiać wrażenie:

- czytelnego (read-first);
- przewidywalnego (ta sama akcja = ten sam wynik);
- technicznie wiarygodnego (konkretne statusy, limity, czasy);
- spokojnego (zero festiwolu animacji, zero „wow");
- użytecznego bez instrukcji (jeden widok, jedna rzecz na raz).

Unikać:

- generycznego „AI startup" wyglądu (gradient halo, neon, blob);
- terminala cyberpunk;
- wielu bento-kafelków z „metrykami AI";
- dekoracyjnych avatarów / ilustracji modeli LLM;
- sekcji marketingowych w środku narzędzia;
- animowanego streamowania tokenów „literka po literce" z efektami;
- dźwięków „typewriter" przy generowaniu.

## 2. Color

Tokeny dziedziczone z `ZOLZOTRON_APP_DESIGN_SYSTEM.md` §3.1. W tym projekcie ograniczam paletę do minimum.

- Background: `#F7F5EF`
- Surface: `#FFFDF9`
- Text: `#071525`
- Muted text: `#425466`
- Border: `#D8DEE5`
- Primary (CTA, ciemne sekcje): `#0D2035`
- Success: `#2D6A4F` (zapisany cache, gotowe do odczytu)
- Success soft: `#E2F1E8`
- Warning: `#8A5A00` (limit tokenów, brak TTS, fallback providera)
- Warning soft: `#FFF1C2`
- Danger: `#B94A48` (błąd pobierania, błąd modelu, 5xx)
- Danger soft: `#F8E4E1`
- Accent (aktywne przetwarzanie AI): `#B7E34A` (lime) — wyłącznie dla **overlay „AI myśli"**, spinnera w przycisku, podświetlenia bieżącej operacji
- Accent soft: `#EEF8D4`
- Secondary accent (artefakty końcowe): `#694FD8` (violet) — wyłącznie dla badge'y eksportu (PDF, MD, SRT, TXT, audio) i podświetlenia gotowego wyniku
- Secondary accent soft: `#ECE8FF`
- Info: `#315C8C` / `#E4EEF8` (status, licznik tokenów w panelu bocznym)

Zasady użycia w tym projekcie:

- **Lime nigdy nie wypełnia dużych powierzchni** — to sygnał „coś się dzieje teraz", nie stylistyka marki.
- **Fiolet nigdy nie oznacza akcji** — to sygnał „to jest artefakt do pobrania / wynik końcowy".
- **Navy jest zarezerwowane na główne CTA** (`Rekonstruuj z AI`, `Streszcz z AI`, `Start TTS`) i nagłówek aplikacji.
- **Statusy mają tekst albo ikonę obok koloru** — nigdy nie sam kolor.
- **Brak losowych gradientów** poza jednym miejscem: pasek postępu renderowania strony, jeśli się pojawi (subtelny `#E4EEF8` → `#FFFDF9`).
- **Bez neonu, bez glassmorphismu, bez mieszania wielu akcentów w jednym komponencie.**

## 3. Typography

- Primary: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Mono: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` (wyłącznie: licznik tokenów, czas LLM, długość audio, ID cache, URL w diagnostyce)
- Scale: kompaktowy redakcyjny — narzędzie do czytania, nie landing page
- Weights: `400`, `500`, `600`, `700` (tylko gdy naprawdę potrzebne)
- Line-height body: `1.6` (transkrypt ma się czytać, nie skanować)

Zasady:

- Maksymalnie dwa kroje.
- **Mono tylko dla** licznika tokenów, czasu odpowiedzi modelu, długości pliku audio, ID wpisu cache i metadanych w panelu diagnostycznym.
- **Body text minimum 16 px**. Helper text minimum 14 px.
- **Długość linii 60–72 ch** dla transkryptu i streszczenia (czytelność na desktop i mobile).
- **H1 kompaktowy** — to narzędzie, nie hero section. `ytTranscript` w nagłówku, nie wielki nagłówek marketingowy.
- Tytuły sekcji (`Transkrypt`, `Rekonstrukcja AI`, `Streszczenie AI`, `Eksport`, `TTS`) — `16 px`, `weight 600`, kolor tekstu.
- **Nie stosować** display fontów, italic do oznaczania ważnych rzeczy, uppercase w treści.

## 4. Spacing & Grid

- Bazowy rytm: `4, 8, 12, 16, 24, 32, 48, 64` (dziedziczony z systemu)
- Layout: **jedna kolumna** na desktop i mobile (mobile-first), z **opcjonalnym bocznym panelem diagnostycznym** zwijanym na mobile
- Główna oś contentu max-width: `720px` (transkrypt czyta się najlepiej w wąskiej kolumnie)
- Boczny panel diagnostyczny max-width: `320px` (desktop), zwijany poniżej `768 px`
- Padding mobilny: `20px`
- Padding desktop: `32px` (główna oś), `24px` (panel)

Zasady:

- **Whitespace przed obramowaniem** — nie obramowanie zamiast whitespace.
- **Bez zagnieżdżonych kart.** Sekcje oddzielone białą przestrzenią albo jedną linią border.
- **Karty tylko dla**: lista cache, panel diagnostyczny, lista audio do pobrania. Nie dla każdej sekcji.
- **Główna oś (transkrypt + akcje) ma oddychać.** Boczny panel jest opcjonalny, nie konkurencyjny.
- **Na mobile** jedna kolumna. Diagnostyka pod transkryptem, zwinięta domyślnie w `<details>`.

## 5. Layout & Composition

### 5.1. Główny widok (desktop ≥ 1024 px)

1. **Top bar** (sticky, wysokość 56 px):
   - Logo: `▶ ytTranscript` (marka własna; nie emoji jako jedyne logo).
   - Status providera oMLX: badge `oMLX: online / offline / degraded`.
   - Tryb czytania: `Surowy` / `Rekonstrukcja AI` / **domyślnie** pokaż oba w stacku, wybór trybu jako toggle na górze transkryptu.
2. **Pole URL** (jedyne wejście): duże input pole + przycisk `Pobierz transkrypt`.
3. **Sekcja Transkrypt** (max-width 720 px, wyśrodkowana):
   - Toggle trybu wyświetlania: `Surowy | Rekonstrukcja AI`.
   - Body transkryptu: 16 px, line-height 1.6, max 72 ch na linię.
   - Sticky mini-toolbar u góry sekcji: `Rekonstruuj z AI`, `Streszcz z AI`, `Eksportuj…`, `Czytaj na głos`.
4. **Sekcja Streszczenie AI** (pojawia się dopiero po wygenerowaniu):
   - Lista bulletów, font-size 15 px, line-height 1.6.
   - Badge: `Wygenerowano • model • czas • tokeny`.
5. **Sekcja TTS** (zwinięta domyślnie, rozwijana gdy wybrano język):
   - Wybór języka: `pl | en | de` (segment control).
   - Player audio z kontrolkami + przycisk `Pobierz WAV`.
   - Jeśli Piper brak: notice `TTS niedostępny — wymagany lokalny Piper`.
6. **Boczny panel diagnostyczny** (desktop, zwijany):
   - `Czas pobrania` • `Czas rekonstrukcji` • `Czas streszczenia` • `Tokeny (in / out)` • `Cache: hit / miss` • `Build: v3.2.0`
7. **Footer**: `© 2026 Radosław Pleskot · ytTranscript` + link do `docs/` + link do `LICENSE` (gdy będzie).

### 5.2. Główny widok (mobile < 768 px)

- Top bar: 56 px, bez badge'a providera (ten trafia do panelu diagnostycznego).
- Pole URL: full width, sticky pod top barem.
- Sekcje: jedna kolumna, padding 20 px.
- Tryb wyświetlania transkryptu: segment control `Surowy | Rekonstrukcja AI` nad treścią.
- Mini-toolbar akcji: pod treścią transkryptu, pełna szerokość, **przyciski układane w stack** (nie rząd 4 przycisków obok siebie).
- Streszczenie: stack pod transkryptem.
- TTS: sekcja zwijana, w pełni dostępna.
- Panel diagnostyczny: `<details>` na dole, domyślnie zwinięty.
- Footer: pod treścią, safe-area aware (padding-bottom dostosowany do iOS Safari).

### 5.3. Stany wymagane

Każda sekcja ma obsługiwać:

- `EMPTY` — przed pobraniem transkryptu
- `READY` — URL wklejony, czeka na klik
- `LOADING` — pobieranie / rekonstrukcja / streszczanie (z komunikatem i limitem czasu)
- `SUCCESS` — wynik widoczny
- `ERROR` — z retry, bez technicznego bełkotu
- `OFFLINE_OR_UNAVAILABLE` — oMLX nie żyje, fallback do innego providera
- `OUT_OF_SCOPE` — wklejony URL nie jest YouTube / film nie ma napisów
- `LIMIT_REACHED` — model przekroczył limit tokenów (z opcją „kontynuuj mimo to" albo „zawęź zakres")
- `PARTIAL_SUCCESS` — pobrano część transkryptu (np. tylko auto-generated), reszta się nie udała

Zasady layoutu:

- **Jedna dominująca akcja na widok.** Nigdy dwa CTA o tej samej wadze w tej samej sekcji.
- **Na mobile jedna kolumna.** Żadnych dwóch przewijalnych kontenerów obok siebie.
- **Sticky actions tylko dla pola URL i toolbar nad transkryptem.** Nigdy dla eksportu / TTS.
- **Boczne panele chowają się** poniżej `768 px`.

## 6. Components

### Top bar

- Tło: `--app-surface`, border-bottom 1 px `--app-border`.
- Lewa: `▶ ytTranscript` (logo: trójkąt play + nazwa, weight 600, 16 px).
- Prawa: status providera (`oMLX: online` jako badge success) + link do `docs/`.
- Wysokość 56 px, padding 0 24 px desktop / 0 16 px mobile.
- Sticky do góry viewport.

### Status providera

- Badge typu `info` (online) / `warning` (degraded) / `error` (offline) + tekst statusu.
- Na mobile badge trafia do panelu diagnostycznego.

### Pole URL (główne wejście)

- Label: `Wklej link do filmu YouTube` (14 px, weight 500, padding-bottom 8 px).
- Input: pełna szerokość, 16 px, radius 10 px, helper text pod spodem (`np. https://www.youtube.com/watch?v=...`).
- Przycisk `Pobierz transkrypt` obok inputa desktop, **pod** inputem na mobile (full width).
- Focus: 2 px outline `--app-lime`, offset 2 px.
- Error: border `--app-error`, helper text w kolorze error.

### Przycisk `Pobierz transkrypt`

- Primary CTA, navy, height min 44 px, radius 10 px, padding 12 px 20 px.
- Stany: default, hover (translateY -1 px + subtelna zmiana tła), focus (lime outline), active, disabled (opacity 0.5), loading (ikona + „cursor: wait").
- Loading label: `Pobieram…` (nie „Pobieranie..." z trzema kropkami animowanymi).

### Toolbar akcji transkryptu

- Sticky u góry sekcji transkryptu.
- Cztery akcje (w tej hierarchii):
  1. `Rekonstruuj z AI` (secondary) — generuje czytelne akapity
  2. `Streszcz z AI` (secondary) — generuje bullet streszczenie
  3. `Eksportuj…` (secondary z dropdown: TXT / SRT / Markdown / PDF)
  4. `Czytaj na głos` (secondary, prowadzi do sekcji TTS)
- Wszystkie **jednakowej wagi** (secondary), bo żadna nie jest „główną" po pobraniu transkryptu.
- Na mobile: stack pionowy, pełna szerokość każdego przycisku.

### Tryb wyświetlania transkryptu (segment control)

- Dwa stany: `Surowy` | `Rekonstrukcja AI` (domyślnie `Rekonstrukcja AI` gdy dostępna).
- Aktywny: tło `--app-surface`, border `--app-navy`, tekst `--app-navy`, weight 500.
- Nieaktywny: tło `--app-bg`, tekst `--app-text-muted`.
- Focus: 2 px outline `--app-lime`.

### Karta transkryptu (jeden duży blok, nie kafelki)

- Tło: `--app-surface`, padding 24 px desktop / 16 px mobile, radius 14 px, border 1 px `--app-border`.
- Header: licznik znaków + czas trwania filmu (mono 12 px, muted) + język napisów (badge neutral).
- Body: 16 px, line-height 1.6, max 72 ch na linię, **paragraphy oddzielone jedną pustą linią** (nie kolejnymi kartami).
- Tryb `Surowy`: oryginalne snippety z timestampami (mono 12 px, kolor muted) w nawiasach kwadratowych.
- Tryb `Rekonstrukcja AI`: czyste akapity, **bez timestampów** (chodzi o czytelność), z badge'em u góry `Rekonstrukcja AI • model • czas • tokeny`.
- Aktywna operacja AI: cienka górna krawędź 3 px `--app-lime` (sygnał „to właśnie przetwarzamy").

### Sekcja Streszczenie AI

- Pojawia się po kliknięciu `Streszcz z AI`.
- Tytuł: `Streszczenie` (16 px, weight 600).
- Badge pod tytułem: `Wygenerowano • model • czas • tokeny`.
- Lista bulletów: 15 px, line-height 1.6, **bez ikon w bulletach** (zwykły `•`).
- Aktywna operacja: lime krawędź + spinner z napisem `Streszczam…` obok badge'a.

### Sekcja TTS

- Zwinięta `<details>` domyślnie, rozwinięta gdy audio dostępne.
- Tytuł: `Czytanie na głos`.
- Wybór języka: segment control `pl | en | de`.
- Przycisk `Generuj audio` (primary, navy).
- Player audio: standardowy HTML5 z kontrolkami.
- Przycisk `Pobierz WAV` (secondary).
- Gdy Piper brak: notice `warning` z konkretną instrukcją („Zainstaluj Piper i ustaw `PIPER_BIN` w `.env`").
- Gdy audio gotowe: badge `accent-violet` z metadanymi (czas, rozmiar, język).

### Eksport

- Dropdown / menu: `TXT`, `SRT`, `Markdown`, `PDF`.
- Po wyborze: natychmiastowy download.
- Badge `accent-violet` przy każdej pozycji menu („artefakt do pobrania").
- Brak własnego podglądu PDF / MD w aplikacji — użytkownik pobiera, nie ogląda.

### Panel diagnostyczny (boczny / zwijany)

- Pola (każde mono 12 px, muted):
  - `Build: v3.2.0`
  - `Cache: hit | miss`
  - `Czas pobrania: X ms`
  - `Czas rekonstrukcji: X ms`
  - `Czas streszczenia: X ms`
  - `Tokeny: in=N out=M`
  - `Model: <name>`
  - `Provider: oMLX`
- **Nie komunikować „metryk AI"** jako feature'u. To narzędzie operatorskie, nie dashboard.
- Na desktop: prawa kolumna, sticky.
- Na mobile: `<details>` na dole, zwinięte domyślnie.

### Privacy notice

- Stały element, **nie chowany** w UI.
- Tekst: `Lokalne przetwarzanie. Transkrypty i zapytania do modelu nie opuszczają tej maszyny. To demonstrator, nie system produkcyjny.`
- Styl: notice typu `info` lub `privacy`, max-width 720 px, margin-top 24 px od reszty.

### Footer

- `© 2026 Radosław Pleskot · ytTranscript` (mono 12 px, muted).
- Linki: `Dokumentacja` • `Bezpieczeństwo` • `Znane ograniczenia`.
- Safe-area aware na mobile.

## 7. Motion & Interaction

- Transitiony: `160–220 ms` (opacity, transform, background, border-color).
- Hover: lekkie `translateY(-1px)` albo zmiana tła — bez scale, bez cienia animacji.
- Focus: **zawsze widoczny** — 2 px outline `--app-lime`, offset 2 px. Dotyczy też elementów custom (segment control, custom checkbox).
- Aktywne stany: `active` (inset 1 px), `disabled` (opacity 0.5 + cursor `not-allowed`), `loading` (ikona + `cursor: wait`).
- Streaming tokenów: **NIE animować litera po literze**. Przy rekonstrukcji AI pokazujemy spinner + komunikat, potem cały blok naraz. Dla streszczenia: licznik „wygenerowano N z M punktów" bez efektu pisania.
- Auto-scroll transkryptu: **NIE yankuj użytkownika** w górę po pojawieniu się nowej treści. Jeśli scroll jest na dole — pokaż przycisk `↓ Skocz do nowej treści`.
- `prefers-reduced-motion`: wszystkie transitiony do `0ms`, bez translateY, bez spinnerów graficznych (zostaje tekst „Przetwarzam…").
- Skeleton tylko do ładowania pierwszej strony (jeśli w ogóle potrzebny). Wewnątrz aplikacji wolę spinner + komunikat niż migające kształty.

Czego **nie** robić:

- animowane bloby / tła;
- parallax;
- scroll hijacking;
- typewriter animation na AI;
- „loading w nieskończoność" bez limitu czasu — każda operacja ma timeout (patrz §11);
- ciężkie biblioteki animacji (Framer Motion itp. — zabronione wg systemu);
- dekoracyjne mikro-ruchy (drganie, odbijanie, gradient shift).

## 8. Voice & Microcopy

Ton:

- konkretny;
- spokojny;
- zwięzły;
- po polsku (UI domyślnie PL, angielski tylko w opcjach dev);
- techniczny, ale nie arogancki;
- bez „AI-speak" (nie piszemy „nasz zaawansowany model", „inteligentnie", „automatycznie magicznie");

Przykłady (PL):

- Loading pobierania: `Pobieram transkrypt…`
- Loading rekonstrukcji: `Rekonstruuję tekst za pomocą modelu…` (z limitem czasu)
- Loading streszczenia: `Generuję streszczenie…`
- Loading TTS: `Generuję audio…`
- Sukces: `Transkrypt gotowy.`
- Brak napisów: `Ten film nie ma dostępnych napisów. Wklej inny link albo sprawdź napisy ręcznie.`
- Błąd pobierania: `Nie udało się pobrać transkryptu. Sprawdź link i spróbuj ponownie.`
- Błąd modelu: `Model zwrócił błąd. Możesz spróbować ponownie albo zmienić providera.`
- Limit tokenów: `Model przekroczył limit tokenów. Spróbuj krótszego filmu albo zawęź zakres.`
- oMLX offline: `Lokalny model nie odpowiada. Sprawdź, czy oMLX działa na porcie z `.env`.`
- TTS niedostępny: `Czytanie na głos wymaga lokalnego Piper. Szczegóły w dokumentacji.`
- Cache hit: `Transkrypt wczytany z pamięci podręcznej.`

Czego **nie pisać**:

- `100% dokładne`;
- `RODO compliant`;
- `pełna prywatność`;
- `dane nie opuszczają przeglądarki` (w tej apce przechodzą przez backend → model lokalny, więc formułowanie musi być prawdziwe);
- `model AI jest super inteligentny`;
- `jedno kliknięcie i masz wynik`;
- puste zachęty typu `Witaj! Zacznij od wklejenia linku ✨`.

## 9. Accessibility

Target: **WCAG 2.2 AA-aware implementation** (zgodnie z `ZOLZOTRON_APP_DESIGN_SYSTEM.md` §8). W tym projekcie obowiązkowo:

- Semantic HTML (`<main>`, `<header>`, `<nav>`, `<section>`, `<footer>`, `<article>`).
- Jeden `h1` (nazwa aplikacji w top bar). Sekcje jako `h2`.
- **Każdy input ma widoczny label**, nie tylko placeholder.
- **Każdy przycisk ma tekst** (nie sama ikona — wyjątek: play/pause w playerze audio, ale z `aria-label`).
- **Focus widoczny** na wszystkich elementach interaktywnych.
- **Klawiatura**: Tab przechodzi przez URL → Pobierz → tryb wyświetlania → akcje toolbar → streszczenie → TTS → eksport → diagnostyka → footer.
- **Skip link**: `Przejdź do treści` na samej górze, widoczny tylko przy focusie.
- **Statusy operacji AI** ogłaszane przez `aria-live="polite"`: „Rekonstrukcja zakończona", „Streszczenie wygenerowane", „Błąd modelu".
- **Kontrast** sprawdzony ręcznie dla par: text/bg, text/surface, muted-text/surface, navy-CTA/surface, lime-soft/text.
- **Nie komunikować statusu samym kolorem** — badge ma ikonę lub tekst.
- **Touch target minimum 44 × 44 px** dla wszystkich elementów interaktywnych (przyciski, segment control, dropdown items).
- **Text resize** do 200% bez utraty funkcjonalności.
- **Reflow** bez poziomego scrolla na 320 px.
- **`prefers-reduced-motion`** respektowany.
- **Nie ukrywać focus** za animowanym overlayem (focus-not-obscured).

Raportowane po każdej większej zmianie:

- przetestowane (lista);
- zaliczony kontrast (jakie narzędzie, ile par);
- niezaliczony (z priorytetem);
- wymagające ręcznej kontroli (czytnik ekranu, switch control).

## 10. Privacy & Trust

Interfejs musi mówić wprost:

- to lokalne narzędzie (nie usługa chmurowa);
- transkrypty i zapytania do modelu nie opuszczają maszyny operatora (z wyjątkiem samego pobrania transkryptu z YouTube, co jest nieuniknione w tym flow);
- wyniki nie są zapisywane na serwerze poza pamięcią podręczną w RAM (TTL domyślnie 60 min, konfigurowalne);
- to demonstrator / prototyp, nie system produkcyjny;
- nie zbieramy analytics, telemetry, metryk użytkowania.

**Wymagane elementy UI** (żaden nie może zniknąć w żadnym stanie aplikacji):

- Privacy notice (stały element, patrz §6).
- W panelu diagnostycznym: pole `Provider: oMLX` widoczne — operator ma widzieć, **dokąd** idzie zapytanie.
- W stopce / settings: link do `docs/SECURITY_NOTES.md`.

**Zakazane sformułowania** (w UI, w komunikatach, w marketingu apki):

- `100% bezpieczne`;
- `RODO compliant`;
- `zero ryzyka`;
- `nikt nie ma dostępu`;
- `pełna prywatność`;
- `dane nigdy nie opuszczają przeglądarki` (nieprawda w tym flow — idą do lokalnego backendu i do lokalnego modelu).

**Preferowane sformułowania**:

- `Nie wpisuj danych osobowych ani poufnych.`;
- `To demonstrator, nie system produkcyjny.`;
- `Transkrypt i zapytania do modelu przetwarzane lokalnie.`;
- `Pobieranie transkryptu z YouTube jest nieuniknione w tym flow.`;
- `Dodatkowy hardening jest konieczny przed wystawieniem publicznego dema.`

## 11. Anti-patterns (dla tego projektu)

Nie wdrażać:

- hero / landing page wewnątrz narzędzia;
- feature grid „co potrafi ytTranscript";
- bento-grid z kafelkami „AI insights";
- dekoracyjnych avatarów modeli LLM;
- stockowych zdjęć „osoby czytające artykuł";
- gradient halo w nagłówku;
- animowanych blobów w tle;
- glassmorphismu;
- dashboard widgets z wykresami „użycia modelu";
- megamenu;
- dolnego navbara (mobile bottom tabs);
- kart w kartach (transkrypt nie może być w karcie, a w niej kolejna karta „highlighty");
- ciężkich bibliotek animacji;
- trackerów i analytics (zakaz globalny wg `UI_UX_REDESIGN_PLAYBOOK.md` §3);
- ciągłego auto-scroll transkryptu;
- typewriter animation;
- „powitalnego ekranu" z pytaniem o imię;
- ciemnego motywu w v1 (systemowy motyw ciemny jest `OPTIONAL_LATER` — patrz §13);
- powiadomień push / natywnych desktop notifications;
- księgi gości / formularza feedbacku wewnątrz aplikacji;
- jakiegokolwiek elementu, który pyta o zgodę na cookies (bo nie ma cookies do zgadzania się).

## 12. Edge Cases — pełna lista

Każdy z poniższych stanów musi mieć ręczny test w `docs/LOCAL_SETUP.md` (sekcja „Testowanie edge cases"):

1. **Pusty URL** → inline error pod inputem, nie toast.
2. **Niepoprawny URL** (nie YouTube) → notice `warning`: `To nie wygląda na link do YouTube. Sprawdź i spróbuj ponownie.`
3. **Poprawny URL, film bez napisów** → notice `warning`: `Ten film nie ma dostępnych napisów.` + opcja `Spróbuj wygenerować napisy automatycznie` (jeśli technicznie dostępne).
4. **Poprawny URL, film z napisami auto-generated w innym języku** → transkrypt wczyta się w dostępnym języku, badge `Język napisów: en` widoczny, brak cichej zmiany języka.
5. **Poprawny URL, film prywatny / niedostępny regionowo** → notice `error` z kodem i sugestią (`Film jest prywatny albo zablokowany w Twoim regionie.`).
6. **oMLX offline** → notice `error` na toolbarze rekonstrukcji, nie crash; sugestia: `Sprawdź, czy oMLX działa.` Akcja `Rekonstruuj z AI` zablokowana z czytelnym powodem.
7. **oMLX timeout (np. 90 s)** → automatyczny retry 1× z backoffem, potem notice `error` z `Spróbuj ponownie`.
8. **Limit tokenów przekroczony przy rekonstrukcji** → notice `warning`: `Model przekroczył limit tokenów.` Opcja: `Kontynuuj mimo to (częściowy wynik)` / `Zawęź zakres (pierwsze X minut)` / `Anuluj`.
9. **TTS bez Piper** → przycisk `Generuj audio` zablokowany, notice `warning` z instrukcją instalacji.
10. **Cache hit z pamięci** → krótki toast / inline info: `Transkrypt wczytany z pamięci podręcznej.` (bez banera, bez confetti).
11. **Jednoczesne kliknięcie `Rekonstruuj` i `Streszcz`** → drugie żądanie trafia do kolejki (albo disabled na czas trwania pierwszego), bez race condition.
12. **Mobile 320 px** → brak poziomego scrolla, toolbar akcji stackuje się pionowo, panel diagnostyczny jako `<details>`.
13. **Tryb `Surowy` z bardzo długim filmem (3 h+)** → transkrypt ładowany w paczkach, sticky button `↓ Skocz do nowej treści` gdy user scrolluje w górę.
14. **Eksport PDF z 10k+ znaków** → loader + timeout 30 s, potem notice `error` jeśli timeout, z opcją `Eksportuj jako TXT zamiast tego`.
15. **Dwukrotne kliknięcie `Pobierz transkrypt`** → drugie kliknięcie ignorowane w trakcie trwania pierwszego (button disabled).
16. **Awaria sieci podczas pobierania z YouTube** → notice `error` z `Spróbuj ponownie`, bez automatycznego retry (YouTube lubi throttling).
17. **Rekonstrukcja AI zwraca pusty wynik** → notice `warning`: `Model zwrócił pusty wynik. Spróbuj ponownie albo użyj trybu surowego.`
18. **Streszczenie AI z filmu krótszego niż 30 s** → notice `info`: `Film jest bardzo krótki — streszczenie może nie dodać wartości. Kontynuować?` z `Tak` / `Anuluj`.
19. **Piper działa, ale brak modelu dla wybranego języka** → notice `warning`: `Brak modelu Piper dla języka: X. Wybierz inny język albo doinstaluj model.`
20. **Build nieznany / wersja deweloperska** → panel diagnostyczny pokazuje `Build: dev`, badge `warning` obok.

## 13. Roadmap klasyfikacji (per Playbook §1)

### `CORE_NOW` (wdrożyć w v3.3)

- Przebudowa top bara (logo + status providera) wg §6.
- Pole URL z label i helper text wg §6.
- Toolbar akcji transkryptu (4 akcje, jednolita waga, stack na mobile).
- Tryb wyświetlania `Surowy | Rekonstrukcja AI` jako segment control.
- Karta transkryptu wg §6 (jeden blok, nie kafelki).
- Sekcja Streszczenie AI z badge'em metadanych.
- Sekcja TTS w `<details>` z playerem + download.
- Panel diagnostyczny z polami mono.
- Privacy notice w każdym widoku.
- Pełna lista edge cases (§12) z testami w `docs/LOCAL_SETUP.md`.
- Mobile testy 320 / 390 / 430 / 768 / 1024 / 1440 px.
- Accessibility review per §9.

### `OPTIONAL_LATER` (zaparkować)

- Dropdown eksportu jako menu (teraz może być prosty inline rząd 4 przycisków).
- `<details>` z pełnym promptem i odpowiedzią modelu (dla trybu eksperckiego).
- Ciemny motyw (tokeny już są zdefiniowane, wystarczy dodać mapowanie).
- Lekki grain / subtelny gradient w `<header>`.
- Card lift przy hover dla głównego CTA.
- Skeleton loading dla pierwszego wczytania strony (jeśli się okaże, że jest potrzebny).
- Tryb „porównaj surowy vs rekonstrukcja side-by-side" (dla long-form review).
- Szybki dostęp do ostatnich 5 transkrypcji (cache + localStorage klucza URL, nie treści).

### `NOT_APPLICABLE`

- Bento-grid metryk AI (narzędzie czytelnicze, nie dashboard).
- Bottom navbar mobile (jedna kolumna, nie potrzeba).
- Tryb „agenta" z wieloma intencjami (to `AI Discuss Studio`, nie `ytTranscript`).
- Marketplace modeli w UI (jeden provider, jeden model, konfigurowalny przez env).
- Multi-user / konta (single-user local prototype).
- Subskrypcje / paywall (Zakaz globalny).
- Tryb offline apki (wymaga pobierania filmów, z natury online dla URL — operacja pobierania transkryptu wymaga sieci).

### `REJECT`

- Analytics, telemetry, trackery (Zakaz globalny).
- Glassmorphism, neon, animowane bloby.
- Ciężkie biblioteki animacji (Framer Motion itp.).
- „Chat z filmem" w v1 (zakres się rozjedzie; to temat na osobny redesign).
- Ciągłe auto-scroll transkryptu (utrudnia czytanie).
- Generowanie napisów audio dla całego filmu bez podziału na fragmenty (ryzyko OOM lokalnego Piper).
- Formularz feedbacku w aplikacji (to demonstrator, nie SaaS).

## 14. OpenDesign Output (kierunek wizualny)

Jeden lekki kierunek: **„Reading Room"** — spokojna, ciepła, redakcyjna. Wszystko w `ZOLZOTRON_APP_DESIGN_SYSTEM.md`, zero nowych kolorów.

Trzy warianty do rozważenia przed wdrożeniem (do pokazania w issue / dyskusji):

### A. Editorial Calm (domyślny dla tego projektu)

Najbliżej systemu. Ciepłe tło, navy nagłówek, lime tylko na aktywnym przycisku AI, fiolet tylko na badge'ach eksportu. Wygląda jak notatnik, nie apka. Wszystko mieści się w 720 px szerokości głównej osi.

### B. Operator Console

Gęstszy układ, panel diagnostyczny zawsze widoczny po prawej, mono liczniki w pierwszym planie. Bliżej „narzędzia dev" niż „czytelni". Dla użytkownika, który chce widzieć czasy i tokeny przy każdej operacji. Mniej czytelny dla osoby nietechnicznej.

### C. Hybrid (rekomendowany do implementacji)

Domyślnie Editorial Calm. Panel diagnostyczny dostępny jednym kliknięciem (ikona `</>` w top barze otwiera drawer z prawej). Domyślnie ukryty. Pozwala zachować „reading room" dla zwykłego użytkownika i „operator console" dla technicznego, bez dwóch osobnych widoków.

Dla każdego wariantu pokazać (w `docs/screenshots/` po wdrożeniu):

- **Desktop 1280 px**: empty state, wczytany transkrypt (surowy), rekonstrukcja AI w toku, rekonstrukcja zakończona, streszczenie wygenerowane, eksport PDF w toku, TTS gotowe, oMLX offline notice, błąd pobierania.
- **Mobile 390 px**: te same 10 stanów w jednej kolumnie.
- **Mobile 320 px**: edge case dla najmniejszego obsługiwanego width.

Nie dodawać nowych funkcji.
Nie generować marketingowych sekcji.
Nie pisać kodu produkcyjnego w tym pliku.

---

# Komponent Atlas (atomic structure, dziedziczony)

Wszystkie komponenty dziedziczą tokeny z `ZOLZOTRON_APP_DESIGN_SYSTEM.md` §3 i sekcji 2–4 tego pliku. **Nie dodawać nowych kolorów, promieni, rozmiarów.** Rozszerzać atlas wyłącznie o komponenty z powyższych sekcji 5–11.

## A. Atomy

### A.1. Button

**Primary**

- Tło: `--app-navy` (`#0D2035`).
- Tekst: `--app-surface` (`#FFFDF9`).
- Radius: 10 px.
- Padding: 12 px 20 px.
- Wysokość minimalna: 44 px.
- Font weight: 500.
- Transition: 160 ms (opacity / transform / background).
- Stany: default, hover (`translateY(-1px)` + tło jaśniejsze o 4%), focus (2 px outline `--app-lime`, offset 2 px), active, disabled (opacity 0.5, cursor `not-allowed`), loading (ikona + `cursor: wait`).

**Secondary**

- Tło: transparent.
- Obramowanie: 1 px solid `--app-border` (`#D8DEE5`).
- Tekst: `--app-text` (`#071525`).
- Radius: 10 px, padding 12 px 20 px, min-height 44 px.
- Stany: default, hover (tło `--app-bg`), focus, active, disabled, loading.

**Destructive**

- Stosować wyłącznie do: `Zatrzymaj generowanie` (jeśli kiedyś się pojawi) i `Wyczyść cache`. W v1 nie ma destrukcyjnych akcji w UI.

**Icon button**

- Kwadrat 40 × 40 px.
- Tło: transparent.
- Hover: tło `--app-bg`.
- Ikona: 20 px, kolor `--app-text-muted`. **Zawsze z `aria-label`.**

### A.2. Input

- Tło: `--app-surface` (`#FFFDF9`).
- Obramowanie: 1 px solid `--app-border` (`#D8DEE5`).
- Radius: 10 px.
- Padding: 12 px 16 px.
- Font size: 16 px.
- Focus: 2 px outline `--app-lime`, offset 2 px.
- Error: obramowanie `--app-error`, helper text w kolorze `--app-error`.
- Helper text: 14 px, `--app-text-muted`.

### A.3. Textarea

- Dziedziczy z Input.
- Min-height: 120 px.
- Max-height: 320 px.
- Auto-grow: tak, do max-height.
- **W tym projekcie textarea NIE JEST UŻYWANA w UI** (URL to jedyne wejście). Pozostawiam definicję dla spójności z systemem.

### A.4. Select

- Dziedziczy z Input.
- Padding: 12 px 16 px.
- Ikona caret: 16 px, `--app-text-muted`.
- Otwarty panel: tło `--app-surface`, border `--app-border`, radius 10 px, cień `0 4px 12px rgba(7, 21, 37, 0.08)`.
- Opcja hover: tło `--app-bg`.
- Opcja selected: tło `--app-lime-soft` (`#EEF8D4`), tekst `--app-text`.

### A.5. Slider

- **Nie używany w v1** (brak parametrów ciągłych w UI). Definicja dziedziczona z systemu dla spójności.

### A.6. Toggle

- Track: 40 × 24 px, radius 12 px.
- Track off: `--app-border`.
- Track on: `--app-navy`.
- Thumb: 20 px okrąg, tło `--app-surface`.
- Transition: 160 ms.
- W v1 używany do: tryb `Manual / Auto` (jeśli kiedyś się pojawi), streaming on/off. Na razie brak.

### A.7. Checkbox

- Kwadrat 20 × 20 px.
- Border: 1.5 px `--app-border`.
- Radius: 4 px.
- Checked: tło `--app-navy`, check ikona w `--app-surface`.
- Focus: 2 px outline `--app-lime`.
- **Nie używany w v1.**

### A.8. Badge

- Padding: 4 px 10 px.
- Radius: 999 px.
- Font size: 12 px.
- Font weight: 500.
- Line-height: 1.
- Tła (dla yt-transcript):
  - `info` — `--app-info-soft` (`#E4EEF8`), tekst `--app-info` (`#315C8C`).
  - `success` — `--app-success-soft` (`#E2F1E8`), tekst `--app-success` (`#2D6A4F`).
  - `warning` — `--app-warning-soft` (`#FFF1C2`), tekst `--app-warning` (`#8A5A00`).
  - `error` — `--app-error-soft` (`#F8E4E1`), tekst `--app-error` (`#B94A48`).
  - `neutral` — `--app-bg`, tekst `--app-text-muted`.
  - `accent` (lime) — `--app-lime-soft` (`#EEF8D4`), tekst `--app-text`. Używany: badge `Rekonstrukcja AI • …` w nagłówku sekcji.
  - `accent-violet` — `--app-violet-soft` (`#ECE8FF`), tekst `--app-violet` (`#694FD8`). Używany: badge eksportu (TXT / SRT / MD / PDF / WAV), badge `Audio gotowe`.

### A.9. Notice

- Padding: 16 px.
- Radius: 10 px.
- Border-left: 3 px solid (zależy od typu).
- Typy: `info`, `warning`, `success`, `error`, `privacy`.
- Nagłówek: 14 px, weight 600.
- Body: 14 px, line-height 1.55.
- Maksymalna szerokość: 720 px.
- Ikona opcjonalna: 20 px, po lewej.
- **W tym projekcie używany powszechnie** — dla każdego stanu błędu, braku providera, braku Piper, limitu tokenów.

### A.10. Icon (system)

- Rozmiar: 16 / 20 / 24 px.
- Kolor: `--app-text-muted` (domyślnie), `--app-text` (aktywny).
- Stroke: 1.5 px.
- Biblioteka: **wyłącznie lucide / phosphor**, bez custom ikon.
- Dozwolone w tym projekcie: caret, chevron, chevron-down, chevron-right, play, pause, stop, refresh, check, x, alert-triangle, info, lock, download, file-text, file-audio, file-code, clock, hash, settings, external-link, search, sparkles (rekonstrukcja AI), list (streszczenie), volume-2 (TTS).

### A.11. Skeleton

- Tło: `--app-bg` z shimmerem.
- Border-radius: zależy od elementu (10 px dla inputów, 14 px dla karty transkryptu, 999 px dla badgeów).
- Animation: 1.4 s linear infinite.
- **Używany oszczędnie** — tylko do ładowania pierwszej strony (jeśli w ogóle). Wewnątrz aplikacji preferuję spinner + komunikat.

## B. Molekuły

### B.1. Form field

- Składa się z: label + control (Input / Select) + helper text + (opcjonalnie) character counter + error message.
- Odstęp: 8 px między label a control, 4 px między control a helper.
- Max-width: 720 px (input URL), 360 px (select języka TTS).

### B.2. Toggle row

- Składa się z: label + Toggle + helper text.
- Layout: flexbox, label left, toggle right.
- Padding: 12 px 0.
- **Nie używany w v1**, ale definicja zostaje dla przyszłych flag.

### B.3. Status pill (Status providera)

- Składa się z: ikona (16 px) + Badge (typ: `success` / `warning` / `error`) + opcjonalny krótki tekst.
- Inline, nie łamie się.
- Przykłady: `● oMLX: online`, `⚠ oMLX: degraded`, `✕ oMLX: offline`.

### B.4. Step indicator (dla statusu przetwarzania AI)

- Składa się z: ikona (16 px) + tekst statusu + opcjonalnie progress count.
- Layout: inline, w headerze sekcji.
- Statusy:
  - `idle` — ikona `sparkles` szara, tekst `Rekonstrukcja AI` (gotowa do kliknięcia).
  - `running` — ikona `sparkles` lime, tekst `Rekonstruuję…` (z animacją obrotu), opcjonalnie `3 z 5 akapitów`.
  - `done` — ikona `check` success, tekst `Rekonstrukcja zakończona • 4.2s • 1240 tokenów`.
  - `error` — ikona `alert-triangle` error, tekst `Błąd rekonstrukcji`, klikalne „Spróbuj ponownie".

### B.5. Segment control (tryb wyświetlania transkryptu, wybór języka TTS)

- Składa się z: 2–3 opcji w rzędzie, aktywna wyróżniona tłem.
- Border: 1 px `--app-border` wokół całości, radius 10 px.
- Aktywna opcja: tło `--app-surface`, border wewnętrzny 1 px `--app-navy`, tekst `--app-navy`, weight 500.
- Nieaktywna: tło transparent, tekst `--app-text-muted`.
- Padding opcji: 8 px 16 px, min-height 36 px (touch-friendly).
- Focus: 2 px outline `--app-lime` na aktywnej opcji.
- **Uwaga**: to NIE jest `Tabs` z shadcn — prostsza implementacja bez role=tablist (chyba że accessibility review wykaże potrzebę).

## C. Organizmy

### C.1. Karta transkryptu

- Kontener: tło `--app-surface`, border 1 px `--app-border`, radius 14 px, padding 24 px desktop / 16 px mobile, max-width 720 px.
- Header: tryb wyświetlania (segment control) + licznik znaków (mono 12 px, muted) + czas trwania filmu (mono 12 px, muted) + język napisów (badge neutral) + status rekonstrukcji (step indicator B.4).
- Toolbar akcji: sticky u góry (desktop) / inline pod headerem (mobile).
- Body: transkrypt w trybie `Surowy` (snippety z timestampami) lub `Rekonstrukcja AI` (czyste akapity).
- Aktywna operacja AI: border-top 3 px `--app-lime` na czas generowania.

### C.2. Sekcja Streszczenie AI

- Kontener: tło `--app-surface`, border 1 px `--app-border`, radius 14 px, padding 24 px, max-width 720 px.
- Header: `Streszczenie` (h2, 16 px, weight 600) + step indicator B.4 (status generowania).
- Body: lista bulletów 15 px, line-height 1.6, padding-left 20 px (klasyczne wcięcie, **nie** własne ikonki w bulletach).
- Badge pod headerem: `Wygenerowano • model • czas • tokeny` (typ `neutral`).
- Aktywna operacja: border-top 3 px `--app-lime` + spinner w step indicatorze.

### C.3. Sekcja TTS

- Kontener: `<details>` zwijane, tło `--app-surface`, border 1 px `--app-border`, radius 14 px, padding 16 px, max-width 720 px.
- Summary: `▶ Czytanie na głos` (14 px, weight 600) + badge statusu (jeśli audio gotowe: `accent-violet` z metadanymi).
- Body po rozwinięciu:
  - Segment control: język (pl / en / de).
  - Przycisk `Generuj audio` (primary, navy).
  - Player audio HTML5 (z `aria-label`).
  - Przycisk `Pobierz WAV` (secondary, z ikoną `download`).
- Stan Piper brak: notice `warning` zamiast przycisku.
- Stan audio gotowe: badge `accent-violet` `Audio gotowe • 12.4s • 240 KB`.

### C.4. Eksport dropdown

- Kontener: dropdown menu anchored do przycisku `Eksportuj…` w toolbarze akcji.
- Tło: `--app-surface`, border 1 px `--app-border`, radius 10 px, cień `0 4px 12px rgba(7, 21, 37, 0.08)`.
- Każda pozycja menu: ikona formatu (16 px) + nazwa (`TXT` / `SRT` / `Markdown` / `PDF`) + badge `accent-violet` `Pobierz`.
- Hover: tło `--app-bg`.
- Focus: 2 px outline `--app-lime`.
- Kliknięcie → natychmiastowy download, bez podglądu w aplikacji.

### C.5. Panel diagnostyczny

- Kontener (desktop): prawa kolumna, sticky, max-width 320 px, tło transparent (bez karty).
- Kontener (mobile): `<details>` na dole, zwinięte domyślnie, tło `--app-bg`, radius 10 px, padding 12 px.
- Pola (każde mono 12 px, muted, label + wartość w jednej linii):
  - `Build: v3.2.0`
  - `Provider: oMLX`
  - `Model: <name>`
  - `Cache: hit | miss`
  - `Czas pobrania: X ms`
  - `Czas rekonstrukcji: X ms`
  - `Czas streszczenia: X ms`
  - `Tokeny: in=N out=M`
  - `Audio (jeśli wygenerowane): czas, rozmiar, język`
- Odstęp między polami: 8 px.

### C.6. Privacy notice

- Kontener: notice typu `privacy` (zdefiniowany w `ZOLZOTRON_APP_DESIGN_SYSTEM.md` §4.5 — rozszerzenie), max-width 720 px, margin-top 24 px.
- Treść: `Lokalne przetwarzanie. Transkrypty i zapytania do modelu nie opuszczają tej maszyny. To demonstrator, nie system produkcyjny.`
- Stały element, widoczny w każdym stanie aplikacji.
- **Nie ukrywać w `<details>`, nie chować za buttonem „Pokaż szczegóły".**

### C.7. Top bar

- Kontener: tło `--app-surface`, border-bottom 1 px `--app-border`, wysokość 56 px, padding 0 24 px (desktop) / 0 16 px (mobile), sticky do góry.
- Lewa: `▶ ytTranscript` (16 px, weight 600) + subtitle mono 12 px `v3.2.0`.
- Prawa: status providera (pill B.3) + ikona `settings` (otwiera panel diagnostyczny w drawerze na mobile) + link `Dokumentacja`.

---

**Następne kroki implementacyjne (poza zakresem tego pliku)**:

1. Utworzyć `docs/UI_UX_REVIEW_YT_TRANSCRIPT.md` z audytem bieżącego GUI.
2. Wdrożyć wariant Hybrid (C) z §14.
3. Zaktualizować `CHANGELOG.md` po każdej wdrożonej sekcji.
4. Dodać testy manualne edge cases (§12) do `docs/LOCAL_SETUP.md`.
5. Zrobić screenshoty `desktop 1280` + `mobile 390` + `mobile 320` dla każdego z 10 stanów i wrzucić do `docs/screenshots/`.
