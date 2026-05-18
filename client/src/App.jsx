import { useState, useRef } from 'react';
import './styles/main.css';
import Header from './components/Header';
import UrlInput from './components/UrlInput';
import TranscriptPanel from './components/TranscriptPanel';
import ReconstructedPanel from './components/ReconstructedPanel';
import ExportButtons from './components/ExportButtons';

const API_URL = '/api/transcript';
const RECONSTRUCT_URL = '/api/reconstruct';

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [reconstructing, setReconstructing] = useState(false);
  const [error, setError] = useState('');
  const [transcriptData, setTranscriptData] = useState(null);
  const [reconstructedText, setReconstructedText] = useState('');
  const [reconstructProgress, setReconstructProgress] = useState('');
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

  function handleReset() {
    setUrl('');
    setError('');
    setTranscriptData(null);
    setReconstructedText('');
    setReconstructProgress('');
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

            <button className="reconstruct-button" onClick={handleReconstruct} disabled={reconstructing}>
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

            {reconstructProgress && (
              <div className="reconstruct-progress">{reconstructProgress}</div>
            )}

            {reconstructedText && (
              <ReconstructedPanel text={reconstructedText} />
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
