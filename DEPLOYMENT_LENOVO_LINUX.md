# ytTranscript — Deployment na Lenovo Linux

## Ścieżka na serwerze

```
/srv/storage/AI_Projects/yt-transcript/
```

**WAŻNE:** Na Lenovo port `4000` i `4001` są zablokowane przez Tailscale Serve (port 4000 = `tailscale serve` dla aplikacji AI Idea Forge). Używaj **portu 4002** lub wyższego.

## Wymagania

- Node.js 18+
- npm
- Python 3.9+ (dla Piper TTS)
- Dostęp SSH do Lenovo Server
- Port docelowy: **4002** (4000/4001 zablokowane przez Tailscale Serve)

## 1. Przygotowanie katalogu

```bash
sudo mkdir -p /srv/storage/AI_Projects/yt-transcript
sudo chown $USER /srv/storage/AI_Projects/yt-transcript
cd /srv/storage/AI_Projects/yt-transcript
```

## 2. Klonowanie / kopiowanie projektu

```bash
# Z GitHub (zalecane)
git clone https://github.com/Lord-Kedaar/yt-transcript.git .

# Lub rsync z Maca (jeśli masz lokalną kopię)
rsync -avz --exclude='node_modules' --exclude='.env' \
  /Users/radek/Documents/Projects/yt-transcript/ \
  $USER@<LENOVO_IP>:/srv/storage/AI_Projects/yt-transcript/
```

## 3. .env na serwerze

```bash
cp .env.example .env
nano .env
```

Minimalna konfiguracja produkcyjna:

```env
NODE_ENV=production
PORT=4002

# LLM Provider
LLM_PROVIDER=groq
GROQ_API_KEY=twoj_klucz
GROQ_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# Piper TTS
PIPER_BIN=/home/radek/.local/bin/piper
PIPER_MODELS_DIR=/home/radek/.hermes/piper-models

# Demo limit — jedna linijka do włączenia
YTTRANSCRIPT_AI_DAILY_LIMIT_ENABLED=true
YTTRANSCRIPT_AI_DAILY_LIMIT=6

# Portfolio
YTTRANSCRIPT_CONTACT_EMAIL=kontakt@radoslaw-pleskot.com
YTTRANSCRIPT_PROJECT_DESCRIPTION_URL=https://radoslaw-pleskot.com/portfolio/yttranscript
YTTRANSCRIPT_PRIVACY_POLICY_URL=https://radoslaw-pleskot.com/privacy
```

## 3a. Piper TTS (opcjonalny)

```bash
# Instalacja Piper (wymaga Python 3.9+)
pip3 install piper-tts

# Bina jest w ~/.local/bin/ — ścieżka do dodania w .env:
# PIPER_BIN=/home/radek/.local/bin/piper

# Modele głosowe — katalog na serwerze:
mkdir -p /home/radek/.hermes/piper-models

# Pobranie modeli głosowych (rsync z Maca lub wget):
# PL:
# wget -O pl_PL-justyna_wg_glos-medium.onnx "URL_do_modelu"
# EN:
# wget -O en_US-hfc_female-medium.onnx "URL_do_modelu"
# DE:
# wget -O de_DE-thorsten-medium.onnx "URL_do_modelu"

# Weryfikacja
piper --version
```

> **Uwaga:** Jeśli modeli nie da się pobrać automatycznie, sklonuj repo
> `https://github.com/rk699/PiperModels` i skopiuj pliki ręcznie.

## 4. Instalacja zależności

```bash
npm install
```

## 5. Weryfikacja build

```bash
npm install          # instalacja express + cors
npm run build       # generuje client/dist/build-info.json
node --check server.js   # powinno wypisać "OK"
```

## 6. Uruchomienie testowe

```bash
PORT=4002 node server.js &
sleep 2
curl -s http://127.0.0.1:4002/api/health | python3 -m json.tool | head -20
```

Spodziewany wynik: `{"status": "ok", ...}`

## 7. Systemd service

Utwórz plik `/etc/systemd/system/yt-transcript.service`:

```ini
[Unit]
Description=ytTranscript AI demo
After=network.target

[Service]
Type=simple
User=<YOUR_USER>
WorkingDirectory=/srv/storage/AI_Projects/yt-transcript
ExecStart=/usr/bin/env node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=4002

[Install]
WantedBy=multi-user.target
```

Zainstaluj i uruchom:

```bash
sudo systemctl daemon-reload
sudo systemctl enable yt-transcript
sudo systemctl start yt-transcript

# Sprawdź status
sudo systemctl status yt-transcript
```

## 8. Firewall

```bash
# Otwórz port tylko dla LAN (lub Cloudflare Tunnel)
sudo ufw allow 4002/tcp comment 'ytTranscript'
sudo ufw reload
```

## 9. Konfiguracja reverse proxy (nginx)

Dla subdomeny `yttranscript.radoslaw-pleskot.com`:

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
```

**TLS**: Zainstaluj certyfikat przez Certbot po skonfigurowaniu DNS:
```bash
sudo certbot --nginx -d yttranscript.radoslaw-pleskot.com
```

## 10. Konfiguracja CORS na produkcji

W `.env` ustaw konkretną domenę zamiast `*`:

```env
CORS_ORIGIN=https://yttranscript.radoslaw-pleskot.com
```

To aktywuje zaufanie dla `X-Forwarded-For` (poprawny client IP za proxy).

## Włączenie / wyłączenie limitu

Plik `.env`:
```env
# Włączony (default: 6/dzień/IP)
YTTRANSCRIPT_AI_DAILY_LIMIT_ENABLED=true

# Wyłączony — aplikacja działa bez blokowania
YTTRANSCRIPT_AI_DAILY_LIMIT_ENABLED=false
```

Jedna linijka → restart → gotowe.

## Pliki wymagające zapisu

| Ścieżka | Uprawnienia | Opis |
|---|---|---|
| `/srv/storage/AI_Projects/yt-transcript/.env` | 600 | Zmienne produkcyjne |
| `/srv/storage/AI_Projects/yt-transcript/.ai-daily-limit.json` | 644 | Limit store (tworzony automatycznie) |
| `/tmp/tts-cache/*.wav` | 1777 | Cache TTS audio (systemowy tmp) |

## Po restarcie serwera

```bash
# Sprawdź czy usługa działa
sudo systemctl status yt-transcript

# Restart ręczny
sudo systemctl restart yt-transcript

# Logi
sudo journalctl -u yt-transcript -f
```

## Checklist po podpięciu subdomeny

- [ ] DNS A/AAAA record wskazuje na IP Lenovo
- [ ] nginx/sites-enabled skonfigurowany
- [ ] `nginx -t` przeszło
- [ ] Certyfikat TLS założony (Certbot)
- [ ] `CORS_ORIGIN=https://yttranscript.radoslaw-pleskot.com` w `.env`
- [ ] `sudo systemctl restart yt-transcript`
- [ ] `curl -s https://yttranscript.radoslaw-pleskot.com/api/health` → 200
- [ ] Popup demo wyświetla się przy pierwszym wejściu
- [ ] AI actions działają i limit się zmniejsza

## Konflikt z Tailscale Serve (port 4000)

**Problem:** Port `4000` na Lenovo jest zarezerwowany dla Tailscale Serve (`tailscale serve --https=4000 http://localhost:5173`). Prób uruchomienia aplikacji na porcie 4000 skutkuje natychmiastowym SIGTERM.

**Rozwiązanie:** Używaj portu `4002` lub wyższego.

**Alternatywnie** — przenieś aplikację na inny port i skonfiguruj Tailscale Serve jako reverse proxy:
```bash
# W .env
PORT=4002
```
```bash
# Na serwerze — Tailscale Serve proxy do ytTranscript
tailscale serve --https=4000 http://localhost:4002
```

## Rozwiązywanie problemów

```bash
# Port zajęty
ss -tlnp | grep 4002

# Logi systemd
sudo journalctl -u yt-transcript --no-pager -n 50

# Sprawdź czy Node działa
ps aux | grep "node server" | grep -v grep

# Test API bezpośrednio
curl -s http://127.0.0.1:4002/api/health
curl -s http://127.0.0.1:4002/api/ai-limit-status
```
