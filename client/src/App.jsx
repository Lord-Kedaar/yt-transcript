import { useState, useRef, useEffect } from 'react';
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
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState(null); // 'reconstruct' | 'summarize'

  const timerRef = useRef(null);
  const reconstructAbortRef = useRef(null);
  const summarizeAbortRef = useRef(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = modalOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [modalOpen]);

  async function handleFetch() {
    if (!url.trim()) return;
    
    setLoading(true);
    setError('');
    setTranscriptData(null);
    setReconstructedText('');
    setReconstructProgress('');
    setSummaryText('');
    setSummaryProgress('');

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

  function openModal(action) {
    setModalAction(action);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setModalAction(null);
  }

  async function handleModalChoice(mode) {
    closeModal();
    if (modalAction === 'reconstruct') {
      await handleReconstruct(mode);
    } else if (modalAction === 'summarize') {
      await handleSummarize(mode);
    }
  }

  async function handleReconstruct(mode = 'original') {
    if (!transcriptData) return;

    // Cancel any previous request
    if (reconstructAbortRef.current) {
      reconstructAbortRef.current.abort();
    }
    const controller = new AbortController();
    reconstructAbortRef.current = controller;

    setReconstructing(true);
    setError('');

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
        body: JSON.stringify({ snippets: transcriptData.snippets, mode }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Reconstruction failed');
      }

      setReconstructedText(data.reconstructed);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Reconstruct aborted');
        setError('Reconstruction cancelled');
      } else {
        setError(err.message || 'Reconstruction failed');
      }
    } finally {
      setReconstructing(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setReconstructProgress('');
      reconstructAbortRef.current = null;
    }
  }

  async function handleSummarize(mode = 'original') {
    if (!transcriptData) return;

    // Cancel any previous request
    if (summarizeAbortRef.current) {
      summarizeAbortRef.current.abort();
    }
    const controller = new AbortController();
    summarizeAbortRef.current = controller;

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
        body: JSON.stringify({ snippets: transcriptData.snippets, mode }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Summarization failed');
      }

      setSummaryText(data.summary);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Summarize aborted');
        setError('Summarization cancelled');
      } else {
        setError(err.message || 'Summarization failed');
      }
    } finally {
      setSummarizing(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setSummaryProgress('');
      summarizeAbortRef.current = null;
    }
  }

  function handleReset() {
    // Cancel any in-flight AI requests
    if (reconstructAbortRef.current) {
      reconstructAbortRef.current.abort();
      reconstructAbortRef.current = null;
    }
    if (summarizeAbortRef.current) {
      summarizeAbortRef.current.abort();
      summarizeAbortRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setReconstructing(false);
    setSummarizing(false);
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
              <button className="reconstruct-button" onClick={() => openModal('reconstruct')} disabled={reconstructing || summarizing}>
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
              <button className="summarize-button" onClick={() => openModal('summarize')} disabled={reconstructing || summarizing}>
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
              <ReconstructedPanel text={reconstructedText} onReset={handleReset} />
            )}
            {summaryText && (
              <SummaryPanel text={summaryText} onReset={handleReset} />
            )}

            <ExportButtons snippets={transcriptData.snippets} />

            <TranscriptPanel 
              snippets={transcriptData.snippets}
              title="Raw Segments"
            />
          </>
        )}

        {!loading && !error && !transcriptData && (
          <div className="empty-state">
            <p>Paste a YouTube link above to extract the transcript</p>
          </div>
        )}
      </main>

      {/* Language Choice Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Choose Language</h3>
              <button className="modal-close" onClick={closeModal} title="Cancel">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <button className="modal-choice-btn" onClick={() => handleModalChoice('original')}>
                <span className="modal-choice-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20v-8m0 0V4m0 8h8m-8 0H4"/>
                  </svg>
                </span>
                <div className="modal-choice-text">
                  <strong>Keep original language</strong>
                  <span>Reconstruct in the language of the transcript</span>
                </div>
              </button>
              <button className="modal-choice-btn modal-choice-translate" onClick={() => handleModalChoice('translate')}>
                <span className="modal-choice-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 5h20M2 12h10M2 19h7"/>
                  </svg>
                </span>
                <div className="modal-choice-text">
                  <strong>Translate to Polish</strong>
                  <span>Przetłumacz na język polski</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        ytTranscript &mdash; YouTube Transcript Extractor + AI Reconstruct
      </footer>
    </div>
  );
}
