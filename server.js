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
const OMLX_URL = process.env.OMLX_URL || process.env.LM_STUDIO_URL || 'http://localhost:8585';
const OMLX_MODEL = process.env.OMLX_MODEL || process.env.LM_STUDIO_MODEL || 'gemma-4-12B-it-nvfp4';
const OMLX_FALLBACK_MODELS = ['gemma-4-12B-it-assistant-nvfp4', 'Qwen3.5-4B-mlx-lm-nvfp4'];
// No hardcoded fallback — operators must set OMLX_API_KEY in production.
// oMLX allows unauthenticated requests (empty Bearer is accepted locally).
const OMLX_API_KEY = process.env.OMLX_API_KEY || process.env.LM_STUDIO_API_KEY || '';
const BUILD_INFO_PATH = path.join(__dirname, 'client', 'dist', 'build-info.json');
const INDEX_HTML_PATH = path.join(__dirname, 'client', 'dist', 'index.html');

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
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

app.disable('x-powered-by');
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '16mb' }));
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
  return (
    message.includes('aborterror') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('fetch failed') ||
    message.includes('econnreset') ||
    message.includes('connection reset') ||
    message.includes('eai_again') ||
    message.includes('etimedout') ||
    message.includes('socket hang up') ||
    message.includes('network') ||
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

async function checkOmlx() {
  try {
    const data = await fetchJsonWithRetry(
      `${OMLX_URL}/v1/models`,
      {
        method: 'GET',
        timeoutMs: 6000,
        headers: {
          Authorization: `Bearer ${OMLX_API_KEY}`,
        },
      },
      { attempts: 2, baseDelayMs: 500, label: 'oMLX probe' },
    );

    const models = Array.isArray(data?.data)
      ? data.data.map(model => model?.id).filter(Boolean)
      : [];
    return {
      ok: true,
      state: 'connected',
      requested: OMLX_MODEL,
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
}

const TRANSFORM_PROMPTS = {
  reconstruct: {
    system: `You are a text reconstruction assistant.

Instructions:
- Merge fragmented transcript snippets into readable paragraphs.
- Preserve the original wording as closely as possible.
- Do not summarize.
- Do not add commentary.
- Return plain text only.
- If translation is requested, output ONLY the final Polish text.
- Never output both languages.
- Do not add labels like "Translation" or "Tłumaczenie".
`,
    userPrefix: 'Reconstruct this transcript into readable paragraphs.',
  },
  summarize: {
    system: `You are a summarization assistant.

Instructions:
- Produce a comprehensive summary in short thematic paragraphs, not as a single wall of text.
- Begin with exactly one introductory paragraph (3-5 sentences) identifying the speaker/author/channel and the main topic of the video, based only on the transcript.
- After the introduction, cover each major theme in its own section.
- Each section must have a short bold header in the form **Theme Name:** followed by a concise paragraph of 2-4 sentences.
- Cover all major themes, arguments, findings, caveats, and consequences.
- Match the transcript language unless translation is requested.
- Return plain text only.
- No code blocks, no JSON, no meta-commentary.
- If translation is requested, output ONLY the final Polish summary.
- Never output both languages.
- Do not add labels like "Summary", "Translation", "Podsumowanie" or "Tłumaczenie".
`,
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
    version: '3.2.0',
    builtAt: null,
  };
  res.json({
    ...info,
    port: PORT,
    model: OMLX_MODEL,
  });
});

app.get('/api/health', async (req, res) => {
  noCache(res);
  const lmStatus = await checkOmlx();
  res.json({
    status: lmStatus.ok ? 'ok' : 'degraded',
    provider: 'oMLX',
    providerState: lmStatus.state,
    providerDetails: lmStatus,
    model: OMLX_MODEL,
    buildVersion: (await loadBuildInfo())?.builtAt || null,
    uptimeSeconds: Math.round(process.uptime()),
    cacheEntries: cache.size,
  });
});

app.get('/api/lm-status', async (req, res) => {
  noCache(res);
  res.json(await checkOmlx());
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

app.post('/api/transform', rawTextGuard, transformLimiter, async (req, res) => {
  noCache(res);
  const { snippets, type, mode = 'original' } = req.body || {};
  if (!Array.isArray(snippets) || snippets.length === 0) {
    return res.status(400).json({ error: 'No snippets provided.' });
  }
  if (!TRANSFORM_PROMPTS[type]) {
    return res.status(400).json({ error: 'Invalid type. Use reconstruct or summarize.' });
  }

  const lmStatus = await checkOmlx();
  if (!lmStatus.ok) {
    return res.status(503).json({ error: 'oMLX is unreachable.' });
  }

  const promptDef = TRANSFORM_PROMPTS[type];
  const rawText = snippets.map(s => String(s.text || '')).join(' ');
  const userPrefix = promptDef.userPrefix;
  const userSuffix =
    type === 'reconstruct'
      ? 'Use paragraphs. Keep every meaning intact.'
      : 'STRUCTURE: First write exactly one introductory paragraph (3-5 sentences) about the speaker/author/channel and the topic of the video. Then write the rest as thematic sections. Each section must use a bold header like **Theme Name:** followed by a concise paragraph of 2-4 sentences. Use blank lines between sections. Do NOT use bullet points. Do NOT return one continuous block of text.';

  let systemPrompt = promptDef.system;
  if (mode === 'translate') {
    systemPrompt +=
      type === 'reconstruct'
        ? '\nTranslate the entire output into Polish. Return Polish only.'
        : '\nTranslate the entire summary into Polish. Return Polish only.';
  }

  const translationSuffix =
    mode === 'translate'
      ? '\nOutput must be only in Polish. No English. No bilingual version. Preserve the same structure: one intro paragraph, then themed sections with bold headers and short paragraphs.'
      : '';

  const userPrompt = `${userPrefix}\n\n${rawText}\n\n${userSuffix}${translationSuffix}`;

  try {
    const candidateModels = [
      OMLX_MODEL,
      ...OMLX_FALLBACK_MODELS.filter(model => model !== OMLX_MODEL),
    ];
    let data = null;
    let usedModel = null;
    let lastError = null;

    for (const model of candidateModels) {
      try {
        data = await withRetry(
          () =>
            fetchJsonOnce(`${OMLX_URL}/v1/chat/completions`, {
              method: 'POST',
              timeoutMs: 120000,
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${OMLX_API_KEY}`,
              },
              body: JSON.stringify({
                model,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
                temperature: 0.1,
                max_tokens: 8192,
              }),
            }),
          {
            attempts: 2,
            baseDelayMs: 1200,
            label: `oMLX transform/${type} (${model})`,
          },
        );
        usedModel = model;
        break;
      } catch (err) {
        lastError = err;
        if (
          !isOmlxMemoryPressureError(err) ||
          model === candidateModels[candidateModels.length - 1]
        ) {
          throw err;
        }
        console.warn(
          `oMLX model ${model} rejected by memory guard; retrying with smaller fallback model: ${getErrorMessage(err)}`,
        );
      }
    }

    if (!data || !usedModel) {
      throw lastError || new Error('oMLX transform failed without a usable model');
    }

    const choice = data?.choices?.[0] || {};
    const msg = choice.message || {};
    let output = String(msg.content || msg.reasoning_content || '').trim();

    try {
      const parsed = JSON.parse(output);
      if (parsed && typeof parsed === 'object' && typeof parsed.output === 'string') {
        output = parsed.output.trim();
      }
    } catch {
      // ignore accidental plain-text JSON-ish output
    }

    output = stripReasoningArtifacts(output);
    if (!output) {
      return res.status(502).json({ error: 'oMLX returned an empty response.' });
    }

    const responseKey = type === 'reconstruct' ? 'reconstructed' : 'summary';
    const cacheKey = `${type}:${mode}:${hashKey(rawText)}`;
    setCache(cacheKey, { [responseKey]: output, snippetCount: snippets.length, model: usedModel });

    res.json({
      [responseKey]: output,
      snippetCount: snippets.length,
      model: usedModel,
      fallbackUsed: usedModel !== OMLX_MODEL,
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
function detectLanguage(text) {
  const sample = String(text || '').slice(0, 400);
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(sample)) return 'pl';
  if (/[äöüßÄÖÜ]/.test(sample)) return 'de';
  return 'en';
}

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

app.post('/api/tts', ttsBodyGuard, ttsLimiter, async (req, res) => {
  noCache(res);
  const { text, lang } = req.body || {};
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
    const detectedLang = lang && TTS_VOICES[lang] ? lang : detectLanguage(text);
    const id = `${detectedLang}-${crypto.randomBytes(8).toString('hex')}`;
    const outPath = path.join(ttsCacheDir, `${id}.wav`);
    await generateTTS(stripMarkdownForTTS(text), detectedLang, outPath);
    res.json({ audioUrl: `/api/audio/${id}.wav`, lang: detectedLang });
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: `TTS generation failed: ${err.message}` });
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

server = app.listen(PORT, '0.0.0.0', () => {
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
