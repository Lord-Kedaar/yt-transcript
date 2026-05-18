import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fetchTranscript } from 'youtube-transcript-plus';

const app = express();

// A. Config from env (with defaults)
const PORT = process.env.PORT || 4000;
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234';
const LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL || 'qwen3.6-35b-a3b-mlx-nvfp4';
const CACHE_TTL_MS = (parseInt(process.env.CACHE_TTL_MINUTES) || 60) * 60 * 1000;

app.use(cors({ origin: '*' }));
app.use(express.json());

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

async function fetchVideoTitle(videoId) {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await res.text();
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    if (titleMatch) {
      return titleMatch[1].replace(/\s*[-|]\s*YouTube\s*/i, '').trim();
    }
  } catch (err) {
    console.error('Title fetch error:', err.message);
  }
  return `Video ${videoId}`;
}

// B. Cache implementation
const cache = new Map();
function getCached(key) { const entry = cache.get(key); if (entry && Date.now() < entry.expires) return entry.value; cache.delete(key); return null; }
function setCache(key, value, ttlMs = CACHE_TTL_MS) { cache.set(key, { value, expires: Date.now() + ttlMs }); }
function clearCache() { cache.clear(); }

// C. LM Studio health check function
async function checkLMStudio() {
  try {
    const res = await fetch(`${LM_STUDIO_URL}/v1/models`, { method: 'GET', signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    const data = await res.json().catch(() => null);
    const hasModel = data?.data?.some(m => m.id === LM_STUDIO_MODEL);
    return { ok: true, models: data?.data?.map(m => m.id) || [], requested: LM_STUDIO_MODEL, loaded: hasModel };
  } catch (err) { return { ok: false, error: err.message }; }
}

app.get('/api/health', async (req, res) => {
  const lmStatus = await checkLMStudio();
  res.json({ status: 'ok', lmStudio: lmStatus.ok ? 'connected' : 'unreachable', model: LM_STUDIO_MODEL });
});

app.get('/api/transcript', async (req, res) => {
  const { url } = req.query;

  if (!url) return res.status(400).json({ error: 'URL is required' });

  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL. Expected format: youtube.com/watch?v=...' });
  }

  try {
    const cacheKey = `transcript:${videoId}`;
    let cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const result = await fetchTranscript(videoId, { videoDetails: true });

    const snippets = result.segments.map(item => ({
      text: item.text,
      start: Math.round(item.offset),
      duration: Math.round(item.duration || 0),
    }));

    const title = result.videoDetails?.title || await fetchVideoTitle(videoId);

    const response = { videoId, title, transcriptText: snippets.map(s => s.text).join(' '), snippets };
    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    const msg = err.message?.toLowerCase() || '';

    if (msg.includes('disabled') || msg.includes('not be retrieved') ||
        msg.includes('no transcript') || msg.includes('not available')) {
      return res.status(404).json({ error: 'No transcript found for this video. It may not have captions enabled.' });
    }

    console.error('Transcript fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch transcript. Video may be unavailable or restricted.' });
  }
});

// ===== RECONSTRUCT ENDPOINT (LM Studio + qwen3.6-35b-a3b-mlx-nvfp4) =====
app.post('/api/reconstruct', async (req, res) => {
  const { snippets } = req.body;

  if (!snippets || !Array.isArray(snippets) || snippets.length === 0) {
    return res.status(400).json({ error: 'No snippets provided for reconstruction.' });
  }

  // Check LM Studio health first
  const lmStatus = await checkLMStudio();
  if (!lmStatus.ok) {
    return res.status(503).json({ error: 'LM Studio is unreachable. Please ensure it is running on localhost:1234 with a model loaded.' });
  }

  // Build raw text from all snippet texts (preserves order)
  const rawText = snippets.map(s => s.text).join(' ');

  // The prompt: merge fragments into readable paragraphs, preserve ALL words
  const systemPrompt = `You are a text reconstruction assistant. You receive fragmented, broken-up sentences from an auto-generated video transcript where each sentence is split into multiple short segments.

Your ONLY job is to merge these fragments back into complete, readable paragraphs and sentences.

CRITICAL RULES:
- Preserve EVERY word exactly as it appears in the original fragments
- Do NOT summarize, edit, rewrite, or omit anything
- Do NOT add any new words or information
- Fix the sentence structure and line breaks so it reads naturally as proper text
- Group related fragments into coherent paragraphs
- The output should be the same spoken content, just properly structured

Output ONLY a JSON object with a single field "output": "..." containing the reconstructed text.`;

  const userPrompt = `Reconstruct the following transcript fragments into readable, properly structured text. Keep every word exactly as-is.\n\n${rawText}`;

  try {
    const response = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LM_STUDIO_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 8192,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errData = await response.text();
      console.error('LM Studio error:', errData);
      return res.status(502).json({ error: 'LM Studio returned an error. Is the model loaded?' });
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) {
      return res.status(500).json({ error: 'LM Studio returned no choices.' });
    }

    const msg = choice.message || {};

    // Try msg.content first; only if empty, try msg.reasoning_content
    const rawContent = msg.content || msg.reasoning_content || '';

    let reconstructed = rawContent.trim();
    try {
      const parsed = JSON.parse(reconstructed);
      reconstructed = parsed.output || reconstructed;
    } catch { /* not JSON, use rawContent */ }

    if (!reconstructed.trim()) {
      return res.status(500).json({ error: 'LM Studio returned an empty response.' });
    }

    // Cache the reconstruction result by a hash of snippet texts
    const cacheKey = `reconstruct:${btoa(snippets.map(s => s.text).join(' '))}`;
    setCache(cacheKey, { reconstructed, snippetCount: snippets.length, model: LM_STUDIO_MODEL });

    res.json({
      reconstructed,
      snippetCount: snippets.length,
      model: LM_STUDIO_MODEL,
    });

  } catch (err) {
    console.error('LM Studio request error:', err.message);
    res.status(502).json({
      error: 'Could not connect to LM Studio. Make sure it is running on localhost:1234 with a model loaded.',
    });
  }
});

// F. LM Studio health endpoint
app.get('/api/lm-status', async (req, res) => {
  const status = await checkLMStudio();
  res.json(status);
});

// H. Static file serving for production
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'client/dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'client/dist/index.html')));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  yt-transcript API running`);
  console.log(`    Local:   http://localhost:${PORT}`);
  console.log(`    Tailscale: http://100.127.3.65:${PORT}`);
  console.log(`\n  Frontend: http://localhost:3000`);
  console.log(`    Tailscale: http://100.127.3.65:3000\n`);
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT',  () => { server.close(); process.exit(0); });
