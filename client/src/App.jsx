import { useState, useRef, useEffect } from 'react';
import './styles/main.css';
import Header from './components/Header';
import UrlInput from './components/UrlInput';
import TranscriptPanel from './components/TranscriptPanel';
import ReconstructedPanel from './components/ReconstructedPanel';
import SummaryPanel from './components/SummaryPanel';
import ExportButtons from './components/ExportButtons';
import DemoNoticeModal from './components/DemoNoticeModal';
import { BUILD_INFO } from './buildInfo.js';

const API_URL = '/api/transcript';
const TRANSFORM_URL = '/api/transform';
const UI_STATE_KEY = 'ytTranscript.uiState.v1';

function safeParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatElapsedSeconds(startedAt) {
  if (!startedAt) return 0;
  return Math.max(1, Math.floor((Date.now() - startedAt) / 1000));
}

function formatAiProgress(type, startedAt, paused = false) {
  const base = type === 'reconstruct' ? 'AI reconstructing...' : 'AI summarizing...';
  if (!startedAt) return paused ? `${base} (paused)` : base;
  const secs = formatElapsedSeconds(startedAt);
  return paused ? `${base} (paused, ${secs}s)` : `${base} (${secs}s)`;
}

function serializeUiState(state) {
  return JSON.stringify(state);
}

function exportUiState({
  url,
  transcriptData,
  reconstructedText,
  summaryText,
  currentLang,
  pendingTransform,
}) {
  const payload = {
    url,
    transcriptData,
    reconstructedText,
    summaryText,
    currentLang,
    pendingTransform,
  };
  try {
    sessionStorage.setItem(UI_STATE_KEY, serializeUiState(payload));
  } catch (err) {
    console.warn('Failed to persist UI state', err);
  }
}

function clearUiState() {
  try {
    sessionStorage.removeItem(UI_STATE_KEY);
  } catch (err) {
    console.warn('Failed to clear UI state', err);
  }
}

function loadUiState() {
  try {
    return safeParseJson(sessionStorage.getItem(UI_STATE_KEY));
  } catch {
    return null;
  }
}

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
  const aiStartedAtRef = useRef(null);
  const pendingTransformRef = useRef(null);
  const pageSuspendedRef = useRef(false);
  const hydratedRef = useRef(false);
  const resumeInFlightRef = useRef(false);

  // Restore state after Safari backgrounding / bfcache resume.
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const saved = loadUiState();
    if (saved) {
      setUrl(saved.url || '');
      setTranscriptData(saved.transcriptData || null);
      setReconstructedText(saved.reconstructedText || '');
      setSummaryText(saved.summaryText || '');
      setCurrentLang(saved.currentLang || '');
      if (saved.pendingTransform) {
        pendingTransformRef.current = saved.pendingTransform;
      }
    }
  }, []);

  // Safari bfcache workaround: clear UI state on pagehide to avoid stale resume.
  useEffect(() => {
    const handlePageHide = () => {
      if (pendingTransformRef.current) {
        clearUiState();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && pendingTransformRef.current) {
        pageSuspendedRef.current = true;
        clearUiState();
      } else if (!document.hidden && pageSuspendedRef.current) {
        pageSuspendedRef.current = false;
        const saved = loadUiState();
        if (saved) {
          setUrl(saved.url || '');
          setTranscriptData(saved.transcriptData || null);
          setReconstructedText(saved.reconstructedText || '');
          setSummaryText(saved.summaryText || '');
          setCurrentLang(saved.currentLang || '');
        }
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Auto-hide loading state after 10s for AI operations.
  useEffect(() => {
    if (aiLoading) {
      timerRef.current = setTimeout(() => {
        setAiLoading(false);
        setAiProgress('');
      }, 10000);
    } else {
      clearTimeout(timerRef.current);
    }

    return () => clearTimeout(timerRef.current);
  }, [aiLoading]);

  // Reset UI state on explicit URL change.
  useEffect(() => {
    clearUiState();
  }, [url]);

  // Prevent body scroll when modal is open.
  useEffect(() => {
    document.body.style.overflow = modalOpen ? 'hidden' : '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [modalOpen]);

  async function fetchTranscript(e) {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError('');
    setTranscriptData(null);
    setReconstructedText('');
    setSummaryText('');

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setTranscriptData(data);

      if (data.transcript) {
        setReconstructedText(data.transcript);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleTransform(action, mode = 'original') {
    if (!transcriptData || !transcriptData.transcript) return;

    setAiLoading(true);
    setAiProgress(formatAiProgress(action));
    setError('');

    pendingTransformRef.current = { action, mode };
    exportUiState({
      url,
      transcriptData,
      reconstructedText,
      summaryText,
      currentLang,
      pendingTransform: { action, mode },
    });

    aiStartedAtRef.current = Date.now();

    try {
      const response = await fetch(TRANSFORM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          transcript: transcriptData.transcript,
          action,
          mode,
          lang: currentLang || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (action === 'reconstruct') {
        setReconstructedText(data.result || '');
      } else if (action === 'summarize') {
        setSummaryText(data.result || '');
      }

      pendingTransformRef.current = null;
    } catch (err) {
      setError(err.message);
      pendingTransformRef.current = null;
    } finally {
      setAiLoading(false);
      setAiProgress('');
      if (aiStartedAtRef.current) {
        aiStartedAtRef.current = null;
      }
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

    await handleTransform(modalAction, mode);
  }

  function handleTranslateModeChange(lang) {
    setCurrentLang(lang);
  }

  const isReconstructing = aiLoading && modalAction === 'reconstruct';
  const isSummarizing = aiLoading && modalAction === 'summarize';

  return (
    <div className="app-container">
      <Header />
      <main className="main-content">
        <UrlInput
          url={url}
          loading={loading}
          onFetch={fetchTranscript}
        />
        {error && <div className="error-message">{error}</div>}
        {transcriptData && (
          <>
            <div className="video-info">
              <h2>{transcriptData.title}</h2>
            </div>
            <div className="action-buttons">
              <button
                className={`reconstruct-button ${isReconstructing ? 'active' : ''}`}
                disabled={aiLoading}
                onClick={() => openModal('reconstruct')}
              >
                <span className="button-icon">✨</span>
                <span className="button-text">
                  {isReconstructing ? aiProgress : 'Reconstruct'}
                </span>
              </button>
              <button
                className={`summarize-button ${isSummarizing ? 'active' : ''}`}
                disabled={aiLoading}
                onClick={() => openModal('summarize')}
              >
                <span className="button-icon">📝</span>
                <span className="button-text">
                  {isSummarizing ? aiProgress : 'Summarize'}
                </span>
              </button>
            </div>
            {reconstructedText && (
              <TranscriptPanel
                transcript={reconstructedText}
                title="Reconstructed Transcript"
              />
            )}
            {summaryText && (
              <SummaryPanel
                summary={summaryText}
                onTranslateModeChange={handleTranslateModeChange}
                currentLang={currentLang}
              />
            )}
            {(reconstructedText || summaryText) && (
              <ExportButtons
                reconstructedText={reconstructedText}
                summaryText={summaryText}
                videoTitle={transcriptData.title}
              />
            )}
          </>
        )}
        {/* Language Choice Modal */}
        {modalOpen && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Choose mode</h3>
                <button className="modal-close" onClick={closeModal} title="Cancel">
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <button className="modal-choice-btn" onClick={() => handleModalChoice('original')}>
                  <span className="modal-choice-icon">
                    🌐
                  </span>
                  <div className="modal-choice-text">
                    <strong>Original</strong>
                    <span>Keep transcript language</span>
                  </div>
                </button>
                <button
                  className="modal-choice-btn modal-choice-translate"
                  onClick={() => handleModalChoice('translate')}
                >
                  <span className="modal-choice-icon">
                    🌍
                  </span>
                  <div className="modal-choice-text">
                    <strong>Translate to Polish</strong>
                    <span>PL: English → Polish</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <DemoNoticeModal />
      <footer className="app-footer">
        <p>Built with ❤️ by {BUILD_INFO.author}</p>
      </footer>
    </div>
  );
}