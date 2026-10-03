## 2026-10-03 — ytTranscript + ekosystem: sprzątanie kopii, backup repo i KRYTYCZNY wyciek klucza API (271c2c0, 7850a0c)

- **Co:** Polecenie: „na Maku Studio ma zostać sklonowane repozytorium zapasowe; nadliczbowe klony/kopie i śmieci wysprzątać". Wykonano inwentaryzację (read-only) **przed** jakimkolwiek kasowaniem i zweryfikowano każde usunięcie pod kątem odtwarzalności. **Przy okazji wykryto i załatano żywy wyciek sekretów do publicznego repo.**
- **Projekt:** `yt-transcript` + porządki w `PORTFOLIO/` i `~/Library/Developer/XcodeBuildMCP/`
- **Backup zapasowy (utworzony):** `/Users/radek/BACKUPS/yt-transcript.git` — `git clone --mirror` (644 KB, **133 commity, wszystkie 4 branche + tag v3.4.0**, zawiera wszystkie dzisiejsze naprawy). Weryfikacja: `git clone` z mirrora do `/tmp` odtworzył pełne drzewo i `diagnostics.js` z naprawą. Katalog `BACKUPS/` nie istniał wcześniej — utworzony jako kanoniczna lokalizacja kopii zapasowych repo.
- **Usunięto (po weryfikacji odtwarzalności):**
  - `Documents/Projects/yt-transcript.backup-pre-reconstruct-fix-20260719-120000` (208 MB) — wszystkie 11 untracked plików identycznych w main; unikalne tylko 3 regenerowalne pliki builda Vite
  - `…yt-transcript.backup-pre-reconstruct-fix-20260719-001346` (208 MB) — jak wyżej
  - `…yt-transcript.backup-pre-fallback-restore-20260720161757` (219 MB) — 14/14 untracked identycznych w main; `buildProviderChain` zastąpiony nowszym `createProviderStateMachine`; `AI_DAILY_LIMIT=5` → 6 to celowa zmiana, nie regresja
  - `PORTFOLIO/portfolio-rp (backup)` (1.0 GB, z czego **918 MB node_modules**) — HEAD `1038782` jest przodkiem live; 2 miesiące stęchła (22 vs 82 commity)
  - `PORTFOLIO/DEPRECATED/audit-backups/…/yt-transcript` (114 MB, 106 MB = `client/node_modules`)
  - `PORTFOLIO/DEPRECATED/audit-backups/…/ai-discuss-stage` (96 MB, głównie node_modules) — HEAD `e43ce1d` przodek live
  - `~/Library/Developer/XcodeBuildMCP/workspaces/yt-transcript-409ada0b11bf` (pusty, tylko `last-cleanup`)
  - Razem **~2.1 GB**.
- **Zachowano (unikalna treść, nieodtwarzalna z historii git):**
  - `BACKUPS/yt-transcript-preserved-snapshots-20261003-153208/` — 3 snapshoty `*.backup-*`, których blobów **nie ma w żadnym commicie** historii (byte-exact search po 741 obiektach): `index.html.backup-20260621-before-v3.4.1-fix`, `server.js.backup-20260612-053711-…`, `server.js.backup-20260621-before-v3.4.1-fix`. + README z manifestem sha256.
  - `BACKUPS/portfolio-rp-preserved-2026-07-08-20261003-153532/` — 4 pliki nieobecne w historii ani na dysku live: `EXECUTION_LEDGER.md` (SEO/perf, **referowany w `project-registry.md` 2026-07-10**), `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `test-canonical-hero.mjs`
  - `BACKUPS/ai-discuss-stage-preserved-20261003-153629/` — wczesny monolityczny `backend/server.js` + bliźniaczy `.bak`
- **KRYTYCZNE — wyciek sekretów do publicznego repo (naprawiony):**
  - Repo `Lord-Kedaar/yt-transcript` jest **publiczne**. GitHub secret scanning alert **#1** (`mistral_ai_api_key`, `publicly_leaked: true`, otwarty **2026-07-20**) wskazywał `.env:11` w commitach `4b93fd5` i `afb786d`.
  - `.env` był **śledzony w HEAD** i serwowany bez autoryzacji przez `raw.githubusercontent.com` (HTTP 200). Klucz Mistral **nadal aktywny** (test `GET /v1/models` → 200). Ten sam klucz na produkcji Lenovo (identyczny sha256).
  - **Dodatkowo** klucz oMLX leżał w 3 śledzonych plikach dokumentacji: `CHANGELOG.md`, `docs/SECURITY_NOTES.md`, `docs/archive/…/CHANGELOG.md`.
  - Naprawa: (1) `git rm --cached .env` + commit `271c2c0` — plik lokalny pozostał, `.gitignore` już go obejmował; (2) redakcja klucza oMLX do `<omlx-key-redacted>` w 3 dokumentach + commit `7850a0c`; (3) usunięcie 3 nieśledzonych kopii `.env` z drzewa (`docs/archive/…/.env`, `.env.test.backup`, `.env.backup-pre-fallback-*`) — wszystkie z żywymi kluczami; (4) redakcja klucza w 4 plikach poza repo (skill `hermes-runtime-reliability` w profilach metricus/conflux + 2 backupy w `06-artifacts`, 2 logi kanban).
  - **Weryfikacja końcowa:** klucz Mistral występuje w **1 pliku** — canonical `.env` (gdzie ma być). W `origin/main` **zero** żywych sekretów w tracked files.
  - **UWAGA — rotacja nadal wymagana:** redakcja nie cofa publikacji. Stare commity wciąż serwują klucz. **Klucz Mistral i oMLX wymagają rotacji u dostawcy** — patrz `NEXT_ACTIONS`.
- **Build:** `node --check` OK; **testy 134/134 PASS, 0 fail**; lokalny health 200 + transcript 200; produkcja Lenovo `active/enabled` health 200; publiczny health 200.
- **Plik:** `CHANGELOG.md`, `docs/SECURITY_NOTES.md`, `docs/archive/2026-06-21-before-task1/CHANGELOG.md`, `.gitignore`(wcześniej), `server.js`, `test/daily-limit.test.js`, `.github/workflows/ci.yml`; nowe: `BACKUPS/*`
- **Raport:** brak osobnego raportu.
- **Rollback:** mirror `BACKUPS/yt-transcript.git` pozwala odtworzyć dowolny stan; usunięcia kopii są nieodwracalne, ale każda zweryfikowana jako odtwarzalna (dowód w README-ach katalogów `*-preserved-*`).
- **Status:** `DONE_WITH_LIMITATIONS` — sprzątanie i załatanie wycieku zweryfikowane; **rotacja kluczy pozostaje po stronie właściciela** (wymaga dostępu do konsoli Mistral).

## 2026-10-03 — ytTranscript: domknięcie case'a — nadzór produkcyjny, CI, dług testowy (263daea, 2e1dc0d)

- **Co:** Dokończenie sprawy „Failed to fetch transcript." — po naprawie klasyfikacji błędów (`9771fd8`) zostały **cztery realne problemy systemowe**, wykryte przy weryfikacji. (1) **Produkcja bez nadzoru** — `yt-transcript.service` był `enabled`, ale **martwy od 2026-07-26** i wskazywał `WorkingDirectory` na **zamrożony katalog release** `yt-transcript-release-a558150-20260723T190911Z` (206 MB, kod bez naprawy). Produkcja od 2 miesięcy chodziła jako **proces manualny** (`setsid nohup node server.js`, rodzic = orphan `bash` z PPID 1). Po restarcie maszyny systemd podniósłby **dwumiesięczny kod z bugiem** → realna mina. Unit przepisany: canonical `WorkingDirectory=/srv/storage/AI_Projects/yt-transcript`, `ExecStart=/usr/bin/node server.js` (zamiast `npm start`, który przy każdym boocie przebudowywał klienta Vite — produkcja serwuje root `index.html`, nie `client/dist`), `Restart=always`, `StartLimitIntervalSec=0` w `[Unit]` (NFS może nie być zamontowany w chwili startu), logi do `~/.hermes/logs/yt-transcript.log`. (2) **CI nigdy się nie uruchamiało** — workflow celował w `master`, repo używa `main`; żaden push nie był weryfikowany. (3) **Dług testowy** — `test/daily-limit.test.js` zakładał serwer na :4005, którego nic nie podnosiło (5 z 5 awarii suite'u); teraz sam spawnuje serwer na :4015, czeka na `/api/health` i sprząta w `after()`. (4) **Wyciek runtime'owy** — `.ai-daily-limit.json` (hash IP per odwiedzający) **nie był w `.gitignore`**; `git add -A` skomitowałby identyfikatory gości. Dodatkowo `server.js` honoruje teraz `YTTRANSCRIPT_AI_LIMIT_STORE`, żeby testy nie nadpisywały produkcyjnego store'a.
- **Projekt:** `yt-transcript` — Mac `/Users/radek/Documents/Projects/yt-transcript`; produkcja Lenovo `/srv/storage/AI_Projects/yt-transcript`
- **Plik:** `server.js` (store override), `test/daily-limit.test.js` (przepisany na samowystarczalny), `.github/workflows/ci.yml` (main + Node 22 + `workflow_dispatch` + testy serwera), `.gitignore`; na Lenovo: `~/.config/systemd/user/yt-transcript.service`
- **Build:** `node --check` OK; ESLint czysto; Prettier `All matched files use Prettier code style`; `npm run build` PASS; **testy 134/134 PASS, 0 fail** (przed: 128 pass / 5 fail)
- **Preview:** lokalny `:4000` health 200, transcript 200; **produkcja Lenovo pod systemd** PID 4015018 — `active`/`enabled`, `Linger=yes`, health 200, kod z naprawą obecny; publiczny `https://yttranscript.radoslaw-pleskot.com/` health 200 + transcript 200 (2,5 s). **Testy trwałości:** restart przez systemd OK; **SIGKILL → systemd wskrzesił proces** (4014060 → 4014162), health 200; `default.target` ciągnie unit przy boocie. Parzystość hashów Mac↔Lenovo potwierdzona dla `server.js`.
- **Raport:** brak osobnego raportu.
- **Rollback:** Lenovo `~/.config/systemd/user/yt-transcript.service.bak-20261003T124141Z` (stary unit) + `systemctl --user daemon-reload`; Mac `.backups/errclass-fix-20261003-135632/`; logi incydentu `/tmp/yt-transcript-public.log.incident-20261003`.
- **Status:** `DONE_VERIFIED`
- **Uwaga:** Stary katalog release (`…release-a558150-20260723T190911Z`, 206 MB) **pozostawiony na dysku celowo** — brak referencji w configach, ale usunięcie to decyzja właściciela (obok 6 innych katalogów `yt-transcript-*` zajmujących łącznie ~1,4 GB). Gdyby unit był kiedykolwiek przywracany z backupu, wskazałby na ten katalog.

## 2026-10-03 — fix: „Failed to fetch transcript." — klasyfikacja błędów sieciowych undici (commit 9771fd8)

- **Co:** Zgłoszenie: ytTranscript pokazuje „Failed to fetch transcript.". Diagnoza: **dwie warstwy**. (1) **Incydent sieciowy na Lenovo** — produkcyjny log `/tmp/yt-transcript-public.log` pokazał okno 13:43–13:44 z `Transcript fetch error: TypeError: fetch failed` + `[cause]: AggregateError [ETIMEDOUT]` (16 adresów w `errors[]`); w tym samym oknie `provider.health.failed` dla Mistral (`fetch failed`, przejście PRIMARY→FALLBACK_OPEN). Sieć wróciła sama — po incydencie 10/10 prób do YouTube OK, a produkcja pobiera transkrypty poprawnie. (2) **Realny defekt klasyfikacji w kodzie** — `isRetryableError()` i `classifyError()` patrzyły wyłącznie na `err.message`; Node `fetch` zgłasza gołe `TypeError: fetch failed`, a prawdziwy kod (`ETIMEDOUT`, `ECONNRESET`, `EAI_AGAIN`, `UND_ERR_*`) siedzi w `err.cause` (często w `AggregateError.errors[]`, po jednym wpisie na adres). Skutek: przejściowa awaria sieci **nie była retryowana** i zwracała **HTTP 500 zamiast 503**. Dodano `collectErrorSignals()` (przejście po łańcuchu `cause`, odczyt członków `AggregateError`, kody/name uppercase, ograniczona głębokość — odporna na cykl) + `isRetryableNetworkError()`; `classifyError()` konsultuje te sygnały. **Przy okazji naprawiono pre-existing błąd kolejności**: `AbortSignal.timeout()` odrzuca z `TimeoutError` o treści „The operation was aborted due to timeout", więc test podciągu `'aborted'` wciągał każdy timeout do koszyka `abort` — timeouty sprawdzane są teraz przed abortami.
- **Plik:** `diagnostics.js` (`collectErrorSignals`, `RETRYABLE_NETWORK_SIGNALS`, `isRetryableNetworkError`, `classifyError`), `server.js` (`isRetryableError` korzysta z `isRetryableNetworkError`), `test/diagnostics.test.js` (13 nowych testów regresyjnych)
- **Build:** `node --check` OK; ESLint czysto; Prettier `All matched files use Prettier code style`; `npm run build` PASS (287 modułów, pre-existing warning o chunku); **diagnostics 82/82 PASS**, pełny suite **128 pass / 5 fail** (te same 5 pre-existing `daily-limit` wymagających serwera na :4005 — bez zmian względem baseline 115/120); `git diff --check` czysty
- **Preview:** lokalny `http://127.0.0.1:4000` PID 75145 — `/api/health` 200, `/` 200, `/api/transcript` 200; **produkcja Lenovo** PID 3998995 na `*:4002` (restart 14:10:10, po wgraniu plików 14:10:00) — `/api/health` 200, 404 dla braku napisów, 400 dla złego URL (bez regresji); **publiczny** `https://yttranscript.radoslaw-pleskot.com/`: health 200, 4/4 świeże wideo HTTP 200. Hashe Mac↔Lenovo zgodne dla obu plików.
- **Raport:** brak osobnego raportu.
- **Rollback:** Mac `.backups/errclass-fix-20261003-135632/server.js.pre`; Lenovo `/srv/storage/AI_Projects/_archive/yt-transcript/20261003T120926Z-errclass-fix/{server.js,diagnostics.js,diagnostics.test.js}`; log incydentu zachowany jako `/tmp/yt-transcript-public.log.incident-20261003`; po przywróceniu restart `node server.js`.
- **Uwaga:** Naprawa usuwa *fałszywą twardą awarię* (brak retry + złe 5xx), ale **nie usuwa przyczyny samego zaniku sieci** — to warstwa infrastruktury Lenovo (brak trasy IPv6 przy AAAA-first DNS, Tailscale `UDP is blocked`, DERP failover o 13:47). Kolejny taki blip zostanie teraz zamaskowany retryem i zgłoszony jako 503 zamiast 500.

## 2026-09-21 — ytTranscript — AI progress nad transkrypcją

- **Co:** Przeniesiono `#aiProgress` nad przewijalny `#transcriptBody`, zachowując istniejący spinner, animację, tekst statusu i `aria-live="polite"`; zmieniono separator z górnego na dolny.
- **Plik:** `index.html` (aktywny root frontend); publiczny runtime `/srv/storage/AI_Projects/yt-transcript/index.html`
- **Build:** `npm run build` PASS (287 modułów; pre-existing warning o dużym chunku); client tests 2 suite PASS; `node --check server.js` PASS; `git diff --check` PASS.
- **Preview:** publiczny `https://yttranscript.radoslaw-pleskot.com/` HTTP 200; `/api/health` HTTP 200; runtime PID 835028 na `*:4002`; publiczny HTML potwierdza kolejność `#aiProgress` → `#transcriptBody`.
- **Raport:** brak osobnego raportu.
- **Rollback:** lokalny `.backups/ai-progress-top-20260921-044924/index.html.pre`; zdalny `/srv/storage/AI_Projects/_archive/yt-transcript/20260921T025142Z-ai-progress-top/index.html.pre`; po przywróceniu zrestartować `node server.js`.

## 2026-09-21 — ytTranscript — deploy selekcji języka na Lenovo public runtime

- **Co:** Wdrożono wyłącznie `server.js` do faktycznego procesu publicznego `/srv/storage/AI_Projects/yt-transcript`, po backupie zdalnym; zrestartowano ręczny `node server.js` na porcie 4002. Systemd `yt-transcript.service` pozostaje inactive i nie był modyfikowany.
- **Plik:** `/srv/storage/AI_Projects/yt-transcript/server.js`; backup `/srv/storage/AI_Projects/_archive/yt-transcript/20260921T023120Z-transcript-language/{server.js.pre,.env.pre}`
- **Build:** zdalny hash po deployu `5bd445196eee525e55824e2c15a0d305731073e5ab42ff3d9935f330ddcc6bf4`; zgodny z lokalnym.
- **Preview:** publiczny `https://yttranscript.radoslaw-pleskot.com`: `/api/health` HTTP 200, nowy PID 826571 na `*:4002`; domyślny `/api/transcript` HTTP 200 `lang=en`; `lang=de-DE` HTTP 200 `lang=de-DE` z niemieckim tekstem.
- **Raport:** brak osobnego raportu.
- **Rollback:** zatrzymać PID 826571, przywrócić backup `server.js.pre` do runtime root i uruchomić `node server.js`; backup zdalny zachowany poza runtime root.

## 2026-09-21 — ytTranscript — preferowany język transcriptu + fallback tracka

- **Co:** Backend przestał wybierać bezwarunkowo pierwszy track YouTube. Domyślnie żąda `en`, używa pierwszego dostępnego tracka wyłącznie gdy angielski nie istnieje, zachowuje kody BCP 47 (`de-DE`, `pt-BR`), zwraca faktyczny `lang`, rozdziela cache po języku i odrzuca niepoprawne parametry `lang` HTTP 400.
- **Plik:** `server.js`, `.env.example`, `STATE_LOG.md`
- **Build:** `node --check server.js` PASS; `git diff --check` PASS; client tests 2/2 PASS; `npm run build` PASS (287 modułów, ostrzeżenie o dużym chunku pre-existing).
- **Preview:** lokalny `http://127.0.0.1:4551` PID 99197; `/api/health` HTTP 200; domyślny `/api/transcript` HTTP 200 `lang=en`; `lang=de-DE` HTTP 200 `lang=de-DE` z niemieckim tekstem.
- **Raport:** brak osobnego raportu.
- **Rollback:** tag `backup-pre-transcript-language-20260921-042353` / branch `backup/pre-transcript-language-20260921-042353-024cc00`; przywrócenie `server.js` i `.env.example` do HEAD 024cc00.

## 2026-07-20 — ytTranscript — fix: przywrócono bezpieczny fallback oMLX\n\n- **Co:** Przywrócono domyślny fallback LLM_PROVIDER_FALLBACK na 'omlx' w server.js oraz ustawiono jawnie LLM_PROVIDER_FALLBACK=omlx w .env i .env.example, aby spełnić polecenie użytkownika o natychmiastowym przywróceniu kontraktu providerów: primary Mistral, automatyczny fallback na lokalne oMLX.\n- **Plik:** server.js (zmiana domyślnego fallbacku), .env (ustawienie zmiennej), .env.example (aktualizacja przykładu), STATE_LOG.md (ten wpis)\n- **Build:** testy regresyjne scripts/test-fallback-regression.mjs przeszły (6/6)\n- **Preview:** lokalny serwer uruchomiony na porcie 4001, endpoint /api/health zwraca provider=Mistral (ponieważ Mistral jest zdrowy), konfiguracja fallbacku widoczna w kodzie\n- **Raport:** brak osobnego raportu; zmiany opisane w tym wpisie STATE_LOG
## 2026-07-20 — ytTranscript — fix: bezpieczny domyślny fallback (usunięto 'omlx')

- **Co:** Zmieniono domyślny fallback w `server.js` z `'omlx'` na `''` (brak). Dotychczas brak `LLM_PROVIDER_FALLBACK` w `.env` powodował ciche przejście na niestabilny oMLX przy problemach z Mistralem. Poprawiono komentarze w `server.js` i `.env.example` z ostrzeżeniem. Dodano test regresyjny `scripts/test-fallback-regression.mjs` (6/6 passed). Wdrożono na Lenovo (canonical: `LLM_PROVIDER_FALLBACK=omlx` usunięte z `.env`, server.js zaktualizowane, systemd restart). Zweryfikowano live: `/api/health` 200 provider=Mistral, `/api/transform/reconstruct` 200 1.3s model=mistral-small-2603.
- **Plik:** `server.js` (zmiana default fallback), `.env.example` (komentarz), `scripts/test-fallback-regression.mjs` (nowy)
- **Build:** 6/6 testów passed
- **Preview:** Lenovo `http://localhost:4002/api/health` → 200 Mistral connected
- **Raport:** `docs/METRICUS_FIX_MISTRAL_FALLBACK_2026-07-20.md`

# STATE_LOG — ytTranscript

## 2026-09-30 — feat(streaming): SSE transform endpoint + provider chatStream (commit 81560fd)

- **Co:** `POST /api/transform/stream` — delty AI lecą do klienta na bieżąco. Powód: ~94 kB transkryptu = ~70 s prefillu oMLX przed pierwszym tokenem; buforowany klient czekał ~110 s, Cloudflare zamykał krawędź po ~100 s → 524. Nagłówki + `: keep-alive` co 10 s natychmiast po `flushHeaders()`.
- **Plik:** `sse-stream.js` (NOWY), `provider-state-machine.js` (`chatStream()`), `server.js` (`/api/transform/stream`, `buildTransformMessages()`), `index.html` (`readTransformStream`, `doTransformStreaming`, `scheduleStreamPreview`), `test/streaming.test.js` (NOWY)
- **Build:** `node --check` OK; ESLint czysto; **105/105 testów pass**
- **Preview:** E2E CDP 14/14 PASS; oMLX 900 snip = 78,3 s z 7 keep-alive; produkcja Cloudflare 200, pierwsza delta 4,8 s, total 36,7 s
- **Rollback:** `.backups/streaming-20260929-235214/`; flaga `window.YTTRANSCRIPT_STREAMING = false`; stary endpoint nietknięty
- **Uwaga:** `test/daily-limit.test.js` wymaga serwera na :4005 i failuje 4/5 niezależnie od tej zmiany (pre-existing)

## 2026-09-14 — fix: „The string did not match the expected pattern." (WebKit DOMException + martwy fallback oMLX)

- **Co:** Błąd UI zgłoszony przez Radosława. Dwie warstwy: **(1) Frontend** — `res.json()` wywoływane na nie-JSON ciele (Cloudflare 502 `error code: 502`, `text/plain`) rzuca w WebKit/Safari `DOMException SyntaxError` o treści „The string did not match the expected pattern."; parsowanie następowało PRZED sprawdzeniem `res.ok`, więc surowy komunikat WebKit trafiał do `setError()` i do UI. Dodano `readJsonSafe(res)` (odczyt jako tekst → `JSON.parse` w `try/catch`) oraz `failureMessage(res, data, parsed, kind)`; zastąpiono wszystkie bezpośrednie `res.json()` w obsłudze `/api/transcript`, `/api/transform` (w tym gałąź 429), `/api/tts` oraz `probeHealth` (`/api/health`, gdzie `!parsed` jest teraz traktowane jak offline). **(2) Backend** — konto Mistral zwraca `429 Rate limit exceeded` z nagłówkiem `x-ratelimit-limit-req-minute: 0` (limit minutowy = 0; nie jest to chwilowy throttling), a fallback oMLX na Lenovo wskazywał `OMLX_URL=http://127.0.0.1:8585` — port, na którym oMLX **nie nasłuchuje** (oMLX działa na Macu). Fallback nie mógł się podnieść → `/api/transform` zwracał 502/503. Zmieniono `OMLX_URL` na `http://100.127.3.65:8585` (Mac via Tailscale). Dodatkowo `.env.example` nadal deklarował `LLM_PROVIDER_FALLBACK=omlx` mimo komentarza „OFF by default" — niespójność pozostawiona do decyzji (patrz Ryzyka).
- **Plik:** `index.html` (nowe `readJsonSafe` + `failureMessage`, 4 call-site), `.env` (Lenovo: `OMLX_URL`)
- **Build:** frontend bez buildu (root `index.html` serwowany wprost); Lenovo `./manage.sh restart` → `npm run build` OK (Vite: 287 modułów, 14,47 s), proces nasłuchuje na `*:4002`
- **Preview:** `https://yttranscript.radoslaw-pleskot.com/` serwuje fix (`readJsonSafe` ×5, `failureMessage` ×4); `POST /api/transform` → 200 dla 2 / 200 / 393 snippetów (11,3 s / 33,8 s / 63,9 s, provider=oMLX); `GET /api/health` → 200, provider=oMLX; licznik providera `successCount: 13, failureCount: 0`; reprodukcja A/B w WebKit: stara wersja → komunikat użytkownika, nowa → „AI service error (HTTP 502). Try again in a moment."
- **Rollback:** Mac `.backups/json-error-fix-20260914-052645/`; Lenovo `.backups/json-error-fix-20260914-055204/` + `.env.backup-pre-omlx-tailscale-20260914-055506`
- **Raport:** `docs/RCA_reconstruct_pattern_mismatch.md`

## 2026-07-07 — ytTranscript — chore/update-favicons: favicon + Apple touch icon + whitelisted asset handler

- **Co:** Dodano favicons i Apple touch icon z paczki `favicon_pack_portfolio_projects_v2/yttranscript/` do repo root (10 plików obok root `index.html`): `favicon.ico`, `favicon-light.svg`, `favicon-dark.svg`, `apple-touch-icon.png`, `favicon-{16,32,48,64,192,512}.png`. W `index.html` wstawione tagi `<link rel="icon">` z media-query dark/light oraz fallback `.ico` i `<link rel="apple-touch-icon">`. W `server.js` dodany whitelist handler routujący wyłącznie 10 nazw assetów przez `res.sendFile` z `__dirname` (obrona: `FAVICON_ASSETS` Set re-check wewnątrz handlera dla defence-in-depth).
- **Plik:** `favicon.ico`, `favicon-light.svg`, `favicon-dark.svg`, `apple-touch-icon.png`, `favicon-{16,32,48,64,192,512}.png` (nowe, root repo), `index.html` (modified, `<head>` dodane tagi), `server.js` (modified, dodany whitelist middleware po `app.use(cors(...))`, przed `/assets` static).
- **Build:** brak — root `index.html` serwowany bezpośrednio, brak bundler. Express serwuje assety z `__dirname` po zaktualizowanym handlerze.
- **Preview:** `node server.js` lokalnie na `127.0.0.1:4002`, każda z 10 nazw zwróciła `HTTP 200` z poprawnym `Content-Type` i rozmiarem odpowiadającym paczce.
- **Ryzyko:** Whitelist jest zamknięta — żadna inna ścieżka nie jest serwowana przez ten handler. Ścieżka `app.use((req, res) => { ... 404 })` na końcu pliku nadal łapie wszystko inne, więc żaden path traversal nie jest możliwy.
- **Dell:** Po deploy na Lenovo Server wymagany jest tylko `node server.js` (process zarządzany ręcznie). `client/dist/` jest nienaruszony; nie ma żadnych zmian bundler-side. Wpływ na lenovo runtime: restart Node, by zaczytać nowy `server.js`.
- **Raport:** `reports/yt-transcript-favicons-2026-07-07.md` (do utworzenia, jeśli potrzebny).

## 2026-06-25 — ytTranscript — cleanup phase 1: Lenovo runtime imported to Mac audit branch

- **Co:** Utworzono branch `audit/import-lenovo-production-20260625` i zaimportowano produkcyjne pliki Lenovo do Mac working tree: `server.js`, root `index.html`, `package.json`, `package-lock.json`, `.env.example`, `DEPLOYMENT_LENOVO_LINUX.md`. Surowy snapshot Lenovo zapisano pod `.audit/lenovo-snapshot-20260625/`. Nie czyszczono jeszcze produkcji; nie kasowano backupów.
- **Plik:** `server.js`, `index.html`, `package.json`, `package-lock.json`, `.env.example`, `DEPLOYMENT_LENOVO_LINUX.md`, `.audit/lenovo-snapshot-20260625/*`, `METRICUS_YTTRANSCRIPT_REPO_RUNTIME_DRIFT_AUDIT_20260625.md`
- **Build:** `node --check server.js` OK; `npm --prefix client run test:summary-parser` OK; `npm --prefix client run test:pdf-pagination` OK; `npm run build` OK (Vite build 1.32s, chunk warning only).
- **Preview:** Local audit preview `PORT=4500 node server.js`: `GET /` 200, `GET /api/health` 200, TTS `type:"reconstruction"` → `audioUrl`, `GET /api/audio/...wav` → 200 57900 B `audio/wav`. Lenovo production untouched and remains running PID 4054067.
- **Raport:** `METRICUS_YTTRANSCRIPT_REPO_RUNTIME_DRIFT_AUDIT_20260625.md`

## 2026-06-25 — ytTranscript — repo/runtime drift audit Mac vs Lenovo

- **Co:** Utworzono audyt rozjazdu między Mac git repo (`main`, `ded7006`) a Lenovo production (`/srv/storage/AI_Projects/yt-transcript`). Ustalenia: Lenovo production nie jest git repo; serwuje root `index.html`; Mac `main` serwuje `client/dist/index.html`; Lenovo `server.js` ma +409/-46 względem Mac i zawiera `/api/ai-limit-status`, `aiDailyLimitGuard`, `ALLOWED_TTS_TYPES` oraz aktywny TTS prep. Raport zawiera klasyfikację bałaganu i bezpieczny 4-fazowy cleanup plan.
- **Plik:** `METRICUS_YTTRANSCRIPT_REPO_RUNTIME_DRIFT_AUDIT_20260625.md`
- **Build:** N/A (audyt dokumentacyjny; brak zmian w runtime/code)
- **Preview:** Lenovo `GET /api/health` 200, `GET /` 200; aktywny proces `node server.js` PID 4054067 cwd `/srv/storage/AI_Projects/yt-transcript`.
- **Raport:** `METRICUS_YTTRANSCRIPT_REPO_RUNTIME_DRIFT_AUDIT_20260625.md`

## 2026-06-20 · Finalna konfiguracja providerów (po testach manualnych)

### Decyzja
- **LLM_PROVIDER=groq** (primary)
- **LLM_PROVIDER_FALLBACK=mistral** (fallback)
- **GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct** (pinned, nie rotuje na compound)
- Mistral small / Groq llama-4-scout / FreeLLMAPI — wszystkie trzy skonfigurowane w `.env`, aktywne 2.

### Dlaczego llama-4-scout a nie groq/compound
- `groq/compound` to Compound AI System Groq — wewnętrznie rotuje na modele (np. `openai/gpt-oss-120b`), co powodowało "Rate limit 8000 TPM" przy dłuższych promptach systemowych (`/api/transform summarize`).
- `meta-llama/llama-4-scout-17b-16e-instruct` to pinned model z `context_window:131072`, prompt ~187 tokenów, mieści się komfortowo w limicie 8000 TPM konta.
- Czas odpowiedzi: ~0.7-1s dla transform (vs 2-3s dla Mistral).
- Output jakościowo porównywalny do Mistral (thematic sections z bold headers, poprawna struktura).

### FreeLLMAPI status (po testach)
- `GET /v1/models` → 200 natychmiast
- `POST /v1/chat/completions` z `model:"auto"` → 8-30s (cold-start rotacja na darmowe modele openrouter)
- Mimo działającego Scrutator (Hermes profil) **nie został wpięty do chain** — rotacja cold-start powodowałaby timeouty 8s dla ytTranscript UI.
- FreeLLMAPI env vars nietknięte w `.env` — dostępne jako opcja na przyszłość.

### Znalezione side-issue (pre-existing, poza scope)
- `/api/transform` zwraca `"reconstructed"` z doklejonym prompt suffixem `"Use paragraphs. Keep every meaning intact."` na końcu. Parser nie obcina tej części. Do zbadania w następnym przebiegu.

---

## 2026-06-20 · Mistral + Groq Providers + Health Cache + Fallback Chain

### Co
- **Nowe providery**: `buildMistralProvider()` (https://api.mistral.ai/v1) i `buildGroqProvider()` (https://api.groq.com/openai/v1). Oba OpenAI-compatible, ten sam `chat()/health()` interface co `buildOmlxProvider` / `buildFreeLLMAPIProvider`.
- **Groq reasoning fallback**: `openai/gpt-oss-20b` zwraca reasoning w `reasoning_content` — parser preferuje `content`, fallback do `reasoning_content` gdy `content` pusty.
- **Health cache** (`HEALTH_CACHE_TTL_MS=3000`): `buildProviderChain()` cache'uje wynik `health()` na 3s żeby `/api/transform` i `/api/lm-status` nie płaciły za cold-start probe przy każdym requeście. Stickiness — jeśli resolved provider jest w cache TTL, NIE robi nowego probe'a.
- **Fallback chain** (`LLM_PROVIDER_FALLBACK=groq`): automatycznie przełącza na następny provider z listy gdy primary ma `health().ok=false`. Aktywny provider jest "sticky" dopóki sam nie zwróci unhealthy.
- **Express-side guard** w `/api/lm-status`: setTimeout 2s jako defense-in-depth dla cold-start edge cases.
- **`build.js` wersja**: czyta `version` z `package.json` zamiast hardcoded `'3.2.0'` (eliminuje drift build-info vs package.json).
- **Fix `/api/transform`**: hardcoded `"oMLX is unreachable."` → template `${llmProvider.name} is unreachable: ${lmStatus.error}` — provider-agnostic.

### Pliki zmienione
- `server.js` — nowe env vars, factory dispatch, provider chain, Mistral/Groq providers, /api/transform fix, /api/lm-status guard, /api/health activeModel switch
- `scripts/build.js` — wersja z package.json
- `.env.example` — sekcje Mistral, Groq, fallback chain, health cache TTL

### Akceptacja ✓
- [x] `LLM_PROVIDER=mistral` + `LLM_PROVIDER_FALLBACK=groq` w `.env`
- [x] `/api/health` → `provider:"Mistral", providerState:"connected", model:"mistral-small-2603", chain:["Mistral","Groq"]`
- [x] `/api/lm-status` × 10 → 10/10 HTTP 200, max 0.27s (przed: 30% timeout)
- [x] `/api/transform` reconstruct → HTTP 200 w 0.95s z `model:"mistral-small-2603"`
- [x] Mistral `/v1/models` direct → HTTP 200, 16 modeli widocznych
- [x] Groq `/openai/v1/models` direct → HTTP 200, modele widoczne
- [x] `buildVersion` w `/api/health` → odświeża się co `npm start` z aktualnym timestampem

### Weryfikacja
```bash
curl -s http://localhost:4000/api/health | jq .
curl -s -X POST http://localhost:4000/api/transform \
  -H "Content-Type: application/json" \
  -d '{"snippets":[{"text":"Hello world test."}],"type":"reconstruct","mode":"original"}' | jq .
```

### Znalezione side-issue (pre-existing, poza scope)
- `/api/transform` zwraca `"reconstructed"` z doklejonym prompt suffixem `"Use paragraphs. Keep every meaning intact."` na końcu. Parser nie obcina tej części. Do zbadania w następnym przebiegu.

### Uwagi
- Health cache TTL=3s: dla single-provider mode transparentne. Dla fallback chain — provider jest sticky przez 3s, potem re-probe.
- Fallback chain loguje `[llm] Switched active provider: X → Y` przy przełączeniu (w `console.log`).
- Rollback: `cp server.js.backup-20260620-190115-before-mistral-groq-providers server.js && ./manage.sh restart`

---

## 2026-06-17 · LLM Provider Abstraction + FreeLLMAPI Migration

### Co
- **Provider abstraction layer** w `server.js` — `llmProvider` singleton z `chat()` i `health()` interface
- **Dwa providery**: `buildOmlxProvider()` (domyślny, backwards-compatible) i `buildFreeLLMAPIProvider()`
- **Env-driven switch**: `LLM_PROVIDER=omlx|freellmapi` — zero edycji kodu przy zmianie providera
- **FreeLLMAPI podłączony**: `http://127.0.0.1:3001`, model `auto` (automatyczna rotacja: deepseek-v4-flash, openrouter/owl-alpha)
- `/api/health` i `/api/lm-status` — dynamiczny provider name
- `/api/transform` — przepisany na `llmProvider.chat()`, wyniki pokazują `provider: "FreeLLMAPI"` + faktyczny model

### Pliki zmienione
- `server.js` — provider factory, `llmProvider` singleton, przepisany `/api/transform`
- `.env` — dodane `LLM_PROVIDER=freellmapi`, `FREELLMAPI_*`
- `.env.example` — zaktualizowany z dokumentacją obu providerów
- Backup: `server.js.backup-20260617-<timestamp>-before-freellmapi`

### Akceptacja ✓
- [x] Provider config: `LLM_PROVIDER=freellmapi` → `FREELLMAPI_URL=http://127.0.0.1:3001`
- [x] Model: `auto`
- [x] API key: `freellmapi-745a48317f4c96e7f2da0f1c59fd1757905a3e8eb5815134`
- [x] `/api/health` → `"provider":"FreeLLMAPI","state":"connected"`
- [x] `/api/transform` (reconstruct) → `"model":"deepseek-v4-flash","provider":"FreeLLMAPI"`
- [x] `/api/transform` (summarize) → `"model":"openrouter/owl-alpha","provider":"FreeLLMAPI"` (rotacja działa)
- [x] Brak residualnych ref do oMLX w server.js (poza legacy comments i backwards compat config)

### Weryfikacja
```bash
curl http://127.0.0.1:4000/api/health
# {"status":"ok","provider":"FreeLLMAPI","providerState":"connected"...}
```

### Uwagi
- FreeLLMAPI działa tylko lokalnie na Mac Studio (port 3001 na 127.0.0.1)
- Na Lenovo-Serwer: trzeba wystawić przez Tailscale (TODO: osobne zadanie)
- `buildOmlxProvider()` zachowuje pełną logikę fallback models (nie zmieniona)
- Dla nowego providera: wystarczy dodać `build<Xxx>Provider()` i dopisać do `buildLlmProvider()`

---

## 2026-06-25 — ytTranscript — reconciliation: import Lenovo runtime + cleanup of staging artifacts

- **Co:** Na branchu `reconciliation/lenovo-runtime-20260625` zatwierdzono kanoniczne commity: (1) `feat(import)` — `server.js`, root `index.html`, `package*.json`, `.env.example` z Lenovo production; (2) `docs` — `README.md`, `docs/LOCAL_SETUP.md`, `DEPLOYMENT_LENOVO_LINUX.md` dopasowane do produkcyjnej architektury (port 4002, NFS path, root `index.html`, single-file UI), plus `.gitignore` dla `backups/`, `.audit/`, `METRICUS_*_REPORT.md`, `YTTRANSCRIPT_*_REPORT.md`; (3) `chore(archive)` — raporty operacyjne i snapshot `2026-06-21-before-task1` przeniesione do `docs/archive/` (z `docs/archive/*/.gitignore` chroniącym `.env`); (4) `docs(audit)` — kanoniczny raport z audytu.
- **Plik:** `server.js`, `index.html`, `package.json`, `package-lock.json`, `.env.example`, `README.md`, `docs/LOCAL_SETUP.md`, `DEPLOYMENT_LENOVO_LINUX.md`, `.gitignore`, `docs/archive/**`, `METRICUS_YTTRANSCRIPT_REPO_RUNTIME_DRIFT_AUDIT_20260625.md`
- **Build:** `node --check server.js` OK; `npm --prefix client run test:summary-parser` OK; `npm --prefix client run test:pdf-pagination` OK; `npm run build` OK (Vite build 1.32s, chunk warning only — Vite jest pomostowo, runtime root `index.html` samodzielny).
- **Preview:** Local `PORT=4500 node server.js` po imporcie: `GET /` 200, `GET /api/health` 200, TTS `type:"reconstruction"` → `audioUrl`, audio GET 200 `audio/wav`. Lenovo production `/api/health` 200, `/` 200, PID 4054067 nadal działa (serwer czyta pliki per-request, runtime root wyczyszczony).
- **Raport:** `METRICUS_YTTRANSCRIPT_REPO_RUNTIME_DRIFT_AUDIT_20260625.md`

### Lenovo production cleanup (B)
- **Co:** Przeniesiono poza runtime root do `/srv/storage/AI_Projects/_archive/yt-transcript/<UTC-ts>-cleanup/` wszystkie `*.bak-*`, `*.backup-*`, `.env.backup-*`, `.write-test`, `server.log`, `manage.sh.bak.*`, `start-frontend.sh.bak.*` oraz katalog `client/` (Vite fallback assets).
- **Backup:** `/srv/storage/AI_Projects/_archive/yt-transcript/20260625T105940Z/yt-transcript-runtime.tgz` (450 KB)
- **W runtime root zostały:** `CHANGELOG.md`, `DEPLOYMENT_LENOVO_LINUX.md`, `.env`, `.env.example`, `index.html`, `manage.sh`, `package.json`, `package-lock.json`, `server.js`, `start-frontend.sh`, `node_modules/`, `.gitignore`.
- **Walidacja:** `GET /api/health` 200, `GET /` 200 po cleanupie; proces `node server.js` PID 4054067 ciągle aktywny.

## 2026-07-18 — dual-stack bind dla Cloudflare Tunnel
- **Co:** Domyślny bind originu zmieniony z IPv4-only `0.0.0.0` na `process.env.HOST || '::'`, aby `localhost` rozwiązywany przez tunnel do `[::1]:4002` działał bez utraty jawnego override `HOST`.
- **Plik:** `server.js`
- **Build:** canonical staging Lenovo: `npm run build` — Vite 287 modules, 11.80s; `node --check server.js` OK.
- **Preview:** `127.0.0.1`, `[::1]`, publiczne `/` oraz `/api/health` — HTTP 200 po restarcie przez `yt-transcript.service`.
- **Raport:** `/tmp/yt-transcript-canonical-rollback-plan.md`; rollback: `git revert <commit>` + `systemctl --user restart yt-transcript.service`.

## 2026-07-23 — ytTranscript — feat: state machine recovery Mistral ↔ oMLX

- **Co:** Zaimplementowano bezpieczny recovery z fallbacku oMLX do primary Mistral zgodnie z werdyktem Mordaxa CONDITIONAL_APPROVE. Zastąpiono buildProviderChain.active() z provider-state-machine.js implementującą PRIMARY→FALLBACK_OPEN→HALF_OPEN→PRIMARY state machine z monotonicz cooldown, bounded backoff/jitter, single-flight probe, pełną macierzą błędów i strukturalną telemetrią JSONL. Naprawiono modelType w logach na activeProvider, dodano configuredProvider/activeProvider/providerStateMachine/providerCounters do /api/health.
- **Plik:** provider-state-machine.js (nowy, 587 linii), server.js (integracja state machine, poprawka modelType, rozbudowa /api/health), test/provider-state-machine.test.js (nowy, 20 testów), docs/ADR_PROVIDER_RECOVERY_STATE_MACHINE.md (nowy ADR), docs/REPORT_MISTRAL_FALLBACK_RECOVERY_DEPLOY_FINAL.md (final raport), STATE_LOG.md (ten wpis)
- **Build:** 95 testów pass (20 state machine + 69 diagnostics + 6 fallback), 0 lint errors, build OK (12.91s na Lenovo)
- **Preview:** Lenovo `http://localhost:4002/api/health` → 200, providerState=PRIMARY, providerStateMachine=PRIMARY, activeProvider=Mistral, configuredProvider=Mistral, model=mistral-small-2603. Systemd aktywny (MainPID=1895919), WorkingDirectory=yt-transcript-release-a558150-20260723T190911Z, uptime ~10 min.
- **Raport:** docs/REPORT_MISTRAL_FALLBACK_RECOVERY_DEPLOY_FINAL.md
- **Rollback:** `sed -i 's|WorkingDirectory=.*|WorkingDirectory=/srv/storage/AI_Projects/yt-transcript-release-1bdce40-20260723T102151Z|' /home/radek/.config/systemd/user/yt-transcript.service && systemctl --user daemon-reload && systemctl --user restart yt-transcript.service` lub `git revert a558150`
