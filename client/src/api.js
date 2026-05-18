const API_BASE = '/api';

export async function fetchTranscript(url) {
  const res = await fetch(`${API_BASE}/transcript?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to fetch transcript');
  }
  return res.json();
}

export function exportToTXT(snippets) {
  const text = snippets.map(s => s.text).join(' ');
  downloadFile(text, 'transcript.txt', 'text/plain');
}

export function exportToSRT(snippets) {
  let srt = '';
  for (let i = 0; i < snippets.length; i++) {
    const start = formatSRTTime(snippets[i].start);
    const endTime = (i + 1 < snippets.length)
      ? snippets[i + 1].start
      : snippets[i].start + snippets[i].duration;
    const end = formatSRTTime(endTime);
    srt += `${i + 1}\n${start} --> ${end}\n${snippets[i].text}\n\n`;
  }
  downloadFile(srt.trim(), 'transcript.srt', 'text/plain');
}

function formatSRTTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export { formatSRTTime };
