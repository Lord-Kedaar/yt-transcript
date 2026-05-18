import { useState, useRef } from 'react';
import './styles/main.css';
import Header from './components/Header';
import UrlInput from './components/UrlInput';
import TranscriptPanel from './components/TranscriptPanel';
import ReconstructedPanel from './components/ReconstructedPanel';
import SummaryPanel from './components/SummaryPanel';
import ExportButtons from './components/ExportButtons';

const API_URL = '/api/transcript';
const RECONSTRUCT_URL = '/api/reconstruct';
const SUMMARIZE_URL = '/api/summarize';

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [reconstructing, setReconstructing] = useState(false);
  const [error, setError] = useState('');
  const [transcriptData, setTranscriptData] = useState(null);
  const [reconstructedText, setReconstructedText] = useState('');
  const [reconstructProgress, setReconstructProgress] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryProgress, setSummaryProgress] = useState('');
  const timerRef = useRef(null);

  async function handleFetch() {
    if (!url.trim()) return;
    
    setLoading(true);
    setError('');
    setTranscriptData(null);
    setReconstructedText('');
    setReconstructProgress('');

    try {
      const res = await fetch(`${API_URL}?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch transcript');
      }

      setTranscriptData(data);
    } catch (err) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  async function handleReconstruct() {
    if (!transcriptData) return;

    setReconstructing(true);
    setError('');                 // clear previous errors

    // Progress timer — users need to know LM inference takes ~2-3 min
    let sec = 0;
    setReconstructProgress('AI reconstructing...');
    timerRef.current = setInterval(() => {
      sec += 1;
      setReconstructProgress(`AI reconstructing... (${sec}s)`);
    }, 1000);

    try {
      const res = await fetch(RECONSTRUCT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snippets: transcriptData.snippets }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Reconstruction failed');
      }

      setReconstructedText(data.reconstructed);
    } catch (err) {
      setError(err.message || 'Reconstruction failed');
    } finally {
      setReconstructing(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setReconstructProgress('');
    }
  }

  async function handleSummarize() {
    if (!transcriptData) return;

    setSummarizing(true);
    setError('');

    let sec = 0;
    setSummaryProgress('AI summarizing...');
    timerRef.current = setInterval(() => {
      sec += 1;
      setSummaryProgress(`AI summarizing... (${sec}s)`);
    }, 1000);

    try {
      const res = await fetch(SUMMARIZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snippets: transcriptData.snippets }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Summarization failed');
      }

      setSummaryText(data.summary);
    } catch (err) {
      setError(err.message || 'Summarization failed');
    } finally {
      setSummarizing(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setSummaryProgress('');
    }
  }

  function handleReset() {
    setUrl('');
    setError('');
    setTranscriptData(null);
    setReconstructedText('');
    setSummaryText('');
    setReconstructProgress('');
    setSummaryProgress('');
  }

  return (
    <div className="app-container">
      <Header />
      
      <main className="main-content">
        <UrlInput value={url} onChange={setUrl} onFetch={handleFetch} loading={loading} />

        {error && (
          <div className="error-message">
            <span className="error-icon">&#9888;</span>
            {error}
          </div>
        )}

        {transcriptData && (
          <>
            <div className="video-info">
              <h2>{transcriptData.title}</h2>
            </div>

            <div className="action-buttons">
              <button className="reconstruct-button" onClick={handleReconstruct} disabled={reconstructing || summarizing}>
                {reconstructing ? (
                  <>
                    <span className="spinner-sm"></span>
                    Reconstructing...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4m0 12v4m-7.05-13.95l2.83 2.83m8.84 8.84l2.83 2.83M2 12h4m12 0h4M4.22 4.22l2.83 2.83m8.84 8.84l2.83 2.83"/>
                    </svg>
                    Reconstruct with AI
                  </>
                )}
              </button>
              <button className="summarize-button" onClick={handleSummarize} disabled={reconstructing || summarizing}>
                {summarizing ? (
                  <>
                    <span className="spinner-sm"></span>
                    Summarizing...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                      <polyline points="10 9 9 9 8 9"/>
                    </svg>
                    Summarize with AI
                  </>
                )}
              </button>
            </div>

            {reconstructProgress && (
              <div className="reconstruct-progress">{reconstructProgress}</div>
            )}
            {summaryProgress && (
              <div className="reconstruct-progress">{summaryProgress}</div>
            )}

            {reconstructedText && (
              <ReconstructedPanel text={reconstructedText} />
            )}
            {summaryText && (
              <SummaryPanel text={summaryText} />
            )}

            <ExportButtons snippets={transcriptData.snippets} />

            <TranscriptPanel 
              snippets={transcriptData.snippets}
              title="Raw Segments"
            />

            <button className="reset-button" onClick={handleReset}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
              New Search
            </button>
          </>
        )}

        {!loading && !error && !transcriptData && (
          <div className="empty-state">
            <p>Paste a YouTube link above to extract the transcript</p>
          </div>
        )}
      </main>

      <footer className="app-footer">
        ytTranscript &mdash; YouTube Transcript Extractor + AI Reconstruct
      </footer>
    </div>
  );
}
