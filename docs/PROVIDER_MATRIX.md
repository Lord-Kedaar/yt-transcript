# Provider Matrix — Public Demo

> Porównanie providerów LLM dla trybu publicznego demo.
> Wartości oznaczone **niezweryfikowane** wymagają empirycznego testu z credentials
> przed podjęciem decyzji produkcyjnej.
> Data audytu: 2026-06-12.

## Podsumowanie rekomendacji

| Use case | Provider | Uzasadnienie |
|---|---|---|
| **ytTranscript** (transkrypcja + rekonstrukcja + summarize) | **lokalne oMLX** (primary) → **Groq** (public demo fallback) | Prywatność + zero koszt dla ownera; Groq dla taniego publicznego fallbacku |
| **AI Discuss Stage** (2 modele, public demo) | **Groq** (primary) → **Ollama Cloud** (cost fallback) | Najszybsza latencja dla dyskusji; Ollama Cloud tańszy dla długich sesji |
| **Tryb offline / prywatny (oba)** | **lokalne oMLX** | Jedyny provider bez egress, jedyne dane nie opuszczają maszyny |

---

## Macierz per provider

### OpenRouter

| Kryterium | Wartość | Źródło / status |
|---|---|---|
| Dostępne modele | Setki (Anthropic, OpenAI, Mistral, Meta, Qwen, Google, NVIDIA, MiniMax, Sourceful…) | openrouter.ai/models, zweryfikowane 2026-06 |
| Koszt | $0.10/M (Mistral Small) do $5/M (Claude Opus) — pay-as-you-go | cloudzero.com, zweryfikowane |
| Latencja (typ.) | ~400-1200 ms TTFT, zależna od modelu | niezweryfikowane (brak credentials w tej sesji) |
| Jakość | 5★ dla top-tier; 3★ dla free tier; BYO model | openrouter.ai/models, zweryfikowane |
| Stabilność | 99.9% SLA dla paid tier; free tier throttled | openrouter.ai, zweryfikowane |
| Ograniczenie kosztów | per-key limits + per-request `max_tokens` | standard |
| Osobny klucz | tak (dashboard.provisioning) | standard |
| Ryzyka | vendor lock-in do agregatora, ceny zmienne miesięcznie | obserwacja rynkowa |
| **Rekomendacja ytTranscript** | **fallback (niezweryfikowane)** | brak testu w tej sesji |
| **Rekomendacja AI Discuss** | **nie rekomendowane** | droższy niż Groq dla tej klasy zadań |

### Groq

| Kryterium | Wartość | Źródło / status |
|---|---|---|
| Dostępne modele | Llama 3.x, Mixtral, Gemma 2; spektrum open-source; ograniczone closed-source | groq.com docs, zweryfikowane 2026-06 |
| Koszt | niski (free tier istnieje); paid = konkurencyjny z OpenRouter; **brak pay-per-call surprise** | medium.com/codex, zweryfikowane |
| Latencja (typ.) | **840 tokens/s** inferencji — najszybszy w tej macierzy | medium.com/codex, zweryfikowane |
| Jakość | 4★ (Llama 3.1 70B context), 3★ (mniejsze) | obserwacja |
| Stabilność | 99.9% SLA dla paid | niezweryfikowane (brak danych z 30 dni) |
| Ograniczenie kosztów | rate limits per minute + per-day; budget alerts | standard |
| Osobny klucz | tak | standard |
| Ryzyka | limited model selection; LPU hardware dependency | obserwacja |
| **Rekomendacja ytTranscript** | **primary dla public demo** (niezweryfikowane w testach) | wymaga klucza + 5 min testu |
| **Rekomendacja AI Discuss** | **primary dla public demo** | najszybszy = najlepsze wrażenia dyskusji |

### Mistral API

| Kryterium | Wartość | Źródło / status |
|---|---|---|
| Dostępne modele | Mistral Small 3.2, Mistral Large 2407/3 2512, Codestral, Pixtral | openrouter.ai/mistralai/mistral-large-2407, zweryfikowane |
| Koszt | **$0.10/$0.30 per M** (Small 3.2); $1.93/$6.00 (Large 2407) | cloudzero.com, zweryfikowane |
| Latencja (typ.) | ~600-1500 ms (zależy od tieru) | niezweryfikowane |
| Jakość | 4★ (Large 3 2512 — 41B active MoE) | openrouter.ai, zweryfikowane |
| Stabilność | tier EU (GDPR), enterprise SLA | mistral.ai, zweryfikowane |
| Ograniczenie kosztów | per-key rate limits | standard |
| Osobny klucz | tak | standard |
| Ryzyka | droższy niż Groq przy open-source; mniejszy ekosystem narzędzi | obserwacja |
| **Rekomendacja ytTranscript** | **fallback** | tylko jeśli Groq padnie lub wymóg GDPR |
| **Rekomendacja AI Discuss** | **nie rekomendowane** | droższy niż Groq dla tej klasy zadań |

### Ollama Cloud

| Kryterium | Wartość | Źródło / status |
|---|---|---|
| Dostępne modele | ten sam co lokalne Ollama — Llama, Qwen, Mistral, Gemma, DeepSeek | ollama.com, zweryfikowane |
| Koszt | niski (open-source); zazwyczaj tańsze niż OpenRouter | ollama.com, zweryfikowane |
| Latencja (typ.) | ~300-800 ms (zależy od modelu i regionu) | niezweryfikowane |
| Jakość | 4★ dla 70B+ modeli; 3★ dla 7B | obserwacja |
| Stabilność | tier dependent; SLA dla paid | niezweryfikowane |
| Ograniczenie kosztów | rate limits per plan | standard |
| Osobny klucz | tak (dashboard) | standard |
| Ryzyka | mniejszy provider, mniej enterprise tooling | obserwacja |
| **Rekomendacja ytTranscript** | **fallback** | gdy Groq niedostępny |
| **Rekomendacja AI Discuss** | **cost fallback** | tańszy przy długich sesjach |

### Lokalne oMLX (Apple Silicon)

| Kryterium | Wartość | Źródło / status |
|---|---|---|
| Dostępne modele | wszystko co ma MLX port (Qwen, Gemma, Llama, Mistral, Bielik, Phi…) | omlx.ai, zweryfikowane |
| Koszt | **$0** per token (koszt energii + amortyzacja sprzętu) | fakt |
| Latencja (typ.) | **130 tok/s vs 43 tok/s** (llama.cpp, M-series) | pub.towardsai.net, zweryfikowane |
| Jakość | 4★ dla 12B+ (gemma-4-12b-it-nvfp4) | obserwacja |
| Stabilność | offline-immune; zależy od sesji launchd | fakt |
| Ograniczenie kosztów | zero koszt per token — limit to RAM i czas | fakt |
| Osobny klucz | nie wymaga (opcjonalny) | fakt |
| Ryzyka | macOS-only; ograniczone RAM dla dużych kontekstów (>40k) | petronellatech.com, zweryfikowane |
| **Rekomendacja ytTranscript** | **primary (own machine)** | prywatność + zero koszt |
| **Rekomendacja AI Discuss** | **primary (own machine)** | j.w. |

---

## Decyzja: co wybrać

### ytTranscript public demo (`transcript.radoslaw-pleskot.com`)

**Plan: Groq primary, OpenRouter fallback** — jeszcze niewdrożone.
Powód: Groq ma najlepszy stosunek latencja/koszt dla krótkich transform (reconstruct + summarize). OpenRouter jako backup jeśli Groq ma outage.

### AI Discuss Stage public demo (`discuss.radoslaw-pleskot.com`)

**Plan: Groq primary** — jeszcze niewdrożone.
Powód: dyskusja potrzebuje niskiej latencji żeby była czytelna. Groq 840 tok/s robi różnicę.

### Własna maszyna (oba)

**Lokalne oMLX** — jedyne co ma sens dla prywatnych danych.

---

## Adapter skeleton (env-based, nie hardcoded)

Oba projekty mają provider wybierany przez env vars, **nie** przez `if (provider === 'omlx')` w kodzie:

```bash
# ytTranscript
OMLX_URL=http://127.0.0.1:8585
OMLX_MODEL=gemma-4-12b-it-nvfp4
OMLX_API_KEY=

# AI Discuss Stage
PROVIDER=omlx
OMLX_API_BASE_URL=http://localhost:8585
OMLX_API_KEY=
```

Aby przełączyć na Groq wymaga jedynie:

```bash
# ytTranscript (gdy adapter doda GROQ_URL/GROQ_MODEL)
GROQ_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.1-70b-versatile
GROQ_API_KEY=...

# AI Discuss Stage
PROVIDER=groq
GROQ_API_BASE_URL=https://api.groq.com/openai/v1
GROQ_API_KEY=...
```

W tej sesji adapter jest **szkieletem** (`PROVIDER` env var zarezerwowany) — pełna implementacja przełącznika providerów wymaga:
- abstrahowania `chat/completions` do `lib/providers/`
- testów matrixowych (5 providerów × 2-3 modele = 10-15 kombinacji)
- harmonogramu testów kosztowych i jakościowych

> To jest scope creep zablokowany zgodnie z zasadą "Nie zaczynaj budowy portfolio WWW".
> Macierz jest planem; implementacja adaptera jest zadaniem na późniejszą sesję po decyzji portfolio.
