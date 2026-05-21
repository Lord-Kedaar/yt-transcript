import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fetchTranscript } from 'youtube-transcript-plus';
import he from 'he';
import fs from 'fs';
import { spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();

// Config paths (needed early for build version in /api/health)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'client/dist');
const BUILD_VERSION_FILE = path.join(DIST_DIR, 'build-version.json');

// A. Config from env (with defaults)
const PORT = process.env.PORT || 4000;
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234';
const LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL || 'bielik-11b-v3.0-mlx';
const CACHE_TTL_MS = (parseInt(process.env.CACHE_TTL_MINUTES) || 60) * 60 * 1000;

// TTS Config
const PIPER_BIN = process.env.PIPER_BIN || '/Users/radek/.hermes/hermes-agent/venv/bin/piper';
const PIPER_MODELS_DIR = process.env.PIPER_MODELS_DIR || '/Users/radek/.hermes/piper-models';
const TTS_VOICES = {
  pl: {
    name: 'justyna',
    model: 'pl_PL-justyna_wg_glos-medium.onnx',
    config: 'pl_PL-justyna_wg_glos-medium.onnx.json',
    espeakVoice: 'pl',
  },
  en: {
    name: 'hfc_female',
    model: 'en_US-hfc_female-medium.onnx',
    espeakVoice: 'en-us',
  },
  de: {
    name: 'thorsten',
    model: 'de_DE-thorsten-medium.onnx',
    espeakVoice: 'de',
  },
};
const ttsCacheDir = '/tmp/tts-cache';
fs.mkdirSync(ttsCacheDir, { recursive: true });

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

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

// D. LM Studio call + cleanup
async function callLMTransform({ type, snippets, mode }) {
  const translate = mode === 'translate';
  const promptDef = TRANSFORM_PROMPTS[type];

  let rawText;
  if (type === 'reconstruct') {
    const MAX_SNIPPETS = 150;
    const capped = snippets.slice(0, MAX_SNIPPETS);
    rawText = capped.map(s => s.text).join(' ');
  } else {
    rawText = snippets.map(s => s.text).join(' ');
  }

  let systemPrompt = promptDef.system;
  if (translate) {
    if (type === 'reconstruct') {
      systemPrompt += `\n\nTRANSLATION:\n- EVERYTHING must be in Polish (język polski).\n- This includes headers, emphasis, and all content.\n- Keep the paragraph structure and ALL meaning intact.\n- Translate all content — do NOT leave any part in the original language.`;
    } else {
      systemPrompt += `\n\nTRANSLATION:\n- EVERYTHING must be in Polish (język polski).\n- This includes headers, emphasis, and all content.\n- Each bullet point must be written in Polish.\n- Preserve ALL meaning, facts, and nuances — do NOT summarize further during translation.\n- Translate all content — do NOT leave any part in the original language.`;
    }
  }

  let userPrompt;
  if (type === 'reconstruct') {
    userPrompt = `Reconstruct the transcript below into readable paragraphs. Keep every word exactly as-is. Group related sentences by sub-topic. Separate paragraphs with a blank line.\n\n=== TRANSCRIPT ===\n${rawText}\n=== END ===\n\nOutput ONLY the reconstructed text. No introduction. No summary. No meta-commentary.`;
  } else {
    userPrompt = `${promptDef.userPrefix}\n\n=== TRANSCRIPT ===\n${rawText}\n=== END ===`;
    if (promptDef.userSuffix) {
      userPrompt += `\n\n${promptDef.userSuffix}`;
    }
  }
  if (translate) {
    if (type === 'reconstruct') {
      userPrompt += '\n\nWrite the entire reconstructed text in Polish (język polski). Translate every sentence into Polish.\n\nCRITICAL: ALL content must be in Polish. Do NOT output in English or any other language.';
    } else {
      userPrompt += '\n\nWrite the entire summary in Polish (język polski). Translate ALL content — including headers, emphasis, and explanations — into Polish.\n\nCRITICAL: ALL content must be in Polish. Do NOT output in English or any other language.';
    }
  }

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
    signal: AbortSignal.timeout(600000), // 10 min per chunk
  });

  if (!response.ok) {
    const errData = await response.text();
    console.error('LM Studio error:', errData);
    throw new Error('LM Studio returned an error. Is the model loaded?');
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error('LM Studio returned no choices.');

  const msg = choice.message || {};
  let rawContent = msg.content || '';
  const reasoning = msg.reasoning_content || '';
  if (!rawContent.trim() && reasoning.trim()) {
    rawContent = reasoning;
  }

  let output = rawContent.trim();
  for (const pattern of REASONING_STRIP_PATTERNS) {
    output = output.replace(pattern.re, '');
  }
  output = output.trim();

  if (!output) throw new Error('LM Studio returned an empty response.');
  return output;
}

// E. Chunked reconstruct for long transcripts
async function reconstructWithChunks(snippets, mode) {
  const CHUNK_SIZE = 150;
  const OVERLAP = 25; // carry last N snippets as context into next chunk

  const chunks = [];
  for (let i = 0; i < snippets.length; i += CHUNK_SIZE - OVERLAP) {
    chunks.push({
      snippets: snippets.slice(i, i + CHUNK_SIZE),
      index: chunks.length + 1,
      total: 0, // filled after loop
    });
  }
  chunks.forEach(c => c.total = chunks.length);
  console.log(`Reconstruct: processing ${snippets.length} snippets in ${chunks.length} chunks`);

  const outputs = [];
  for (const chunk of chunks) {
    console.log(`Reconstruct chunk ${chunk.index}/${chunk.total} (${chunk.snippets.length} snippets)`);
    const output = await callLMTransform({ type: 'reconstruct', snippets: chunk.snippets, mode });
    outputs.push(output);
  }

  // Merge chunk outputs with paragraph separators
  return outputs.join('\n\n');
}

app.get('/api/health', async (req, res) => {
  const lmStatus = await checkLMStudio();
  let buildVersion = null;
  if (fs.existsSync(BUILD_VERSION_FILE)) {
    try {
      const raw = fs.readFileSync(BUILD_VERSION_FILE, 'utf-8');
      buildVersion = JSON.parse(raw).version || null;
    } catch { /* ignore */ }
  }
  res.json({ status: 'ok', lmStudio: lmStatus.ok ? 'connected' : 'unreachable', model: LM_STUDIO_MODEL, buildVersion });
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

// ===== UNIFIED TRANSFORM ENDPOINT (reconstruct | summarize) =====
const TRANSFORM_PROMPTS = {
  reconstruct: {
    system: `You are a text reconstruction assistant.

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
- NO markdown \`\`\` blocks — output plain text only`,
    userPrefix: 'Below is a raw transcript with sentence fragments. Reconstruct it into readable paragraphs. Keep every word exactly as-is. Group related sentences by sub-topic. Separate paragraphs with a blank line. Output ONLY the reconstructed text — no introduction, no meta-commentary, no summary.',
    userSuffix: '',
  },
  summarize: {
    system: `You are a summarization assistant. Produce a comprehensive, detailed bullet-point summary of the transcript.

RULES:
- Every significant theme, argument, or data point gets its own substantive bullet (2-3 sentences, ~30-50 words).
- Explain WHY it matters, not just WHAT was said.
- Use markdown inline formatting (**bold** for emphasis, *italic* for terms) where it improves readability.
- Each bullet starts with "- " (dash + space).
- NO numbered lists, NO code blocks, NO meta-commentary.`,
    userPrefix: 'Summarize this transcript into bullet points.',
    userSuffix: 'STRUCTURE (follow this EXACTLY):\n\n1) First, write ONE paragraph (3-5 sentences) introducing: who is speaking / who is the author, and what is the main topic of this video.\n\n2) Then, for EACH major theme, write a section with:\n   - A bold header like **Theme Name:**\n   - Followed by a detailed paragraph (2-4 sentences) explaining the theme\n\nDo NOT use bullet points with "- ". Use section headers and paragraphs instead.\n\nUse **bold** for emphasis and *italic* for terms where helpful.',
  }
};

const REASONING_STRIP_PATTERNS = [
  { re: /^Here's? a thinking process:?\s*/im, label: 'thinking' },
  { re: /^(?:\d+\.)?\s*\*\*Analyze User Input:\*\*\s*/im, label: 'analyze' },
  { re: /^(?:\d+\.)?\s*\*\*Identify Key Challenges:\*\*\s*/im, label: 'challenges' },
  { re: /^(?:\d+\.)?\s*\*\*Process & Reconstruct.*?\*\*\s*/im, label: 'process' },
  { re: /^(?:\d+\.)?\s*\*\*Self-Correction\/Refinement.*?\*\*\s*/im, label: 'self-correction' },
  { re: /\*Paragraph \d+:\*\s*/gi, label: 'paragraph-tag' },
  { re: /\*Self-Correction\/Refinement.*?\*\s*/gi, label: 'self-correction-block' },
  { re: /\*Check against constraints:\*\s*/gi, label: 'constraints' },
  { re: /\*Text to output:\*\s*/gi, label: 'output-tag' },
  { re: /Let's draft it out carefully\.\s*/gi, label: 'draft' },
  { re: /I wіll carefully (?:check|paste|construct|output)\..*?\s*/gi, label: 'iwl' },
  { re: /Actually,? I'?ll just output.*?\s*/gi, label: 'actually' },
  { re: /I'?ll format it carefully\.\s*/gi, label: 'format' },
  { re: /^\s*-{3,}\s*$/gm, label: 'divider' },
  { re: /^\s*=+\s*$/gm, label: 'equals-divider' },
];

app.post('/api/transform', async (req, res) => {
  const { snippets, type, mode, title } = req.body;

  if (!snippets || !Array.isArray(snippets) || snippets.length === 0) {
    return res.status(400).json({ error: 'No snippets provided.' });
  }

  if (!type || !TRANSFORM_PROMPTS[type]) {
    return res.status(400).json({ error: 'Invalid type. Use "reconstruct" or "summarize".' });
  }

  const lmStatus = await checkLMStudio();
  if (!lmStatus.ok) {
    return res.status(503).json({ error: 'LM Studio is unreachable. Please ensure it is running with a model loaded.' });
  }

  try {
    let output;
    let chunkCount = 1;

    if (type === 'reconstruct') {
      // Always use chunking; for short transcripts produces 1 chunk
      output = await reconstructWithChunks(snippets, mode || 'original');
      chunkCount = Math.ceil(snippets.length / (150 - 25)); // approximate; can refine
      if (snippets.length <= 150) chunkCount = 1;
    } else {
      output = await callLMTransform({ type, snippets, mode: mode || 'original' });
    }

    // Cache result (key on all snippet text + type)
    const cacheKey = `${type}:${Buffer.from(snippets.map(s => s.text).join(' ')).toString('base64')}`;
    setCache(cacheKey, { output, type, snippetCount: snippets.length, model: LM_STUDIO_MODEL });

    const responseKey = type === 'reconstruct' ? 'reconstructed' : 'summary';
    res.json({
      [responseKey]: output,
      snippetCount: snippets.length,
      chunkCount,
      model: LM_STUDIO_MODEL,
    });
  } catch (err) {
    console.error(`Transform/${type} error:`, err);
    res.status(502).json({ error: err.message || `Transformation failed` });
  }
});

// LM Studio health endpoint
app.get('/api/lm-status', async (req, res) => {
  const status = await checkLMStudio();
  res.json(status);
});

// Static file serving for production

function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

app.get('/api/build-version', (req, res) => {
  setNoCacheHeaders(res);
  if (fs.existsSync(BUILD_VERSION_FILE)) {
    return res.sendFile(BUILD_VERSION_FILE);
  }
  return res.status(404).json({ error: 'Build version file not found. Run npm run build.' });
});

// TTS Utility: simple language detection
function detectLanguage(text = '') {
  const t = text.slice(0, 500).toLowerCase();
  const plChars = (t.match(/[ąćęłńóśźż]/g) || []).length;
  const deChars = (t.match(/[äöüß]/g) || []).length;
  if (plChars > 1) return 'pl';
  if (deChars > 1) return 'de';
  return 'en'; // default fallback
}

// Strip markdown markers so TTS reads plain text, not literal stars
function stripMarkdownForTTS(text) {
  return String(text)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*>\s+/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*{2,}/g, '')
    .trim();
}

// TTS Utility: generate WAV via Piper
function generateTTS(text, lang, outPath) {
  return new Promise((resolve, reject) => {
    const voice = TTS_VOICES[lang];
    if (!voice || !voice.model) {
      return reject(new Error(`No TTS voice for language: ${lang}`));
    }
    
    const modelPath = path.join(PIPER_MODELS_DIR, voice.model);
    const configPath = voice.config
      ? path.join(PIPER_MODELS_DIR, voice.config)
      : modelPath.replace('.onnx', '.onnx.json');

    const args = ['-m', modelPath, '-c', configPath, '-f', outPath];
    const piper = spawn(PIPER_BIN, args);

    let stderr = '';
    piper.stderr.on('data', d => { stderr += d; });

    // Timeout: kill Piper if it hangs
    const timeout = setTimeout(() => {
      piper.kill('SIGKILL');
      reject(new Error('TTS generation timed out (120s)'));
    }, 120000);

    piper.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    piper.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) reject(new Error(`Piper exited ${code}: ${stderr}`));
      else resolve(outPath);
    });

    piper.stdin.write(text);
    piper.stdin.end();
  });
}

// TTS endpoint
app.post('/api/tts', async (req, res) => {
  try {
    const { text, lang } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required and must be non-empty.' });
    }
    const detectedLang = (lang && ['pl','en','de'].includes(lang)) ? lang : detectLanguage(text);
    const voice = TTS_VOICES[detectedLang];
    if (!voice || !voice.model) {
      return res.status(404).json({
        error: `No TTS voice available for language '${detectedLang}'.`,
        hint: `Install a female Piper voice for ${detectedLang}: hermes piper download ${detectedLang}-female`,
      });
    }

    const id = `${detectedLang}-${crypto.randomBytes(8).toString('hex')}`;
    const outPath = path.join(ttsCacheDir, `${id}.wav`);
    await generateTTS(stripMarkdownForTTS(text), detectedLang, outPath);

    res.json({ audioUrl: `/api/audio/${id}.wav`, lang: detectedLang });
  } catch (err) {
    console.error('TTS error:', err);
    res.status(500).json({ error: 'TTS generation failed: ' + err.message });
  }
});

// Serve generated WAV files
app.get('/api/audio/:id', (req, res) => {
  const id = req.params.id.replace(/\.wav$/, '');
  const filePath = path.join(ttsCacheDir, `${id}.wav`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio not found.' });
  }
  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(filePath);
});

app.use(express.static(DIST_DIR, { setHeaders: setNoCacheHeaders }));
app.get('*', (req, res) => {
  setNoCacheHeaders(res);
  res.sendFile(path.join(DIST_DIR, 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  // Cleanup old TTS cache files on startup (older than 24h)
  try {
    const ttsFiles = fs.readdirSync(ttsCacheDir);
    const oneDayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cleaned = 0;
    for (const file of ttsFiles) {
      if (file.endsWith('.wav')) {
        const filePath = path.join(ttsCacheDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > oneDayMs) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      }
    }
    if (cleaned > 0) console.log(`  Cleaned ${cleaned} old TTS cache files`);
  } catch (e) { /* ignore */ }

  console.log(`\n  yt-transcript API + SPA running`);
  console.log(`    Local:     http://localhost:${PORT}`);
  console.log(`    Tailscale: http://100.127.3.65:${PORT}\n`);
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT',  () => { server.close(); process.exit(0); });
