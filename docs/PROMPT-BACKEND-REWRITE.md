# OpenCode Backend Rewrite — ytTranscript

## Context
Project: ytTranscript at /Users/radek/yt-transcript
Express backend needs complete rewrite to fix critical issues.

## What to do (in order)

### 1. Install new dependencies
```
npm install dotenv youtube-transcript-plus
npm install --save-dev @types/youtube-transcript-plus  # if needed
```

### 2. Create `.env` at project root
```
PORT=4000
LM_STUDIO_URL=http://localhost:1234
LM_STUDIO_MODEL=qwen3.6-35b-a3b-mlx-nvfp4
CACHE_TTL_MINUTES=60
```

### 3. Rewrite `server.js` — FULL FILE REWRITE REQUIRED

Use `import 'dotenv/config'` at the top.

Keep these EXACTLY as they are (working code):
- `extractVideoId()` function (regex patterns for watch, embed, shorts)
- `fetchVideoTitle()` function (fetch YouTube page, regex title)
- Express error handling structure
- SIGTERM / SIGINT handlers

Replace / create NEW code for:

**A. Config from env (with defaults)**
- `PORT = process.env.PORT || 4000`
- `LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234'`
- `LM_STUDIO_MODEL = process.env.LM_STUDIO_MODEL || 'qwen3.6-35b-a3b-mlx-nvfp4'`
- `CACHE_TTL_MS = (parseInt(process.env.CACHE_TTL_MINUTES) || 60) * 60 * 1000`

**B. Cache implementation**
```js
const cache = new Map();
function getCached(key) { const entry = cache.get(key); if (entry && Date.now() < entry.expires) return entry.value; cache.delete(key); return null; }
function setCache(key, value, ttlMs = CACHE_TTL_MS) { cache.set(key, { value, expires: Date.now() + ttlMs }); }
function clearCache() { cache.clear(); }
```

**C. LM Studio health check function**
```js
async function checkLMStudio() {
  try {
    const res = await fetch(`${LM_STUDIO_URL}/v1/models`, { method: 'GET', signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    const data = await res.json().catch(() => null);
    const hasModel = data?.data?.some(m => m.id === LM_STUDIO_MODEL);
    return { ok: true, models: data?.data?.map(m => m.id) || [], requested: LM_STUDIO_MODEL, loaded: hasModel };
  } catch (err) { return { ok: false, error: err.message }; }
}
```

**D. Replace `youtube-transcript` with `youtube-transcript-plus`**
Replace the `/api/transcript` endpoint body.
```js
import { fetchTranscript } from 'youtube-transcript-plus';

// In /api/transcript, replace the fetch logic:
const cacheKey = `transcript:${videoId}`;
let cached = getCached(cacheKey);
if (cached) return res.json(cached);

const result = await fetchTranscript(videoId, { videoDetails: true });
// result.segments: [{ text, start (seconds as float?), duration (seconds as float?) }]
// result.videoDetails: { title, author, channelId, lengthSeconds, viewCount, thumbnails }

const snippets = result.segments.map(item => ({
  text: item.text,
  start: Math.round(item.start),  // if start is already in seconds, round it
  duration: Math.round(item.duration || 0),
}));

const title = result.videoDetails?.title || await fetchVideoTitle(videoId);

const response = { videoId, title, transcriptText: snippets.map(s => s.text).join(' '), snippets };
setCache(cacheKey, response);
res.json(response);
```

Note: `youtube-transcript-plus` returns `start` and `duration` already in seconds. DO NOT divide by 100. The old code divided by 100 because `youtube-transcript` returned values in hundredths. The new library returns seconds.

**E. Enhanced `/api/reconstruct` endpoint**
- Add a check: if LM Studio is unreachable, return 503 with clear message
- Try `msg.content` first; only if empty, try `msg.reasoning_content`
- Instead of `cleanReasoningOutput()`, use a system prompt that tells the model to output JSON with {"output": "..."}
- Parse the JSON response; if parsing fails, fallback to raw `content`
- Add AbortSignal.timeout(120000) (2 min) to the fetch call
- Cache the reconstruction result by a hash of snippet texts

```js
const systemPrompt = `You are a text reconstruction assistant... (same as before but add:) Output ONLY a JSON object with a single field "output": "..." containing the reconstructed text.`;

// After getting response:
const rawContent = msg.content || msg.reasoning_content || '';
let reconstructed = rawContent.trim();
try {
  const parsed = JSON.parse(reconstructed);
  reconstructed = parsed.output || reconstructed;
} catch { /* not JSON, use rawContent */ }
```

Remove the entire `cleanReasoningOutput()` function.

**F. Add LM Studio health endpoint**
```js
app.get('/api/lm-status', async (req, res) => {
  const status = await checkLMStudio();
  res.json(status);
});
```

**G. Enhanced `/api/health`**
```js
app.get('/api/health', async (req, res) => {
  const lmStatus = await checkLMStudio();
  res.json({ status: 'ok', lmStudio: lmStatus.ok ? 'connected' : 'unreachable', model: LM_STUDIO_MODEL });
});
```

**H. Static file serving for production**
After the API routes, add:
```js
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'client/dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'client/dist/index.html')));
```

### 4. Update `package.json` (root)
Replace `"youtube-transcript": "^1.2.1"` with `"youtube-transcript-plus": "^2.0.0"`.
Add `"dotenv": "^16.0.0"` to dependencies.

## Verification steps (do after implementing)
1. `npm install` must succeed
2. `node server.js` must start without syntax errors
3. `curl http://localhost:4000/api/health` must return JSON with lmStudio status
4. `curl http://localhost:4000/api/lm-status` must return JSON with ok/model fields
5. `git diff --stat` must show changes only to expected files

## Rules
- Use ESM imports throughout (`import ... from...`), no require()
- Maintain the existing server.js structure and formatting style
- Preserve all existing endpoints (add new ones, don't remove old URLs)
- Do NOT touch files in client/ directory
- Do NOT delete any files
- After implementing, run `npm install` in the project root
- After npm install, run `git add -A && git diff --stat`
- Report back: which files changed, lines added/removed, any errors
