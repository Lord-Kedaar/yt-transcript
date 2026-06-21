# Zadanie 2 — Raport końcowy

**Status:** ✅ UKOŃCZONE
**Data:** 2026-06-21
**Commit:** `feat/demo-limit-portfolio-links`

---

## Co zostało zmienione

### Backend (`server.js`)

| Zmiana | Plik | Opis |
|--------|------|------|
| AI daily limit store | `server.js` | JSON file store (`.ai-daily-limit.json`), hash SHA256 IP (last 16 hex chars) |
| Guard middleware | `server.js` | `aiDailyLimitGuard` na `/api/transform` → HTTP 429 z contact email |
| `GET /api/ai-limit-status` | `server.js` | Status dla frontendu: `{ limitEnabled, dailyLimit, usedToday, remainingToday }` |
| `/api/health` rozszerzony | `server.js` | + `projectDescriptionUrl`, `privacyPolicyUrl`, `contactEmail` |
| Stale-entry cleanup | `server.js` | Automatyczne usuwanie wpisów starszych niż wczoraj (~1% requestów) |
| IPv4-mapped IPv6 normalization | `server.js` | `::ffff:127.0.0.1` → `127.0.0.1` przed hashowaniem |

### Frontend (`index.html`)

| Zmiana | Opis |
|--------|------|
| Footer links | "Documentation/Security notes/Known limitations" → "Project description" + "Privacy policy" |
| Topbar | Przycisk "Documentation" → "Project description" z dynamicznym href |
| Demo popup | Modal z informacją o limicie, przycisk "Rozumiem", linki do polityki i kontaktu |
| Popup JS | `initDemoPopup()` — równoległe pobieranie `/api/ai-limit-status` + `/api/health`, sessionStorage dismiss |
| 429 handling | Precyzyjne wykrywanie `res.status === 429` + `data.message` |

### Konfiguracja

| Plik | Zmiana |
|------|--------|
| `.env.example` | Dodane: `YTTRANSCRIPT_AI_DAILY_LIMIT_ENABLED`, `YTTRANSCRIPT_AI_DAILY_LIMIT`, `YTTRANSCRIPT_CONTACT_EMAIL`, `YTTRANSCRIPT_PROJECT_DESCRIPTION_URL`, `YTTRANSCRIPT_PRIVACY_POLICY_URL` |
| `DEPLOYMENT_LENOVO_LINUX.md` | Pełna instrukcja: systemd service, nginx reverse proxy, Certbot, checklist |

---

## Lista zmienionych plików

```
server.js                      — +100 lines (AI limit store, guard, endpoints)
index.html                     — +120 lines (popup HTML/CSS/JS, link refs)
.env.example                   — +15 lines (demo limit + portfolio links)
DEPLOYMENT_LENOVO_LINUX.md    — NEW (deployment guide)
YTTRANSCRIPT_DEMO_LIMIT_AND_LENOVO_DEPLOY_REPORT.md — NEW (this file)
```

---

## Jak działa limit

1. `clientIp(req)` → SHA256 hash (16 hex) IP klienta. Normalizuje IPv4-mapped IPv6.
2. `checkAiLimit(ip)` → odczytuje `.ai-daily-limit.json`, sprawdza datę, inkrementuje licznik.
3. `aiDailyLimitGuard` → jeśli `count >= 6` → HTTP 429 z `message` + `contactEmail`.
4. Stale cleanup → co ~100 requestów usuwa wpisy z `date < yesterday`.

**Włączanie/wyłączanie jedną linijką:**
```env
# Włączony
YTTRANSCRIPT_AI_DAILY_LIMIT_ENABLED=true

# Wyłączony
YTTRANSCRIPT_AI_DAILY_LIMIT_ENABLED=false
```

---

## Popup demo

- Pokazuje się przy pierwszym wejściu (sessionStorage: `ytt_demo_popup_dismissed`)
- Zawiera: opis demo, licznik pozostałych akcji, link do polityki prywatności, link mailowy z tematem
- Gdy limit wyłączony: "Demo limit is currently disabled"
- Gdy limit reached: pomarańczowy warning "Limit reached · 6/6 AI actions used today"

---

## Zmienione linki

| Element | Stary link | Nowy link |
|---------|------------|-----------|
| Footer link 1 | `Documentation` | `Project description` → `YTTRANSCRIPT_PROJECT_DESCRIPTION_URL` |
| Footer link 2 | `Security notes` | `Privacy policy` → `YTTRANSCRIPT_PRIVACY_POLICY_URL` |
| Topbar button | `Documentation` | `Project description` → `YTTRANSCRIPT_PROJECT_DESCRIPTION_URL` |

---

## Wyniki testów

| Test | Wynik |
|------|-------|
| `GET /api/ai-limit-status` (limit off) | ✅ `{"limitEnabled":false,...}` |
| `GET /api/ai-limit-status` (limit on, 0 used) | ✅ `{"limitEnabled":true,"dailyLimit":6,"usedToday":0,"remainingToday":6}` |
| `POST /api/transform` z count=6 | ✅ HTTP 429 `{"error":"Daily demo limit reached.","message":"...","contactEmail":"..."}` |
| `GET /api/health` URLs | ✅ zwraca `projectDescriptionUrl`, `privacyPolicyUrl`, `contactEmail` |
| Footer links HTML | ✅ 2 linki (`footerProjectLink`, `footerPrivacyLink`) |
| Topbar Documentation replaced | ✅ `topbarProjectLink` |
| Demo popup HTML | ✅ 17 refs (`demoPopup`, `demoLimitInfo`, `demoOkBtn`, etc.) |
| Server lint | ✅ `node --check server.js` exit 0 |
| `.env.example` new vars | ✅ 5 nowych zmiennych |
| DEPLOYMENT doc | ✅ istnieje |

---

## Deployment na Lenovo — podsumowanie

- **Port:** `4001` (zalecany, wolny)
- **Ścieżka:** `/opt/yt-transcript/`
- **Plik .env kluczowy:**
  ```env
  NODE_ENV=production
  PORT=4001
  CORS_ORIGIN=https://yttranscript.radoslaw-pleskot.com
  YTTRANSCRIPT_AI_DAILY_LIMIT_ENABLED=true
  YTTRANSCRIPT_CONTACT_EMAIL=kontakt@radoslaw-pleskot.com
  YTTRANSCRIPT_PROJECT_DESCRIPTION_URL=https://radoslaw-pleskot.com/portfolio/yttranscript
  YTTRANSCRIPT_PRIVACY_POLICY_URL=https://radoslaw-pleskot.com/privacy
  ```
- **Systemd:** `yt-transcript.service` (opisany w `DEPLOYMENT_LENOVO_LINUX.md`)
- **Reverse proxy:** nginx z `X-Forwarded-For`, TLS przez Certbot

---

## Nieukończone / do ręcznego wykonania

| Element | Status | Następny krok |
|---------|--------|---------------|
| Migracja na Lenovo Server | ❌ Brak dostępu SSH | Sklonować repo, skopiować `.env`, uruchomić |
| DNS subdomena | ❌ Brak kontroli DNS | Ustawić A/AAAA record na `yttranscript.radoslaw-pleskot.com` |
| TLS certyfikat | ❌ Wymaga uruchomionego nginx + DNS | `sudo certbot --nginx -d yttranscript.radoslaw-pleskot.com` |

---

## Codex review — zastosowane poprawki

1. ✅ **Stale-entry cleanup** — dodany w `checkAiLimit()`, uruchamia się ~1% requestów
2. ✅ **Precyzyjne 429 detection** — `res.status === 429` w `doTransform` zamiast string search
3. ✅ **IPv6 normalization** — `::ffff:x.x.x.x` → `x.x.x.x` przed hashowaniem
