# ytTranscript — Deployment na Lenovo Linux

## Ścieżka na serwerze

```
/opt/yt-transcript/
```

## Wymagania

- Node.js 18+
- npm
- Dostęp SSH do Lenovo Server
- Port docelowy: **4001** (jeśli zajęty → sprawdź `ss -tlnp | grep 400`)

## 1. Przygotowanie katalogu

```bash
sudo mkdir -p /opt/yt-transcript
sudo chown $USER /opt/yt-transcript
cd /opt/yt-transcript
```

## 2. Klonowanie / kopiowanie projektu

```bash
# Z GitHub (zalecane)
git clone https://github.com/Lord-Kedaar/yt-transcript.git .

# Lub rsync z Maca (jeśli masz lokalną kopię)
rsync -avz --exclude='node_modules' --exclude='.env' \
  /Users/radek/Documents/Projects/yt-transcript/ \
  $USER@<LENOVO_IP>:/opt/yt-transcript/
```

## 3. .env na serwerze

```bash
cp .env.example .env
nano .env
```

Minimalna konfiguracja produkcyjna:

```env
NODE_ENV=production
PORT=4001

# LLM Provider — ustaw zgodnie z posiadanym dostępem
LLM_PROVIDER=groq
GROQ_API_KEY=twoj_klucz
GROQ_MODEL=openai/gpt-oss-20b

# Demo limit — jedna linijka do włączenia
YTTRANSCRIPT_AI_DAILY_LIMIT_ENABLED=true
YTTRANSCRIPT_AI_DAILY_LIMIT=6

# Portfolio
YTTRANSCRIPT_CONTACT_EMAIL=kontakt@radoslaw-pleskot.com
YTTRANSCRIPT_PROJECT_DESCRIPTION_URL=https://radoslaw-pleskot.com/portfolio/yttranscript
YTTRANSCRIPT_PRIVACY_POLICY_URL=https://radoslaw-pleskot.com/privacy
```

## 4. Instalacja zależności

```bash
npm install
```

## 5. Weryfikacja build

```bash
npm run build   # generuje client/dist/build-info.json
node --check server.js   # powinno wypisać "OK"
```

## 6. Uruchomienie testowe

```bash
PORT=4001 node server.js &
sleep 2
curl -s http://127.0.0.1:4001/api/health | python3 -m json.tool | head -20
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
WorkingDirectory=/opt/yt-transcript
ExecStart=/usr/bin/env node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

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
sudo ufw allow 4001/tcp comment 'ytTranscript'
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
        proxy_pass http://127.0.0.1:4001;
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
| `/opt/yt-transcript/.env` | 600 | Zmienne produkcyjne |
| `/opt/yt-transcript/.ai-daily-limit.json` | 644 | Limit store (tworzony automatycznie) |
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

## Rozwiązywanie problemów

```bash
# Port zajęty
ss -tlnp | grep 4001

# Logi systemd
sudo journalctl -u yt-transcript --no-pager -n 50

# Sprawdź czy Node działa
ps aux | grep "node server" | grep -v grep

# Test API bezpośrednio
curl -s http://127.0.0.1:4001/api/health
curl -s http://127.0.0.1:4001/api/ai-limit-status
```
