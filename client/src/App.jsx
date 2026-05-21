import { useState, useRef, useEffect } from 'react';
import './styles/main.css';
import Header from './components/Header';
import UrlInput from './components/UrlInput';
import TranscriptPanel from './components/TranscriptPanel';
import ReconstructedPanel from './components/ReconstructedPanel';
import SummaryPanel from './components/SummaryPanel';
import ExportButtons from './components/ExportButtons';
import { BUILD_INFO } from './buildInfo.js';

const API_URL = '/api/transcript';
const TRANSFORM_URL = '/api/transform';

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [transcriptData, setTranscriptData] = useState(null);
  const [reconstructedText, setReconstructedText] = useState('');
  const [summaryText, setSummaryText] = useState('');
  const [aiProgress, setAiProgress] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState(null); // 'reconstruct' | 'summarize'
  const [currentLang, setCurrentLang] = useState(''); // 'translate' => pl, '' => en

  const timerRef = useRef(null);
  const aiAbortRef = useRef(null);

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
    setSummaryText('');
    setAiProgress('');

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
    if (!modalAction) return;
    setCurrentLang(mode === 'translate' ? 'pl' : 'en');
    await handleTransform(modalAction, mode);
  }

  async function handleTransform(type, mode = 'original') {
    if (!transcriptData) return;

    // Cancel any previous request
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
    }
    const controller = new AbortController();
    aiAbortRef.current = controller;

    setAiLoading(true);
    setError('');

    const progressLabel = type === 'reconstruct' ? 'AI reconstructing...' : 'AI summarizing...';
    let sec = 0;
    setAiProgress(progressLabel);
    timerRef.current = setInterval(() => {
      sec += 1;
      setAiProgress(`${progressLabel} (${sec}s)`);
    }, 1000);

    try {
      const res = await fetch(TRANSFORM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snippets: transcriptData.snippets,
          type,
          mode,
          title: transcriptData?.title || '',
        }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Transformation failed');
      }

      if (type === 'reconstruct') {
        setReconstructedText(data.reconstructed);
        setSummaryText('');
      } else {
        setSummaryText(data.summary);
        setReconstructedText('');
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Transform aborted');
        setError(`${type === 'reconstruct' ? 'Reconstruction' : 'Summarization'} cancelled`);
      } else {
        setError(err.message || 'Transformation failed');
      }
    } finally {
      setAiLoading(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setAiProgress('');
      aiAbortRef.current = null;
    }
  }

  function handleReset() {
    // Cancel any in-flight AI request
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
      aiAbortRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setAiLoading(false);
    setUrl('');
    setError('');
    setTranscriptData(null);
    setReconstructedText('');
    setSummaryText('');
    setAiProgress('');
  }

  const isReconstructing = aiLoading && modalAction === 'reconstruct';
  const isSummarizing = aiLoading && modalAction === 'summarize';

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
            <div className="reset-bar">
              <button className="reset-app-button" onClick={handleReset} title="New Transcript">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
                New Transcript
              </button>
            </div>

            <div className="video-info">
              <h2>{transcriptData.title}</h2>
            </div>

            <div className="action-buttons">
              <button className="reconstruct-button" onClick={() => openModal('reconstruct')} disabled={aiLoading}>
                {isReconstructing ? (
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
              <button className="summarize-button" onClick={() => openModal('summarize')} disabled={aiLoading}>
                {isSummarizing ? (
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

            {aiProgress && (
              <div className="reconstruct-progress">{aiProgress}</div>
            )}

            {reconstructedText && (
              <ReconstructedPanel text={reconstructedText} lang={currentLang} />
            )}
            {summaryText && (
              <SummaryPanel text={summaryText} lang={currentLang} />
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

        <div className="build-info" data-build-version={BUILD_INFO.version}>
          build {BUILD_INFO.gitSha} · {BUILD_INFO.builtAt} · port {BUILD_INFO.port}
        </div>
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
