# ytTranscript — Deployment na Lenovo Linux

> **Aktualny stan (2026-06-25).** Produkcyjna ścieżka to `/srv/storage/AI_Projects/yt-transcript/`, port `4002`, plik UI to root `index.html` (single-file frontend). Tradycyjna ścieżka `/opt/yt-transcript/` i port `4001` zostały zastąpione w wyniku migracji na NFS (Tailscale Serve rezerwuje `4000`).

## Ścieżka produkcyjna

```
/srv/storage/AI_Projects/yt-transcript/
```

> **Uwaga o git:** `/srv/storage` jest NFS-mountem. `git` nie działa w tej ścieżce (`fatal: not a git repository ... /srv boundary`). Pliki trafiają tu wyłącznie przez `scp` z Maca (lub innego miejsca z prawdziwym klonem).

## Wymagania

- Node.js ≥ 20 (testowane na v22)
- npm
- Python 3.9+ (dla Piper TTS — opcjonalne)
- Dostęp SSH do Lenovo Server
- Port docelowy: **4002** (porty `4000`/`4001` zarezerwowane przez Tailscale Serve)
- Proces Node zarządzany ręcznie (`pgrep -f "node server.js"`) — brak `systemd`/launchd na produkcji

## 1. Backup przed zmianą

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /srv/storage/AI_Projects/_archive/yt-transcript/${TS}
tar --exclude='node_modules' -czf \
    /srv/storage/AI_Projects/_archive/yt-transcript/${TS}/yt-transcript-runtime.tgz \
    -C /srv/storage/AI_Projects yt-transcript
```

Archiwum ląduje poza runtime rootem i przeżywa restarty serwera. Wzorzec:
`/srv/storage/AI_Projects/_archive/yt-transcript/<UTC-timestamp>/yt-transcript-runtime.tgz`.

## 2. Deploy z Maca

```bash
# 1. Commit + push do GitHub z Maca (Mac → origin)
cd /Users/radek/Documents/Projects/yt-transcript
git status --short
git add <scope-limited files>
git commit -m "<konwencjonalny commit message>"
git push origin main

# 2. Skopiuj nowe pliki runtime na Lenovo
scp server.js index.html package.json package-lock.json .env.example \
    radek@192.168.8.112:/srv/storage/AI_Projects/yt-transcript/

# 3. (opcjonalnie) Skopiuj .env z backupu jeśli nie ma go na produkcji
scp /Users/radek/Documents/Projects/yt-transcript/.env.example \
    radek@192.168.8.112:/srv/storage/AI_Projects/yt-transcript/.env
# potem SSH + nano na serwerze, ustaw realne klucze

# 4. Restart procesu Node
ssh radek@192.168.8.112 'pkill -f "node server.js"; sleep 2; \
  cd /srv/storage/AI_Projects/yt-transcript && nohup node server.js > /tmp/yt-transcript/server.log 2> /tmp/yt-transcript/server.err & disown'

# 5. Smoke test
sleep 3
ssh radek@192.168.8.112 'curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4002/api/health'
# Oczekiwane: 200
```

> **Uwaga:** `nohup` + `disown` pozwalają procesowi przeżyć rozłączenie SSH. `setsid` to alternatywa.

## 3. .env na serwerze

```bash
ssh radek@192.168.8.112
cd /srv/storage/AI_Projects/yt-transcript
cp .env.example .env
nano .env
```

Minimalna konfiguracja produkcyjna:

```env
NODE_ENV=production
PORT=4002

# LLM Provider — ustaw zgodnie z posiadanym dostępem
LLM_PROVIDER=groq
GROQ_API_KEY=twoj_klucz
GROQ_MODEL=qwen/qwen3.6-27b

# Demo limit — jedna linijka do włączenia
YTTRANSCRIPT_AI_DAILY_LIMIT_ENABLED=true
YTTRANSCRIPT_AI_DAILY_LIMIT=6

# Portfolio
YTTRANSCRIPT_CONTACT_EMAIL=kontakt@radoslaw-pleskot.com
YTTRANSCRIPT_PROJECT_DESCRIPTION_URL=https://radoslaw-pleskot.com/projekty/yttranscript/
YTTRANSCRIPT_PRIVACY_POLICY_URL=https://radoslaw-pleskot.com/pl/privacy/
```

### Pliki wymagające zapisu

| Ścieżka | Uprawnienia | Opis |
|---|---|---|
| `/srv/storage/AI_Projects/yt-transcript/.env` | 600 | Zmienne produkcyjne |
| `/srv/storage/AI_Projects/yt-transcript/.ai-daily-limit.json` | 644 | Limit store (tworzony automatycznie) |
| `/tmp/yt-transcript/server.log`, `server.err` | 644 | Logi serwera (poza runtime rootem) |

## 4. Piper TTS (opcjonalny)

```bash
ssh radek@192.168.8.112
pip3 install --user piper-tts
# Lub jeśli /usr/local/bin jest zapisywalny:
sudo cp "$(which piper)" /usr/local/bin/piper

sudo mkdir -p /opt/yt-transcript/piper-models
sudo chown $USER /opt/yt-transcript/piper-models

# Modele (PL / EN / DE) — pełne linki w zolzotron-devops/references/yttranscript-piper-tts-dev-patterns.md
curl -L -o /opt/yt-transcript/piper-models/pl_PL-justyna_wg_glos-medium.onnx \
    "https://github.com/rk699/PiperModels/raw/main/pl_PL-justyna_wg_glos-medium.onnx"
curl -L -o /opt/yt-transcript/piper-models/pl_PL-justyna_wg_glos-medium.onnx.json \
    "https://github.com/rk699/PiperModels/raw/main/pl_PL-justyna_wg_glos-medium.onnx.json"
# Powtórz dla EN i DE według skill referencji

piper --version
```

## 5. Reverse proxy / subdomena

Konfiguracja `nginx` + `certbot` dla `yttranscript.radoslaw-pleskot.com`:

```nginx
# /etc/nginx/sites-available/yttranscript
server {
    listen 80;
    server_name yttranscript.radoslaw-pleskot.com;

    location / {
        proxy_pass http://127.0.0.1:4002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/yttranscript /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d yttranscript.radoslaw-pleskot.com
```

## 6. Restart po zmianach

```bash
# Znajdź PID
ssh radek@192.168.8.112 'pgrep -af "node server.js" | grep -v grep'
# → np. 4054067 node server.js

# Zatrzymaj (SIGTERM, po 3s SIGKILL jeśli potrzebne)
ssh radek@192.168.8.112 'kill 4054067 && sleep 2 && pgrep -af "node server.js" || echo "stopped"'

# Uruchom ponownie
ssh radek@192.168.8.112 'cd /srv/storage/AI_Projects/yt-transcript && \
  nohup node server.js > /tmp/yt-transcript/server.log 2> /tmp/yt-transcript/server.err & disown'

# Weryfikacja
sleep 3
ssh radek@192.168.8.112 'curl -s http://localhost:4002/api/health | python3 -m json.tool | head -20'
```

> **Uwaga:** Node czyta `process.env` tylko przy starcie. Po każdej zmianie `.env` wymagany jest restart.

## 7. Włączanie / wyłączenie limitu demo

Jedna linijka w `.env`:

```env
YTTRANSCRIPT_AI_DAILY_LIMIT_ENABLED=true   # włączony
YTTRANSCRIPT_AI_DAILY_LIMIT_ENABLED=false  # wyłączony
```

Potem restart serwera.

## 8. Rozwiązywanie problemów

```bash
# Port zajęty
ssh radek@192.168.8.112 'lsof -nP -iTCP:4002 -sTCP:LISTEN'

# Logi serwera
ssh radek@192.168.8.112 'tail -50 /tmp/yt-transcript/server.log /tmp/yt-transcript/server.err'

# Health check (lokalny)
ssh radek@192.168.8.112 'curl -s http://127.0.0.1:4002/api/health'

# Health check (publiczny URL)
curl -s -o /dev/null -w "%{http_code}\n" https://yttranscript.radoslaw-pleskot.com/api/health

# Sprawdź TTS contract
ssh radek@192.168.8.112 'curl -s -X POST http://127.0.0.1:4002/api/tts \
    -H "Content-Type: application/json" \
    -d "{\"type\":\"reconstruction\",\"language\":\"pl\",\"text\":\"Test audio.\"}" | python3 -m json.tool'
# Oczekiwane: {"audioUrl":"/api/audio/pl-reconstruction-...wav",...}
```

## 9. Checklist po podpięciu subdomeny

- [ ] DNS A/AAAA record wskazuje na IP Lenovo
- [ ] `nginx/sites-enabled/yttranscript` aktywny
- [ ] `nginx -t` przeszło
- [ ] Certyfikat TLS założony (`certbot --nginx`)
- [ ] `CORS_ORIGIN=https://yttranscript.radoslaw-pleskot.com` w `.env`
- [ ] Restart Node + smoke `/api/health` 200
- [ ] `https://yttranscript.radoslaw-pleskot.com/api/health` → 200
- [ ] TTS contract: POST `/api/tts` z `type:"reconstruction"` → 200 z `audioUrl`

## 10. Co NIE jest częścią produkcji

Po sprzątaniu 2026-06-25 w runtime root NIE powinno być:

- `.bak-*`, `.backup-*` plików — archiwizowane w `/srv/storage/AI_Projects/_archive/yt-transcript/`
- `.env.backup-*` — tam samo
- `server.log`, `start-frontend.sh.bak.*`, `manage.sh.bak.*` — archiwizowane
- `client/` — root `index.html` jest self-contained; `client/dist/assets/*` zostało przeniesione do archiwum
- `.write-test` — usunięte

Jeśli znajdziesz te artefakty w runtime root podczas kolejnego przebiegu — od razu przenieś je do `_archive/`.
