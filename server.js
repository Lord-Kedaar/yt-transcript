import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fetchTranscript } from 'youtube-transcript-plus';
import he from 'he';

const app = express();

// A. Config from env (with defaults)
const PORT = process.env.PORT || 4000;
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234';
const LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL || 'bielik-11b-v3.0-mlx';
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
      text: he.decode(item.text),
      start: Math.round(item.offset),
      duration: Math.round(item.duration || 0),
    }));

    const title = result.videoDetails?.title ? he.decode(result.videoDetails.title) : await fetchVideoTitle(videoId);

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
  const { snippets, mode } = req.body;
  const translate = mode === 'translate';

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
  let systemPrompt = `You are a text reconstruction assistant.

INSTRUCTIONS:
Merge the fragmented transcript snippets back into complete paragraphs.
- Group related sentences into paragraphs by SUB-TOPIC (not just by flow)
- Each paragraph must cover ONE theme/concept (2 to 6 sentences max)
- Put a BLANK LINE between every paragraph
- Preserve EVERY word exactly as-is — do NOT summarize, edit, or omit anything
- Fix line breaks so sentences flow naturally within each paragraph

OUTPUT RULES:
- Return ONLY the reconstructed text — plain paragraphs, no JSON, no code blocks
- Each paragraph separated by a single blank line (two consecutive newlines)
- Do NOT add thinking steps, numbered lists, or self-correction notes
- Do NOT include any meta-commentary like "Paragraph 1" or "Self-correction"
- NO markdown \`\`\` blocks — output plain text only`;

  if (translate) {
    systemPrompt += `\n\nTRANSLATION:\n- Translate the entire reconstructed text into Polish (język polski).\n- Keep the paragraph structure and ALL meaning intact.\n- Translate all content — do NOT leave any part in the original language.`;
  }

  const MAX_SNIPPETS = 300;
  if (snippets.length > MAX_SNIPPETS) {
    console.warn(`Reconstruct: capping ${snippets.length} snippets to ${MAX_SNIPPETS}`);
  }
  const limitedSnippets = snippets.slice(0, MAX_SNIPPETS);
  const limitedRawText = limitedSnippets.map(s => s.text).join(' ');

  const userPrompt = `Reconstruct this transcript into readable paragraphs. Keep every word exactly as-is.\n\n${limitedRawText}\n\nFormat: one blank line between each paragraph.`;

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
        max_tokens: 32768,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(1800000),
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
    let rawContent = msg.content || '';
    const reasoning = msg.reasoning_content || '';

    // Model sometimes puts everything in reasoning_content
    if (!rawContent.trim() && reasoning.trim()) {
      rawContent = reasoning;
    }

    let reconstructed = rawContent.trim();

    // Strip reasoning model's meta-commentary before sending to user
    reconstructed = reconstructed
      .replace(/^Here's? a thinking process:?\s*/im, '')
      .replace(/^(?:\d+\.)?\s*\*\*Analyze User Input:\*\*\s*/im, '')
      .replace(/^(?:\d+\.)?\s*\*\*Identify Key Challenges:\*\*\s*/im, '')
      .replace(/^(?:\d+\.)?\s*\*\*Process & Reconstruct.*?\*\*\s*/im, '')
      .replace(/^(?:\d+\.)?\s*\*\*Self-Correction\/Refinement.*?\*\*\s*/im, '')
      .replace(/\*Paragraph \d+:\*\s*/gi, '')
      .replace(/\*Self-Correction\/Refinement.*?\*\s*/gi, '')
      .replace(/\*Check against constraints:\*\s*/gi, '')
      .replace(/\*Text to output:\*\s*/gi, '')
      .replace(/Let's draft it out carefully\.\s*/gi, '')
      .replace(/I wіll carefully (?:check|paste|construct|output)\..*?\s*/gi, '')
      .replace(/Actually,? I'?ll just output.*?\s*/gi, '')
      .replace(/I'?ll format it carefully\.\s*/gi, '')
      .trim();

    if (!reconstructed.trim()) {
      return res.status(500).json({ error: 'LM Studio returned an empty response.' });
    }

    // Cache the reconstruction result by a hash of snippet texts
    const cacheKey = `reconstruct:${Buffer.from(snippets.map(s => s.text).join(' ')).toString('base64')}`;
    setCache(cacheKey, { reconstructed, snippetCount: snippets.length, model: LM_STUDIO_MODEL });

    res.json({
      reconstructed,
      snippetCount: snippets.length,
      model: LM_STUDIO_MODEL,
    });

  } catch (err) {
    console.error('Reconstruct error:', err);
    res.status(502).json({
      error: err.message || 'Reconstruction failed',
    });
  }
});

// ===== SUMMARIZE ENDPOINT =====
app.post('/api/summarize', async (req, res) => {
  const { snippets, mode } = req.body;
  const translate = mode === 'translate';

  if (!snippets || !Array.isArray(snippets) || snippets.length === 0) {
    return res.status(400).json({ error: 'No snippets provided for summarization.' });
  }

  const lmStatus = await checkLMStudio();
  if (!lmStatus.ok) {
    return res.status(503).json({ error: 'LM Studio is unreachable.' });
  }

  const rawText = snippets.map(s => s.text).join(' ');

  let systemPrompt = `You are a summarization assistant producing COMPREHENSIVE, DETAILED summaries.

INSTRUCTIONS:
- Summarize into comprehensive, detailed bullet points covering ALL major themes, sub-topics, and narrative arcs.
- Do NOT be brief or stop early — every significant thread, argument, or data point in the transcript deserves its own substantive bullet.
- Each bullet must be a COMPLETE, SUBSTANTIVE paragraph (2-3 sentences, ~30-50 words) that explains not just WHAT was said, but WHY it matters, WHAT the consequence is, or HOW it connects to the broader argument.
- Do NOT be lapidary or overly terse. Do NOT merely list topics — ANALYZE and EXPLAIN each point's significance.
- Capture main arguments, supporting evidence, specific examples, data, and any recommendations or conclusions.
- If the transcript contains multiple distinct topics, ensure EACH gets its own detailed bullet point.

OUTPUT RULES:
- Return bullet points in the user's language (matching the transcript).
- no JSON, no code blocks, no numbered lists.
- Start each bullet with "- " (dash + space).
- NO markdown \`\`\` blocks — output plain text only.
- Do NOT include filler, introductions, or meta-commentary.`;

  if (translate) {
    systemPrompt += `\n\nTRANSLATION:\n- Translate the entire summary into Polish (język polski).\n- Each bullet point must be written in Polish.\n- Preserve ALL meaning, facts, and nuances — do NOT summarize further during translation.\n- Translate all content — do NOT leave any part in the original language.`;
  }

  const userPrompt = `Summarize this transcript.\n\n${rawText}`;

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
        max_tokens: 32768,
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(1800000),
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
    const rawContent = msg.content || msg.reasoning_content || '';
    let summary = rawContent.trim();

    if (!summary) {
      return res.status(500).json({ error: 'LM Studio returned an empty response.' });
    }

    res.json({ summary, snippetCount: snippets.length, model: LM_STUDIO_MODEL });

  } catch (err) {
    console.error('Summarize error:', err);
    res.status(502).json({ error: err.message || 'Summarization failed' });
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
