import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { fetchTranscript } from 'youtube-transcript-plus';
import rateLimit from 'express-rate-limit';
import he from 'he';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 4000);

// ─── LLM Provider Config (env-driven) ───────────────────────────
// Supported providers: 'omlx' | 'freellmapi' | 'mistral' | 'groq'
// Switch by setting LLM_PROVIDER env var. Defaults to 'mistral' for Mistral primary, oMLX fallback.
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'mistral').toLowerCase();

// Fallback chain — comma-separated provider names tried in order when the
// primary provider's health check fails. Empty string = no fallback (single-provider mode).
// Example: LLM_PROVIDER_FALLBACK=mistral,groq
const LLM_PROVIDER_FALLBACK = (process.env.LLM_PROVIDER_FALLBACK || 'omlx')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

// Health cache TTL (ms) — caches llmProvider.health() results to prevent
// flakiness from cold-starting large models on each /api/lm-status or /api/transform call.
const HEALTH_CACHE_TTL_MS = Number(process.env.HEALTH_CACHE_TTL_MS || 3000);

// oMLX settings (used when LLM_PROVIDER=omlx)
const OMLX_URL = process.env.OMLX_URL || process.env.LM_STUDIO_URL || 'http://localhost:8585';
const OMLX_MODEL = process.env.OMLX_MODEL || process.env.LM_STUDIO_MODEL || 'gemma-4-12B-it-nvfp4';
const OMLX_FALLBACK_MODELS = ['gemma-4-12B-it-assistant-nvfp4', 'Qwen3.5-4B-mlx-lm-nvfp4'];
const OMLX_API_KEY = process.env.OMLX_API_KEY || process.env.LM_STUDIO_API_KEY || '';

// FreeLLMAPI settings (used when LLM_PROVIDER=freellmapi)
// Base URL of the FreeLLMAPI server + API key for Authorization header.
const FREELLMAPI_URL = process.env.FREELLMAPI_URL || 'http://127.0.0.1:3001';
const FREELLMAPI_API_KEY = process.env.FREELLMAPI_API_KEY || '';
// 'auto' = FreeLLMAPI auto-selects the best free provider per request.
const FREELLMAPI_MODEL = process.env.FREELLMAPI_MODEL || 'auto';

// Mistral settings (used when LLM_PROVIDER=mistral)
// OpenAI-compatible chat completions endpoint.
const MISTRAL_URL = process.env.MISTRAL_URL || 'https://api.mistral.ai/v1';
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small-2603';

// Groq settings (used when LLM_PROVIDER=groq)
// OpenAI-compatible chat completions endpoint with reasoning-capable models.
const GROQ_URL = process.env.GROQ_URL || 'https://api.groq.com/openai/v1';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

const BUILD_INFO_PATH = path.join(__dirname, 'client', 'dist', 'build-info.json');
// v3.4.0: serve single-file Rhea redesign from repo root (replaces React SPA
// at client/dist/index.html). Server.js patch for /api/transform targetLang
// is independent — see MERGE_BRIEF.md.
const INDEX_HTML_PATH = path.join(__dirname, 'index.html');

// TTS config (Piper). When PIPER_BIN does not exist the /api/tts endpoint
// returns 503 with a clear message instead of crashing.
const PIPER_BIN = process.env.PIPER_BIN || '/Users/radek/.hermes/hermes-agent/venv/bin/piper';
const PIPER_MODELS_DIR = process.env.PIPER_MODELS_DIR || '/Users/radek/.hermes/piper-models';
const TTS_VOICES = {
  pl: {
    name: 'justyna',
    model: 'pl_PL-justyna_wg_glos-medium.onnx',
    config: 'pl_PL-justyna_wg_glos-medium.onnx.json',
    espeakVoice: 'pl',
  },
  en: { name: 'hfc_female', model: 'en_US-hfc_female-medium.onnx', espeakVoice: 'en-us' },
  de: { name: 'thorsten', model: 'de_DE-thorsten-medium.onnx', espeakVoice: 'de' },
};
const ttsCacheDir = '/tmp/tts-cache';
fs.mkdirSync(ttsCacheDir, { recursive: true });

// ─── TTS-prep LLM prompts (source: PIPER_TTS_PREP_PROMPT_SOURCE_EN_DE_PL.md) ──
const TTS_PREP_SYSTEM_PROMPTS = {
  en: `Prepare the text for natural English text-to-speech playback with Piper.

Rules:
- Preserve meaning, facts, names, order and tone.
- Do not summarize, translate, expand the argument, add commentary or remove important content.
- Improve spoken rhythm through punctuation, sentence splitting and paragraph breaks.
- Expand dates, numbers, measurements, symbols and abbreviations into natural spoken English where helpful.
- Make technical terms and acronyms easier to pronounce only when needed.
- Do not add markdown, headings, tags, SSML, XML, stage directions or pronunciation notes.
- Output only the final clean text that should be sent to Piper.`,

  de: `Bereite den Text für eine natürliche deutsche Sprachausgabe mit Piper vor.

Regeln:
- Bedeutung, Fakten, Namen, Reihenfolge und Ton beibehalten.
- Nicht zusammenfassen, nicht übersetzen, keine Argumente ergänzen, keine Kommentare hinzufügen und keine wichtigen Inhalte entfernen.
- Den Sprechrhythmus durch Zeichensetzung, Satzteilung und Absatzstruktur verbessern.
- Daten, Zahlen, Maßeinheiten, Symbole und Abkürzungen dort in natürliche gesprochene deutsche Formen umwandeln, wo es für die Aussprache hilft.
- Auf Kasus, Genus, Numerus und Kongruenz achten, besonders bei Zahlen und Maßeinheiten.
- Technische Begriffe und Akronyme nur dann sprechbarer machen, wenn Piper sie sonst wahrscheinlich schlecht liest.
- Kein Markdown, keine Überschriften, keine Tags, kein SSML, kein XML, keine Regieanweisungen, keine Aussprache-Notizen.
- Gib ausschließlich den finalen, sauberen Text aus, der direkt an Piper gesendet wird.`,

  pl: `Przygotuj tekst do naturalnego odczytu po polsku przez Piper.

Zasady:
- Zachowaj sens, fakty, nazwy, kolejność i ton.
- Nie streszczaj, nie tłumacz, nie rozwijaj argumentacji, nie dodawaj komentarzy i nie usuwaj ważnych treści.
- Popraw rytm mowy przez interpunkcję, dzielenie zbyt długich zdań i sensowne akapity.
- Daty, liczby, jednostki, symbole i skróty zamieniaj na naturalne formy mówione tam, gdzie pomaga to wymowie.
- Pilnuj polskiej fleksji: przypadka, rodzaju, liczby i zgodności, szczególnie przy liczebnikach i jednostkach.
- Terminy techniczne i akronimy upraszczaj fonetycznie tylko wtedy, gdy Piper prawdopodobnie przeczytałby je źle.
- Nie dodawaj markdowna, nagłówków, tagów, SSML, XML, didaskaliów ani notatek wymowy.
- Zwróć wyłącznie finalny czysty tekst, który ma zostać wysłany bezpośrednio do Piper.`,
};

function buildPiperPrepUserPrompt(text, sourceType, language) {
  const langLabel = { en: 'English', de: 'German', pl: 'Polish' }[language] || language;
  return `Prepare the following ytTranscript AI result for Piper TTS.

Source type: ${sourceType}
Language: ${langLabel}

Rules:
- Prepare only this ${sourceType === 'reconstruction' ? 'AI reconstruction' : 'Summary'} for spoken playback.
- Do not summarize again.
- Do not translate.
- Do not add facts.
- Do not output markdown.
- Do not output SSML.
- Do not output Fish Audio tags.
- Do not output notes or explanations.
- Return only plain Piper-ready text.

Text:

${text}`;
}

// Sentinels returned by the TTS-prep LLM that must not reach Piper
const TTS_PREP_SENTINELS = [
  'PIPER_TTS_PREP_EMPTY_INPUT',
  'PIPER_TTS_PREP_REJECTED_UNSUPPORTED_SOURCE_TYPE',
];

function isTtsPrepSentinel(value) {
  return TTS_PREP_SENTINELS.includes(String(value).trim());
}

// Detect language from text sample — mirrors frontend auto-detect
function detectLanguage(text) {
  const sample = String(text || '').slice(0, 400);
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(sample)) return 'pl';
  if (/[äöüßÄÖÜ]/.test(sample)) return 'de';
  return 'en';
}

// ── AI Daily Demo Limit ───────────────────────────────────────────
// Simple JSON-file store for demo rate-limiting.
// Stores IP hash + daily count; survives restarts; no Redis needed.
const AI_DAILY_LIMIT_ENABLED = process.env.YTTRANSCRIPT_AI_DAILY_LIMIT_ENABLED === 'true';
const AI_DAILY_LIMIT = Number(process.env.YTTRANSCRIPT_AI_DAILY_LIMIT) || 5;
const AI_LIMIT_STORE_PATH = path.join(__dirname, '.ai-daily-limit.json');
const AI_CONTACT_EMAIL = process.env.YTTRANSCRIPT_CONTACT_EMAIL || 'kontakt@radoslaw-pleskot.com';
const PROJECT_DESCRIPTION_URL =
  process.env.YTTRANSCRIPT_PROJECT_DESCRIPTION_URL ||
  'https://radoslaw-pleskot.com/projekty/yttranscript/';
const PRIVACY_POLICY_URL =
  process.env.YTTRANSCRIPT_PRIVACY_POLICY_URL || 'https://radoslaw-pleskot.com/pl/privacy/';

// Read-only JSON store for IP→{date,count}
function readLimitStore() {
  try {
    if (fs.existsSync(AI_LIMIT_STORE_PATH)) {
      return JSON.parse(fs.readFileSync(AI_LIMIT_STORE_PATH, 'utf8'));
    }
  } catch {
    /* corrupt or missing → start fresh */
  }
  return {};
}
function writeLimitStore(data) {
  try {
    fs.writeFileSync(AI_LIMIT_STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[AI limit] Store write failed:', err.message);
  }
}

// Get today's date string in UTC: "YYYY-MM-DD"
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

// Resolve client IP, honouring X-Forwarded-For behind a trusted proxy.
// Only trusts X-Forwarded-For when CORS_ORIGIN is a specific domain (not "*").
function clientIp(req) {
  const trustProxy = CORS_ORIGIN !== '*';
  let ip = req.ip || req.socket?.remoteAddress || '';
  if (trustProxy && req.headers['x-forwarded-for']) {
    // Take the first (original client) IP
    ip = req.headers['x-forwarded-for'].split(',')[0].trim();
  }
  // Normalize IPv4-mapped IPv6 addresses (::ffff:x.x.x.x) to plain IPv4
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  // Hash to avoid storing raw IPs; keep only last 16 hex chars
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

// Check and increment daily AI action count.
// Returns { allowed: boolean, usedToday: number, remainingToday: number }
function checkAiLimit(ip) {
  if (!AI_DAILY_LIMIT_ENABLED) {
    return { allowed: true, usedToday: null, remainingToday: null, limitEnabled: false };
  }
  const store = readLimitStore();
  const today = todayUtc();
  const entry = store[ip] || { date: today, count: 0 };
  if (entry.date !== today) {
    entry.date = today;
    entry.count = 0;
  }
  if (entry.count >= AI_DAILY_LIMIT) {
    return {
      allowed: false,
      usedToday: entry.count,
      remainingToday: 0,
      limitEnabled: true,
      limit: AI_DAILY_LIMIT,
    };
  }
  entry.count += 1;
  store[ip] = entry;

  // Periodic stale-entry cleanup: remove entries older than yesterday (runs on ~1% of requests)
  const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
  let cleaned = 0;
  for (const k of Object.keys(store)) {
    if (store[k].date < yesterday) {
      delete store[k];
      cleaned++;
    }
  }
  if (cleaned > 0) writeLimitStore(store); // single write after mutation

  return {
    allowed: true,
    usedToday: entry.count,
    remainingToday: AI_DAILY_LIMIT - entry.count,
    limitEnabled: true,
    limit: AI_DAILY_LIMIT,
  };
}

// Express middleware: block /api/transform when AI daily limit is exhausted
function aiDailyLimitGuard(req, _res, next) {
  if (!AI_DAILY_LIMIT_ENABLED) return next();
  const ip = clientIp(req);
  const result = checkAiLimit(ip);
  if (!result.allowed) {
    return _res.status(429).json({
      error: 'Daily demo limit reached.',
      message: `You have used all ${AI_DAILY_LIMIT} AI actions available today. Contact Radosław to unlock the demo.`,
      contactEmail: AI_CONTACT_EMAIL,
      subject: 'Prośba o odblokowanie limitu demo ytTranscript',
    });
  }
  next();
}

// ── Security: CORS (default: local dev, lock to env in production) ──────────
const CORS_ORIGIN =
  process.env.CORS_ORIGIN ||
  (process.env.NODE_ENV === 'production' ? 'https://transcript.radoslaw-pleskot.com' : '*');

// ── Security: Rate limiting ─────────────────────────────────────────────────
const transformLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many transform requests. Limit: 10/min. Pause and retry.' },
});

const ttsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many TTS requests. Limit: 5/min. Pause and retry.' },
});
function piperAvailable() {
  try {
    return fs.existsSync(PIPER_BIN);
  } catch {
    return false;
  }
}
const TRANSCRIPT_MISSING_PATTERNS = [
  'no transcript',
  'transcript not found',
  'not available',
  'disabled',
  'captions',
  'subtitles',
  'subtitle',
];
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504, 529]);

app.disable('x-powered-by');
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '16mb' }));
// Whitelisted favicon handler: serves ONLY the named favicon assets
// from the repo root with a 200 + immutable cache. Required because
// the root /favicon.ico etc. would otherwise 404 (no general
// express.static of __dirname). Whitelist is exact-match against
// req.path so it cannot be abused as a directory listing.
const FAVICON_ASSETS = new Set([
  'favicon.ico',
  'favicon-light.svg',
  'favicon-dark.svg',
  'apple-touch-icon.png',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'favicon-48x48.png',
  'favicon-64x64.png',
  'favicon-192x192.png',
  'favicon-512x512.png',
]);
app.get(
  [
    '/favicon.ico',
    '/favicon-light.svg',
    '/favicon-dark.svg',
    '/apple-touch-icon.png',
    '/favicon-16x16.png',
    '/favicon-32x32.png',
    '/favicon-48x48.png',
    '/favicon-64x64.png',
    '/favicon-192x192.png',
    '/favicon-512x512.png',
  ],
  (req, res) => {
    const name = req.path.slice(1);
    // Express only routes these 10 exact paths here, so name is constrained
    // to FAVICON_ASSETS. Re-check is defence-in-depth against any future
    // refactor that loosens the matching.
    if (!FAVICON_ASSETS.has(name)) {
      return res.status(404).end();
    }
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.sendFile(path.join(__dirname, name));
  },
);
// Serve static assets from build output
app.use(
  '/assets',
  express.static(path.join(__dirname, 'client', 'dist', 'assets'), {
    immutable: true,
    maxAge: '1y',
  }),
);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

function noCache(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorMessage(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  return err.message || err.error?.message || String(err);
}

function isRetryableError(err) {
  if (!err) return false;
  if (
    typeof err === 'object' &&
    Number.isInteger(err.status) &&
    RETRYABLE_STATUS_CODES.has(err.status)
  ) {
    return true;
  }

  const message = getErrorMessage(err).toLowerCase();
  // NOTE: do NOT match generic 'network' or 'fetch failed' — those appear in
  // withRetry wrapper messages (e.g. "Groq chat failed...retrying...network")
  // and cause false-positive retry loops. Real network errors from fetch() are
  // distinguishable by their cause: AbortError (timeout), ECONNRESET, ETIMEDOUT.
  return (
    message.includes('aborterror') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('connection reset') ||
    message.includes('eai_again') ||
    message.includes('etimedout') ||
    message.includes('socket hang up') ||
    message.includes('headers-timeout') ||
    message.includes('headers timeout')
  );
}

function isOmlxMemoryPressureError(err) {
  if (!err) return false;
  if (err.status === 507) return true;
  const message = getErrorMessage(err).toLowerCase();
  return (
    message.includes('memory ceiling') ||
    message.includes('hard memory pressure') ||
    message.includes('projected memory') ||
    message.includes('free system memory') ||
    message.includes('lower memory_guard_tier')
  );
}

async function withRetry(
  operation,
  { attempts = 3, baseDelayMs = 350, label = 'operation', shouldRetry = isRetryableError } = {},
) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;
      if (attempt >= attempts || !shouldRetry(err)) {
        throw err;
      }
      const delay = baseDelayMs * attempt;
      console.warn(
        `${label} failed (attempt ${attempt}/${attempts}); retrying in ${delay}ms: ${getErrorMessage(err)}`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

async function withTimeout(promiseFactory, timeoutMs, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(`${label} timed out after ${timeoutMs}ms`);
      err.name = 'TimeoutError';
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promiseFactory(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJsonOnce(url, { timeoutMs = 5000, headers = {}, method = 'GET', body } = {}) {
  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const detail = parsed?.error?.message || parsed?.error || text || `HTTP ${response.status}`;
    const err = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    err.status = response.status;
    err.responseText = text;
    throw err;
  }

  return parsed ?? {};
}

async function fetchJsonWithRetry(url, options = {}, retryOptions = {}) {
  return withRetry(() => fetchJsonOnce(url, options), retryOptions);
}

// ─── LLM Provider Abstraction Layer ───────────────────────────────
// Architecture: one factory function per provider returns a normalised
// { chat(messages, opts), health() } interface.
// callers (checkProvider, /api/transform) call llmProvider().chat(...) regardless
// of which backend is configured.

/**
 * Build a single named provider (factory dispatch).
 * Returns null for unknown names so callers can handle the error explicitly.
 */
function buildProviderByName(name) {
  switch (name) {
    case 'omlx':
      return buildOmlxProvider();
    case 'freellmapi':
      return buildFreeLLMAPIProvider();
    case 'mistral':
      return buildMistralProvider();
    case 'groq':
      return buildGroqProvider();
    default:
      return null;
  }
}

/**
 * Build the active LLM provider chain: primary + fallback list (if configured).
 * Returns an object with:
 *   - primary: the configured provider
 *   - chain: [primary, ...fallback] in priority order
 *   - active(): returns the first provider whose health() returns ok=true, or
 *     the primary if all fail (so chat() can still surface a meaningful error).
 * Health results are cached for HEALTH_CACHE_TTL_MS to prevent flakiness.
 */
function buildLlmProvider() {
  const primary = buildProviderByName(LLM_PROVIDER);
  if (!primary) {
    console.warn(`[llm] Unknown LLM_PROVIDER='${LLM_PROVIDER}', falling back to omlx.`);
    return buildOmlxProvider();
  }
  if (LLM_PROVIDER_FALLBACK.length === 0) {
    return primary;
  }
  // Build chain: primary + each fallback provider (skip duplicates and unknown names).
  const seen = new Set([LLM_PROVIDER]);
  const chain = [primary];
  for (const name of LLM_PROVIDER_FALLBACK) {
    if (seen.has(name)) continue;
    const fb = buildProviderByName(name);
    if (!fb) {
      console.warn(`[llm] Skipping unknown fallback provider '${name}'.`);
      continue;
    }
    seen.add(name);
    chain.push(fb);
  }
  return buildProviderChain(chain);
}

/**
 * Wraps a chain of providers with health-cached active() resolution.
 * The returned object's chat() goes to whichever provider active() resolved to
 * most recently (sticky until that provider reports unhealthy).
 */
function buildProviderChain(chain) {
  let resolved = chain[0];
  let resolvedAt = 0;

  async function active() {
    const now = Date.now();
    // Sticky: if we resolved within the cache TTL, don't re-probe.
    if (now - resolvedAt < HEALTH_CACHE_TTL_MS) return resolved;
    // Cache expired — re-probe the current provider; if healthy stay sticky,
    // otherwise walk the chain looking for a healthy fallback.
    const h = await resolved.health();
    if (h.ok) {
      resolvedAt = now;
      return resolved;
    }
    for (const provider of chain) {
      if (provider === resolved) continue;
      const h2 = await provider.health();
      if (h2.ok) {
        console.log(`[llm] Switched active provider: ${resolved.name} → ${provider.name}`);
        resolved = provider;
        resolvedAt = now;
        return resolved;
      }
      console.warn(`[llm] Provider '${provider.name}' unhealthy: ${h2.error || 'unknown'}`);
    }
    // All unhealthy — return primary; caller will surface the error from chat().
    return chain[0];
  }

  return {
    name: chain[0].name,
    chain: chain.map(p => p.name),
    async health() {
      const a = await active();
      const h = await a.health();
      return { ...h, chain: chain.map(p => p.name), activeProvider: a.name };
    },
    async chat(messages, opts) {
      const a = await active();
      return a.chat(messages, opts);
    },
  };
}

// ── oMLX provider ─────────────────────────────────────────────────

function buildOmlxProvider() {
  return {
    name: 'oMLX',
    async chat(messages, { timeoutMs = 120000, retryOpts = {} } = {}) {
      const candidateModels = [OMLX_MODEL, ...OMLX_FALLBACK_MODELS.filter(m => m !== OMLX_MODEL)];
      let lastError;
      for (const model of candidateModels) {
        try {
          const data = await withRetry(
            () =>
              fetchJsonOnce(`${OMLX_URL}/v1/chat/completions`, {
                method: 'POST',
                timeoutMs,
                headers: {
                  'Content-Type': 'application/json',
                  ...(OMLX_API_KEY ? { Authorization: `Bearer ${OMLX_API_KEY}` } : {}),
                },
                body: JSON.stringify({ model, messages, temperature: 0.1, max_tokens: 8192 }),
              }),
            { attempts: 2, baseDelayMs: 1200, label: `oMLX chat (${model})`, ...retryOpts },
          );
          return { content: data?.choices?.[0]?.message?.content ?? '', raw: data, model };
        } catch (err) {
          lastError = err;
          if (
            !isOmlxMemoryPressureError(err) ||
            model === candidateModels[candidateModels.length - 1]
          ) {
            throw err;
          }
          console.warn(`oMLX model ${model} OOM; trying next fallback: ${getErrorMessage(err)}`);
        }
      }
      throw lastError;
    },

    async health() {
      try {
        const data = await fetchJsonWithRetry(
          `${OMLX_URL}/v1/models`,
          { method: 'GET', timeoutMs: 6000, headers: { Authorization: `Bearer ${OMLX_API_KEY}` } },
          { attempts: 2, baseDelayMs: 500, label: 'oMLX probe' },
        );
        const models = Array.isArray(data?.data) ? data.data.map(m => m?.id).filter(Boolean) : [];
        return {
          ok: true,
          state: 'connected',
          loaded: models.includes(OMLX_MODEL),
          models,
          modelCount: models.length,
        };
      } catch (err) {
        return {
          ok: false,
          state: 'unreachable',
          error: getErrorMessage(err),
          retryable: isRetryableError(err),
        };
      }
    },
  };
}

// ── FreeLLMAPI provider ───────────────────────────────────────────

function buildFreeLLMAPIProvider() {
  return {
    name: 'FreeLLMAPI',
    async chat(messages, { timeoutMs = 120000, retryOpts = {} } = {}) {
      const data = await withRetry(
        () =>
          fetchJsonOnce(`${FREELLMAPI_URL}/v1/chat/completions`, {
            method: 'POST',
            timeoutMs,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${FREELLMAPI_API_KEY}`,
            },
            body: JSON.stringify({
              model: FREELLMAPI_MODEL,
              messages,
              temperature: 0.1,
              max_tokens: 8192,
            }),
          }),
        { attempts: 2, baseDelayMs: 1200, label: 'FreeLLMAPI chat', ...retryOpts },
      );
      const model = data?.model || FREELLMAPI_MODEL;
      return { content: data?.choices?.[0]?.message?.content ?? '', raw: data, model };
    },

    async health() {
      try {
        // FreeLLMAPI has no dedicated health endpoint; a lightweight /v1/models probe
        // with an invalid key returns fast. We use a trivial chat call instead.
        await fetchJsonOnce(`${FREELLMAPI_URL}/v1/chat/completions`, {
          method: 'POST',
          timeoutMs: 8000,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${FREELLMAPI_API_KEY}`,
          },
          body: JSON.stringify({
            model: FREELLMAPI_MODEL,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 2,
          }),
        });
        return { ok: true, state: 'connected', loaded: true };
      } catch (err) {
        return {
          ok: false,
          state: 'unreachable',
          error: getErrorMessage(err),
          retryable: isRetryableError(err),
        };
      }
    },
  };
}

// ── Mistral provider (OpenAI-compatible) ────────────────────────

function buildMistralProvider() {
  return {
    name: 'Mistral',
    async chat(messages, { timeoutMs = 120000, retryOpts = {} } = {}) {
      const data = await withRetry(
        () =>
          fetchJsonOnce(`${MISTRAL_URL}/chat/completions`, {
            method: 'POST',
            timeoutMs,
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              ...(MISTRAL_API_KEY ? { Authorization: `Bearer ${MISTRAL_API_KEY}` } : {}),
            },
            body: JSON.stringify({
              model: MISTRAL_MODEL,
              messages,
              temperature: 0.1,
              max_tokens: 8192,
            }),
          }),
        { attempts: 2, baseDelayMs: 1200, label: `Mistral chat (${MISTRAL_MODEL})`, ...retryOpts },
      );
      return {
        content: data?.choices?.[0]?.message?.content ?? '',
        raw: data,
        model: data?.model || MISTRAL_MODEL,
      };
    },
    async health() {
      try {
        const data = await fetchJsonWithRetry(
          `${MISTRAL_URL}/models`,
          {
            method: 'GET',
            timeoutMs: 6000,
            headers: {
              Accept: 'application/json',
              ...(MISTRAL_API_KEY ? { Authorization: `Bearer ${MISTRAL_API_KEY}` } : {}),
            },
          },
          { attempts: 1, baseDelayMs: 0, label: 'Mistral probe' },
        );
        const models = Array.isArray(data?.data) ? data.data.map(m => m?.id).filter(Boolean) : [];
        return {
          ok: true,
          state: 'connected',
          loaded: models.includes(MISTRAL_MODEL),
          models,
          modelCount: models.length,
        };
      } catch (err) {
        return {
          ok: false,
          state: 'unreachable',
          error: getErrorMessage(err),
          retryable: isRetryableError(err),
        };
      }
    },
  };
}

// ── Groq provider (OpenAI-compatible, reasoning-capable) ────────

function buildGroqProvider() {
  return {
    name: 'Groq',
    async chat(messages, { timeoutMs = 120000, retryOpts = {} } = {}) {
      const data = await withRetry(
        () =>
          fetchJsonOnce(`${GROQ_URL}/chat/completions`, {
            method: 'POST',
            timeoutMs,
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              ...(GROQ_API_KEY ? { Authorization: `Bearer ${GROQ_API_KEY}` } : {}),
            },
            body: JSON.stringify({
              model: GROQ_MODEL,
              messages,
              temperature: 0.1,
              max_tokens: 8192,
            }),
          }),
        { attempts: 2, baseDelayMs: 1200, label: 'Groq chat', ...retryOpts },
      );
      const msg = data?.choices?.[0]?.message ?? {};
      // Groq reasoning models (e.g. openai/gpt-oss-20b) put the visible answer in
      // `content` and chain-of-thought in `reasoning_content`. When `content` is
      // empty fall back to reasoning_content so the caller still sees something.
      const content = msg.content || msg.reasoning_content || '';
      return { content, raw: data, model: data?.model || GROQ_MODEL };
    },
    async health() {
      try {
        const data = await fetchJsonWithRetry(
          `${GROQ_URL}/models`,
          {
            method: 'GET',
            timeoutMs: 6000,
            headers: {
              Accept: 'application/json',
              ...(GROQ_API_KEY ? { Authorization: `Bearer ${GROQ_API_KEY}` } : {}),
            },
          },
          { attempts: 1, baseDelayMs: 0, label: 'Groq probe' },
        );
        const models = Array.isArray(data?.data) ? data.data.map(m => m?.id).filter(Boolean) : [];
        return {
          ok: true,
          state: 'connected',
          loaded: models.includes(GROQ_MODEL),
          models,
          modelCount: models.length,
        };
      } catch (err) {
        return {
          ok: false,
          state: 'unreachable',
          error: getErrorMessage(err),
          retryable: isRetryableError(err),
        };
      }
    },
  };
}

// Singleton — built once at startup
const llmProvider = buildLlmProvider();

function collectCandidateSegments(value, seen = new Set()) {
  if (!value || typeof value !== 'object') {
    return [];
  }

  if (seen.has(value)) {
    return [];
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap(item => collectCandidateSegments(item, seen));
  }

  const keysToProbe = [
    'segments',
    'transcript',
    'items',
    'entries',
    'lines',
    'captions',
    'data',
    'result',
  ];
  let collected = [];

  for (const key of keysToProbe) {
    if (value[key] !== undefined) {
      collected = collected.concat(collectCandidateSegments(value[key], seen));
    }
  }

  const hasText =
    typeof value.text === 'string' ||
    typeof value.snippet === 'string' ||
    typeof value.content === 'string';
  if (hasText) {
    collected.unshift(value);
  }

  return collected;
}

function normalizeTranscriptSegments(result) {
  const rawSegments = collectCandidateSegments(result);
  const normalized = rawSegments
    .map(item => {
      const text = he
        .decode(String(item?.text ?? item?.snippet ?? item?.content ?? ''))
        .replace(/\s+/g, ' ')
        .trim();
      const start = Number(item?.start ?? item?.offset ?? item?.begin ?? item?.time ?? 0);
      const duration = Number(item?.duration ?? item?.length ?? 0);
      return {
        text,
        start: Number.isFinite(start) ? Math.max(0, Math.round(start)) : 0,
        duration: Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0,
      };
    })
    .filter(item => item.text.length > 0)
    .sort((a, b) => a.start - b.start);

  return normalized;
}

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

// eslint-disable-next-line no-unused-vars -- dead code: kept for future YouTube title feature
async function _fetchVideoTitle(videoId) {
  return withRetry(
    async () => {
      const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        signal: AbortSignal.timeout(8000),
      });
      const html = await res.text();
      if (!res.ok) {
        throw new Error(`YouTube title fetch failed with HTTP ${res.status}`);
      }
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch) {
        return he.decode(titleMatch[1].replace(/\s*[-|]\s*YouTube\s*/i, '').trim());
      }
      throw new Error('YouTube title not found');
    },
    { attempts: 2, baseDelayMs: 500, label: 'YouTube title fetch' },
  );
}

const cache = new Map();
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MINUTES || 60) * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

function hashKey(text) {
  // SHA-256 truncated to 32 chars — compact, collision-resistant.
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 32);
}

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expires) return entry.value;
  cache.delete(key);
  return null;
}

function setCache(key, value, ttlMs = CACHE_TTL_MS) {
  // Evict oldest entry when at capacity (LRU approximation).
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, { value, expires: Date.now() + ttlMs });
}

async function loadBuildInfo() {
  try {
    const raw = await fs.promises.readFile(BUILD_INFO_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function renderFallbackHtml(reason) {
  const safeReason = he.encode(String(reason || 'Build artifacts are missing.'));
  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ytTranscript — build missing</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 40px; background:#0b1020; color:#e8ecff; }
    .card { max-width: 720px; margin:auto; padding:24px; border:1px solid rgba(255,255,255,.12); border-radius:16px; background:rgba(17,25,54,.9); }
    code { display:block; white-space:pre-wrap; background:rgba(255,255,255,.06); padding:12px; border-radius:12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>ytTranscript is starting in recovery mode</h1>
    <p>The frontend build is missing, so the app cannot serve the normal SPA yet.</p>
    <code>${safeReason}</code>
    <p>Run <strong>npm run build</strong> or <strong>./manage.sh restart</strong>.</p>
  </div>
</body>
</html>`;
}

function sendIndexHtml(res) {
  if (fs.existsSync(INDEX_HTML_PATH)) {
    return res.sendFile(INDEX_HTML_PATH);
  }
  res
    .status(503)
    .type('html')
    .send(renderFallbackHtml(`Missing ${INDEX_HTML_PATH}`));
}

function isMissingTranscriptError(message) {
  const lower = String(message || '').toLowerCase();
  return TRANSCRIPT_MISSING_PATTERNS.some(pattern => lower.includes(pattern));
}

/** Wraps llmProvider.health() — kept for backwards compat with existing route handlers. */
async function checkOmlx() {
  return llmProvider.health();
}

function buildReconstructSystemPrompt(translateTo = null) {
  const base = `You are a text reconstruction assistant.

Instructions:
- Merge fragmented transcript snippets into readable paragraphs.
- Preserve the original wording as closely as possible.
- Do not summarize.
- Do not add commentary.
- Return plain text only.`;

  if (translateTo === 'pl') {
    return (
      base +
      `\n- Output ONLY the final Polish text.\n- Never output both languages.\n- Do not add labels like "Translation" or "Tłumaczenie".`
    );
  }
  if (translateTo === 'de') {
    return (
      base +
      `\n- Output ONLY the final German text.\n- Never output both languages.\n- Do not add labels like "Translation" or "Übersetzung".`
    );
  }
  // No translation (original or 'en'): keep the same strict output-format
  // constraint as pl/de. Without it the model is free to emit markdown fences,
  // "Here is the reconstruction:" labels, or mixed commentary, which an upstream
  // response-shape/content validation rejects disproportionately for EN
  // ("The string did not match expected pattern."). See docs/RCA_reconstruct_pattern_mismatch.md.
  return (
    base +
    `\n- Output ONLY plain reconstructed English text.\n- Do not add labels like "Reconstruction", "Translation" or "English".\n- Do not wrap the output in markdown code fences.\n- Do not include explanatory commentary before or after the text.`
  );
}

function buildSummarizeSystemPrompt(translateTo = null) {
  const base = `You are a summarization assistant.

Instructions:
- Produce a comprehensive summary in short thematic paragraphs, not as a single wall of text.
- Begin with exactly one introductory paragraph (3-5 sentences) identifying the speaker/author/channel and the main topic of the video, based only on the transcript.
- After the introduction, cover each major theme in its own section.
- Each section must have a short bold header in the form **Theme Name:** followed by a concise paragraph of 2-4 sentences.
- Cover all major themes, arguments, findings, caveats, and consequences.
- Match the transcript language unless translation is requested.
- Return plain text only.
- No code blocks, no JSON, no meta-commentary.`;

  if (translateTo === 'pl') {
    return (
      base +
      `\n- Output ONLY the final Polish summary.\n- Never output both languages.\n- Do not add labels like "Summary", "Translation", "Podsumowanie" or "Tłumaczenie".`
    );
  }
  if (translateTo === 'de') {
    return (
      base +
      `\n- Output ONLY the final German summary.\n- Never output both languages.\n- Do not add labels like "Summary", "Translation", "Zusammenfassung" or "Übersetzung".`
    );
  }
  // No translation (original or 'en'): no language constraint in system prompt
  return base;
}

const TRANSFORM_PROMPTS = {
  reconstruct: {
    systemTemplate: 'reconstruct',
    userPrefix: 'Reconstruct this transcript into readable paragraphs.',
  },
  summarize: {
    systemTemplate: 'summarize',
    userPrefix: 'Summarize this transcript.',
  },
};

function stripReasoningArtifacts(text) {
  return String(text || '')
    .replace(/^Here(?:'|)s a thinking process:?\s*/im, '')
    .replace(/^\s*\*\*Analyze User Input:\*\*\s*/im, '')
    .replace(/^\s*\*\*Identify Key Challenges:\*\*\s*/im, '')
    .replace(/^\s*\*\*Process .*?\*\*\s*/im, '')
    .replace(/^\s*\*\*Self-Correction\/Refinement.*?\*\*\s*/im, '')
    .trim();
}

// Defensive cleanup of model output before validation. Strips markdown code
// fences (``` or ~~~) and common leading labels like "Reconstruction:" /
// "English:" / "Here is the reconstruction:" that an upstream response-shape
// validation may reject (the EN "did not match expected pattern" failure).
// Never throws — pure string transforms only.
function stripOutputWrappers(text) {
  let out = String(text || '').trim();

  // Remove a single leading/trailing fenced block, e.g. ```text ... ``` or ~~~
  const fenceMatch = out.match(/^(?:```|~~~)(?:[a-zA-Z0-9_-]*)?\s*\n([\s\S]*?)\n?(?:```|~~~)\s*$/);
  if (fenceMatch) {
    out = fenceMatch[1].trim();
  }

  // Strip common leading labels ("Reconstruction:", "English:", "Output:", etc.)
  out = out.replace(/^(?:reconstruction|english|output|result|translation|text)\s*[:\-]\s*/im, '');
  // Strip a leading "Here is the reconstruction:" style preamble sentence.
  out = out.replace(/^here(?:'|)s (?:the |a )?(?:reconstruction|english text|output|result)[:\-]?\s*/im, '');

  return out.trim();
}

function buildTranscriptResponse(videoId, result) {
  const snippets = normalizeTranscriptSegments(result);
  const title = result?.videoDetails?.title ? he.decode(String(result.videoDetails.title)) : null;
  return {
    videoId,
    title: title || `Video ${videoId}`,
    transcriptText: snippets.map(s => s.text).join(' '),
    snippets,
    videoDetails: result?.videoDetails || null,
  };
}

app.get('/api/build-version', async (req, res) => {
  noCache(res);
  const info = (await loadBuildInfo()) || {
    name: 'yt-transcript',
    version: '3.2.1',
    builtAt: null,
  };
  res.json({
    ...info,
    port: PORT,
    model: OMLX_MODEL,
  });
});

app.get('/api/ai-limit-status', (req, res) => {
  noCache(res);
  const ip = clientIp(req);
  if (!AI_DAILY_LIMIT_ENABLED) {
    return res.json({
      limitEnabled: false,
      dailyLimit: null,
      usedToday: null,
      remainingToday: null,
    });
  }
  const store = readLimitStore();
  const today = todayUtc();
  const entry = store[ip];
  if (!entry || entry.date !== today) {
    return res.json({
      limitEnabled: true,
      dailyLimit: AI_DAILY_LIMIT,
      usedToday: 0,
      remainingToday: AI_DAILY_LIMIT,
    });
  }
  res.json({
    limitEnabled: true,
    dailyLimit: AI_DAILY_LIMIT,
    usedToday: entry.count,
    remainingToday: Math.max(0, AI_DAILY_LIMIT - entry.count),
  });
});

app.get('/api/health', async (req, res) => {
  noCache(res);
  const t0 = Date.now();
  const lmStatus = await checkOmlx();
  const latencyMs = Date.now() - t0;
  // Resolve the configured model for the active primary provider so /api/health
  // stays accurate as providers are added.
  const activeModel = (() => {
    switch (LLM_PROVIDER) {
      case 'freellmapi':
        return FREELLMAPI_MODEL;
      case 'mistral':
        return MISTRAL_MODEL;
      case 'groq':
        return GROQ_MODEL;
      case 'omlx':
      default:
        return OMLX_MODEL;
    }
  })();
  // Feature availability derived from the prompt registry — when a prompt key
  // is removed in the future, the corresponding feature flag flips to false,
  // which lets the frontend expose a real "partial" state instead of a fake
  // "online". Today both are always true.
  const features = {
    reconstruct: Boolean(TRANSFORM_PROMPTS.reconstruct),
    summarize: Boolean(TRANSFORM_PROMPTS.summarize),
  };
  const mode = lmStatus.ok ? (llmProvider.name === 'oMLX' ? 'local' : 'remote') : 'unavailable';
  res.json({
    status: lmStatus.ok ? 'ok' : 'degraded',
    mode,
    features,
    latencyMs,
    checkedAt: new Date().toISOString(),
    provider: llmProvider.name,
    providerState: lmStatus.state,
    providerDetails: lmStatus,
    model: activeModel,
    buildVersion: (await loadBuildInfo())?.builtAt || null,
    uptimeSeconds: Math.round(process.uptime()),
    cacheEntries: cache.size,
    projectDescriptionUrl: PROJECT_DESCRIPTION_URL,
    privacyPolicyUrl: PRIVACY_POLICY_URL,
    contactEmail: AI_CONTACT_EMAIL,
  });
});

app.get('/api/lm-status', async (req, res) => {
  noCache(res);
  // Express-side guard: a hanging upstream probe must not stall the client.
  // The probe inside llmProvider.health() is already cached for HEALTH_CACHE_TTL_MS,
  // so this layer is a defense-in-depth for cold-start edge cases.
  const guard = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({
        ok: false,
        state: 'unreachable-fast',
        error: 'health probe timeout (express-side)',
      });
    }
  }, 2000);
  try {
    const status = await checkOmlx();
    if (!res.headersSent) res.json(status);
  } finally {
    clearTimeout(guard);
  }
});

app.get('/api/transcript', async (req, res) => {
  noCache(res);
  const { url } = req.query;

  if (!url) return res.status(400).json({ error: 'URL is required' });

  const videoId = extractVideoId(String(url));
  if (!videoId) {
    return res
      .status(400)
      .json({ error: 'Invalid YouTube URL. Expected watch, youtu.be, embed, or shorts URL.' });
  }

  try {
    const cacheKey = `transcript:${videoId}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const result = await withRetry(
      () =>
        withTimeout(
          () => fetchTranscript(videoId, { videoDetails: true }),
          90000,
          `Transcript fetch ${videoId}`,
        ),
      {
        attempts: 3,
        baseDelayMs: 750,
        label: `Transcript fetch ${videoId}`,
        shouldRetry: err => {
          const message = getErrorMessage(err).toLowerCase();
          if (isMissingTranscriptError(message)) return false;
          return isRetryableError(err);
        },
      },
    );

    const response = buildTranscriptResponse(videoId, result);
    if (!response.snippets.length) {
      throw new Error('Transcript payload did not contain readable segments');
    }

    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    const message = getErrorMessage(err);
    const lower = message.toLowerCase();
    if (isMissingTranscriptError(lower)) {
      return res.status(404).json({ error: 'No transcript found for this video.' });
    }

    console.error('Transcript fetch error:', err);
    res.status(isRetryableError(err) ? 503 : 500).json({
      error: 'Failed to fetch transcript.',
    });
  }
});

// ── Input length guard (before the route to catch oversized bodies) ────────────
const MAX_TRANSFORM_CHARS = 200_000;

function rawTextGuard(req, _res, next) {
  const raw = req.body?.snippets;
  const len = Array.isArray(raw) ? raw.reduce((n, s) => n + String(s.text || '').length, 0) : 0;
  if (len > MAX_TRANSFORM_CHARS) {
    return _res.status(413).json({
      error: `Input too large (${len} chars). Max: ${MAX_TRANSFORM_CHARS} chars.`,
    });
  }
  next();
}

app.post('/api/transform', rawTextGuard, transformLimiter, aiDailyLimitGuard, async (req, res) => {
  noCache(res);
  const { snippets, type, mode = 'original' } = req.body || {};
  if (!Array.isArray(snippets) || snippets.length === 0) {
    return res.status(400).json({ error: 'No snippets provided.' });
  }
  if (!TRANSFORM_PROMPTS[type]) {
    return res.status(400).json({ error: 'Invalid type. Use reconstruct or summarize.' });
  }

  // checkOmlx() → llmProvider.health(): provider-agnostic (was hardcoded to oMLX
  // pre-migration). Hardcoded error string replaced with provider.name template
  // so the message correctly identifies the active provider.
  const lmStatus = await checkOmlx();
  if (!lmStatus.ok) {
    return res.status(503).json({
      error: `${llmProvider.name} is unreachable: ${lmStatus.error || 'unknown error'}`,
    });
  }

  const promptDef = TRANSFORM_PROMPTS[type];
  const rawText = snippets.map(s => String(s.text || '')).join(' ');
  const userPrefix = promptDef.userPrefix;
  const userSuffix =
    type === 'reconstruct'
      ? 'Use paragraphs. Keep every meaning intact.'
      : 'STRUCTURE: First write exactly one introductory paragraph (3-5 sentences) about the speaker/author/channel and the topic of the video. Then write the rest as thematic sections. Each section must use a bold header like **Theme Name:** followed by a concise paragraph of 2-4 sentences. Use blank lines between sections. Do NOT use bullet points. Do NOT return one continuous block of text.';

  // Determine target language for translation mode
  const targetLang = (req.body.targetLang || 'pl').toLowerCase();
  const allowedLangs = ['pl', 'de', 'en'];
  const translateTo = mode === 'translate' && allowedLangs.includes(targetLang) ? targetLang : null;

  // Build system prompt based on type and target language
  const systemPrompt =
    type === 'reconstruct'
      ? buildReconstructSystemPrompt(translateTo)
      : buildSummarizeSystemPrompt(translateTo);

  // Build user prompt: prefix + raw text + suffix
  const userPrompt = `${userPrefix}\n\n${rawText}\n\n${userSuffix}`;

  // Capture timing just before the chat call so elapsedMs reflects actual work.
  const startAt = Date.now();

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await llmProvider.chat(messages, { timeoutMs: 120000 });
    let output = String(result.content || '').trim();

    try {
      const parsed = JSON.parse(output);
      if (parsed && typeof parsed === 'object' && typeof parsed.output === 'string') {
        output = parsed.output.trim();
      }
    } catch {
      // ignore accidental plain-text JSON-ish output
    }

    output = stripOutputWrappers(output);
    output = stripReasoningArtifacts(output);
    if (!output) {
      return res.status(502).json({ error: `${llmProvider.name} returned an empty response.` });
    }

    const responseKey = type === 'reconstruct' ? 'reconstructed' : 'summary';
    const cacheKey = `${type}:${mode}:${req.body.targetLang || 'pl'}:${hashKey(rawText)}`;
    const elapsedMs = Date.now() - startAt;
    // OpenAI-compatible upstream responses include usage.total_tokens; not all
    // providers return it (some free tiers omit it), so null is acceptable.
    const tokens = result.raw?.usage?.total_tokens ?? null;
    setCache(cacheKey, {
      [responseKey]: output,
      snippetCount: snippets.length,
      model: result.model,
      elapsedMs,
      tokens,
    });

    res.json({
      [responseKey]: output,
      snippetCount: snippets.length,
      model: result.model,
      provider: llmProvider.name,
      elapsedMs,
      tokens,
    });
  } catch (err) {
    console.error(`Transform/${type} error:`, err);
    res.status(502).json({ error: err?.message || 'Transformation failed.' });
  }
});

app.get('/', async (req, res) => {
  noCache(res);
  sendIndexHtml(res);
});

// ─── TTS (Piper, optional) ──────────────────────────────────────
// Graceful degradation: if Piper binary is missing, /api/tts returns 503
// with a clear hint instead of crashing the server. The frontend will
// surface the error in the useTTS hook without breaking the UI.
function stripMarkdownForTTS(text) {
  return String(text || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[#>*-]\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function generateTTS(text, lang, outPath) {
  return new Promise((resolve, reject) => {
    const voice = TTS_VOICES[lang];
    if (!voice) return reject(new Error(`No TTS voice for language: ${lang}`));
    const modelPath = path.join(PIPER_MODELS_DIR, voice.model);
    const configPath = voice.config
      ? path.join(PIPER_MODELS_DIR, voice.config)
      : modelPath.replace('.onnx', '.onnx.json');

    const args = ['-m', modelPath, '-c', configPath, '-f', outPath];
    const piper = spawn(PIPER_BIN, args);
    let stderr = '';
    piper.stderr.on('data', d => {
      stderr += d;
    });

    const timeout = setTimeout(() => {
      piper.kill('SIGKILL');
      reject(new Error('TTS generation timed out (120s)'));
    }, 120000);

    piper.on('error', err => {
      clearTimeout(timeout);
      reject(err);
    });
    piper.on('close', code => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`Piper exited ${code}: ${stderr}`));
      else resolve(outPath);
    });

    piper.stdin.write(text);
    piper.stdin.end();
  });
}

const MAX_TTS_CHARS = 50_000;

function ttsBodyGuard(req, _res, next) {
  const len = String(req.body?.text || '').length;
  if (len > MAX_TTS_CHARS) {
    return _res.status(413).json({
      error: `Text too large (${len} chars). Max: ${MAX_TTS_CHARS} chars.`,
    });
  }
  next();
}

// Allowed audio-source types — only reconstruction and summary are permitted.
// Raw transcript must NEVER reach the TTS pipeline.
const ALLOWED_TTS_TYPES = new Set(['reconstruction', 'summary']);
const SUPPORTED_TTS_LANGS = new Set(['en', 'de', 'pl']);

app.post('/api/tts', ttsBodyGuard, ttsLimiter, async (req, res) => {
  noCache(res);
  const { type, language, text } = req.body || {};

  // 1. Validate type — reject raw transcript or any other value
  if (!type || !ALLOWED_TTS_TYPES.has(type)) {
    return res.status(400).json({
      error: 'Invalid audio source. Use reconstruction or summary.',
    });
  }

  // 2. Validate text
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Text is required and must be non-empty.' });
  }

  if (!piperAvailable()) {
    return res.status(503).json({
      error: 'Piper TTS binary not installed.',
      hint: `Set PIPER_BIN env var to a working Piper executable (current: ${PIPER_BIN}).`,
    });
  }

  try {
    // 3. Resolve language (use provided, or detect)
    const resolvedLang =
      language && SUPPORTED_TTS_LANGS.has(language) ? language : detectLanguage(text) || 'en';

    if (!SUPPORTED_TTS_LANGS.has(resolvedLang)) {
      return res.status(400).json({
        error: 'Language not supported with audio function.',
        hint: 'Supported languages: English, German, Polish.',
      });
    }

    // 4. TTS-prep LLM — silently clean text for Piper
    console.log(
      `[TTS] Preparing ${type} text (${text.length} chars) for Piper in ${resolvedLang}...`,
    );
    const llm = llmProvider;
    const prepMessages = [
      {
        role: 'system',
        content: TTS_PREP_SYSTEM_PROMPTS[resolvedLang] || TTS_PREP_SYSTEM_PROMPTS.en,
      },
      { role: 'user', content: buildPiperPrepUserPrompt(text, type, resolvedLang) },
    ];
    let preparedText;
    try {
      const prepResponse = await llm.chat(prepMessages, { timeoutMs: 60000, model: null });
      preparedText = String(
        typeof prepResponse === 'string'
          ? prepResponse
          : prepResponse?.content || prepResponse?.text || prepResponse?.output || '',
      ).trim();

      // Guard: if LLM returned a sentinel, do not send to Piper
      if (isTtsPrepSentinel(preparedText)) {
        console.error(`[TTS] LLM returned sentinel "${preparedText}" — aborting Piper.`);
        return res.status(422).json({
          error: 'Audio preparation failed. The provided text could not be processed.',
        });
      }
    } catch (prepErr) {
      console.error('[TTS] LLM prep error:', prepErr.message);
      // Fall back to stripped raw text rather than failing completely
      preparedText = stripMarkdownForTTS(text);
      console.warn('[TTS] Falling back to stripped raw text for Piper.');
    }

    console.log(`[TTS] Prep done (${preparedText.length} chars) — synthesizing...`);

    // 5. Cache key: reuse existing audio for identical input
    const textHash = crypto
      .createHash('sha256')
      .update(`${type}:${resolvedLang}:${preparedText}`)
      .digest('hex')
      .slice(0, 16);
    const id = `${resolvedLang}-${type}-${textHash}`;
    const outPath = path.join(ttsCacheDir, `${id}.wav`);

    let audioUrl;
    if (fs.existsSync(outPath)) {
      // Cache hit — reuse existing file
      audioUrl = `/api/audio/${id}.wav`;
      console.log(`[TTS] Cache hit for ${id}`);
    } else {
      // 6. Piper synthesis
      await generateTTS(preparedText, resolvedLang, outPath);
      audioUrl = `/api/audio/${id}.wav`;
      console.log(`[TTS] Synthesized ${id} (${preparedText.length} chars) → ${audioUrl}`);
    }

    res.json({ audioUrl, durationMs: null, language: resolvedLang });
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: `Audio generation failed: ${err.message}` });
  }
});

app.get('/api/audio/:id', (req, res) => {
  const id = String(req.params.id).replace(/\.wav$/, '');
  // Path-traversal guard: id must be alphanumeric + dash
  if (!/^[A-Za-z0-9-]+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid audio id.' });
  }
  const filePath = path.join(ttsCacheDir, `${id}.wav`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio not found.' });
  }
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(filePath);
});

// Best-effort startup cleanup of TTS cache older than 24h
try {
  const ttsFiles = fs.readdirSync(ttsCacheDir);
  const oneDayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  let cleaned = 0;
  for (const file of ttsFiles) {
    if (file.endsWith('.wav')) {
      const fp = path.join(ttsCacheDir, file);
      const stats = fs.statSync(fp);
      if (now - stats.mtimeMs > oneDayMs) {
        fs.unlinkSync(fp);
        cleaned += 1;
      }
    }
  }
  if (cleaned > 0) console.log(`Cleaned ${cleaned} old TTS cache files`);
} catch {
  /* ignore */
}

app.use((req, res) => {
  noCache(res);
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled route error:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ error: 'Internal server error' });
});

let server;

function shutdown(code = 0, reason = 'shutdown') {
  if (!server) {
    process.exit(code);
  }
  console.log(`Shutting down ytTranscript (${reason})...`);
  server.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 5000).unref();
}

process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));
process.on('SIGINT', () => shutdown(0, 'SIGINT'));
process.on('unhandledRejection', err => {
  console.error('Unhandled promise rejection:', err);
  shutdown(1, 'unhandledRejection');
});
process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err);
  shutdown(1, 'uncaughtException');
});

server = app.listen(PORT, () => {
  console.log(`ytTranscript running on http://localhost:${PORT}`);
  console.log(`Frontend recovery: ${fs.existsSync(INDEX_HTML_PATH) ? 'available' : 'missing'}`);
});

server.on('error', err => {
  if (err?.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Another ytTranscript instance may still be running.`,
    );
  } else {
    console.error('Server error:', err);
  }
  shutdown(1, 'listen-error');
});
