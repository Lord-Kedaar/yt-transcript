import express from 'express';
import cors from 'cors';
import { fetchTranscript } from 'youtube-transcript';

const app = express();
const PORT = process.env.PORT || 4000;
const LM_STUDIO_URL = 'http://localhost:1234';

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

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'yt-transcript API running' });
});

app.get('/api/transcript', async (req, res) => {
  const { url } = req.query;

  if (!url) return res.status(400).json({ error: 'URL is required' });

  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL. Expected format: youtube.com/watch?v=...' });
  }

  try {
    const transcript = await fetchTranscript(videoId);

    const snippets = Object.values(transcript).map(item => ({
      text: item.text,
      start: Math.round((item.offset || 0) / 100),
      duration: Math.round((item.duration || 0) / 100),
    }));

    if (snippets.length === 0) {
      return res.status(404).json({ error: 'No transcript found for this video. It may not have captions enabled.' });
    }

    const title = await fetchVideoTitle(videoId);

    res.json({ videoId, title, transcriptText: snippets.map(s => s.text).join(' '), snippets });
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

Input: fragmented transcript segments
Output: reconstructed text in proper paragraphs`;

  const userPrompt = `Reconstruct the following transcript fragments into readable, properly structured text. Keep every word exactly as-is.\n\n${rawText}`;

  try {
    const response = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen3.6-35b-a3b-mlx-nvfp4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 8192,
        temperature: 0.1,
      }),
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
    
    // qwen3.6-35b-a3b-mlx-nvfp4 outputs to reasoning_content, not content
    // Extract the meaningful text from reasoning_content
    let rawOutput = msg.content || '';
    
    if (!rawOutput.trim()) {
      const reasoning = msg.reasoning_content || '';
      // Clean up the reasoning content: remove thinking process markers
      // The model outputs structured thinking like "Here's a thinking process:" and numbered steps
      // We want to extract the actual output text
      rawOutput = cleanReasoningOutput(reasoning);
    }

    if (!rawOutput.trim()) {
      return res.status(500).json({ error: 'LM Studio returned an empty response.' });
    }

    res.json({
      reconstructed: rawOutput,
      snippetCount: snippets.length,
      model: 'qwen3.6-35b-a3b-mlx-nvfp4',
    });

  } catch (err) {
    console.error('LM Studio request error:', err.message);
    res.status(502).json({
      error: 'Could not connect to LM Studio. Make sure it is running on localhost:1234 with a model loaded.',
    });
  }
});

// Extract meaningful output from qwen's reasoning_content
function cleanReasoningOutput(text) {
  if (!text || !text.trim()) return '';

  // Remove common thinking process markers
  let cleaned = text;
  
  // Remove "Here's a thinking process:" / "Thinking Process:" headers
  cleaned = cleaned.replace(/^(here['']s\s+)?(a\s+)?thinking\s+(process|thought)[:\s]+/i, '');
  
  // Remove numbered step headers like "1. **Analyze User Input:**"
  cleaned = cleaned.replace(/(\d+\.\s+)\*\*(.+?)\*\*[:\s]*/g, '$2: ');
  
  // Remove bullet points and list markers at start of lines
  cleaned = cleaned.replace(/^[•\-\*]\s*/gm, '');
  
  // Remove trailing thinking fragments (partial sentences at the end)
  // The actual output tends to be in the middle; trailing fragments are incomplete thoughts
  const lines = cleaned.split('\n');
  
  // Find the last complete paragraph (not a fragment)
  let resultLines = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line.length > 10) {
      resultLines.push(line);
    }
  }

  if (resultLines.length > 0) {
    return resultLines.join('\n').trim();
  }

  // Fallback: just clean up the whole text
  return cleaned.replace(/\n{3,}/g, '\n\n').trim();
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  yt-transcript API running`);
  console.log(`    Local:   http://localhost:${PORT}`);
  console.log(`    Tailscale: http://100.127.3.65:${PORT}`);
  console.log(`\n  Frontend: http://localhost:3000`);
  console.log(`    Tailscale: http://100.127.3.65:3000\n`);
});

process.on('SIGTERM', () => { server.close(); process.exit(0); });
process.on('SIGINT',  () => { server.close(); process.exit(0); });

