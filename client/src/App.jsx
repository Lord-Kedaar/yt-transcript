import { useState, useRef, useEffect } from 'react';
import './styles/main.css';
import Header from './components/Header';
import UrlInput from './components/UrlInput';
import TranscriptPanel from './components/TranscriptPanel';
import ReconstructedPanel from './components/ReconstructedPanel';
import SummaryPanel from './components/SummaryPanel';
import ExportButtons from './components/ExportButtons';
import { BUILD_INFO } from './buildInfo.js';
import { useTTS } from './hooks/useTTS.js';

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
  const [isReadingRaw, setIsReadingRaw] = useState(false);
  const rawTts = useTTS({ text: '', lang: 'en' });

  // Keep rawTTS text in sync with transcriptData
  useEffect(() => {
    if (transcriptData) {
      rawTts.text = transcriptData.snippets.map(s => s.text).join(' ');
    }
  }, [transcriptData]);

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
    if (!saved) return;

    if (typeof saved.url === 'string') setUrl(saved.url);
    if (saved.transcriptData) setTranscriptData(saved.transcriptData);
    if (typeof saved.reconstructedText === 'string') setReconstructedText(saved.reconstructedText);
    if (typeof saved.summaryText === 'string') setSummaryText(saved.summaryText);
    if (typeof saved.currentLang === 'string') setCurrentLang(saved.currentLang);

    if (saved.pendingTransform && saved.transcriptData) {
      pendingTransformRef.current = saved.pendingTransform;
      aiStartedAtRef.current = saved.pendingTransform.startedAt || Date.now();
      resumeInFlightRef.current = true;
      setAiLoading(true);
      setAiProgress(formatAiProgress(saved.pendingTransform.type, aiStartedAtRef.current, true));
      queueMicrotask(() => {
        pageSuspendedRef.current = false;
        handleTransform(
          saved.pendingTransform.type,
          saved.pendingTransform.mode || 'original',
          saved.transcriptData,
          {
            resume: true,
            startedAt: aiStartedAtRef.current,
          },
        );
      });
    }
  }, []);

  useEffect(() => {
    const maybeResume = () => {
      const saved = loadUiState();
      if (!saved || !saved.pendingTransform || !saved.transcriptData) return;
      if (aiLoading || resumeInFlightRef.current) return;

      pendingTransformRef.current = saved.pendingTransform;
      aiStartedAtRef.current = saved.pendingTransform.startedAt || Date.now();
      resumeInFlightRef.current = true;
      pageSuspendedRef.current = false;
      setAiLoading(true);
      setAiProgress(formatAiProgress(saved.pendingTransform.type, aiStartedAtRef.current, true));
      handleTransform(
        saved.pendingTransform.type,
        saved.pendingTransform.mode || 'original',
        saved.transcriptData,
        {
          resume: true,
          startedAt: aiStartedAtRef.current,
        },
      );
    };

    const onPageHide = () => {
      if (!aiLoading || !pendingTransformRef.current) return;
      pageSuspendedRef.current = true;
      exportUiState({
        url,
        transcriptData,
        reconstructedText,
        summaryText,
        currentLang,
        pendingTransform: pendingTransformRef.current,
      });
    };

    const onPageShow = () => {
      maybeResume();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (aiLoading && pendingTransformRef.current) {
          pageSuspendedRef.current = true;
          exportUiState({
            url,
            transcriptData,
            reconstructedText,
            summaryText,
            currentLang,
            pendingTransform: pendingTransformRef.current,
          });
        }
        return;
      }
      maybeResume();
    };

    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [aiLoading, currentLang, reconstructedText, summaryText, transcriptData, url]);

  useEffect(() => {
    document.body.style.overflow = modalOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [modalOpen]);

  async function handleFetch() {
    if (!url.trim()) return;

    setLoading(true);
    setError('');
    setTranscriptData(null);
    setReconstructedText('');
    setSummaryText('');
    setAiProgress('');
    resumeInFlightRef.current = false;

    try {
      const res = await fetch(`${API_URL}?url=${encodeURIComponent(url.trim())}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch transcript');
      }

      setTranscriptData(data);
      pendingTransformRef.current = null;
      aiStartedAtRef.current = null;
      exportUiState({
        url: url.trim(),
        transcriptData: data,
        reconstructedText: '',
        summaryText: '',
        currentLang,
        pendingTransform: null,
      });
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
    // Capture modalAction before closeModal() resets it
    const action = modalAction;
    closeModal();
    if (!action) return;
    setCurrentLang(mode === 'translate' ? 'pl' : 'en');
    await handleTransform(action, mode);
  }

  async function handleTransform(
    type,
    mode = 'original',
    sourceTranscript = transcriptData,
    options = {},
  ) {
    if (!sourceTranscript) return;

    const { resume = false, startedAt = Date.now() } = options;

    // Cancel any previous request
    if (aiAbortRef.current) {
      aiAbortRef.current.abort();
    }
    const controller = new AbortController();
    aiAbortRef.current = controller;

    const pendingTransform = {
      type,
      mode,
      startedAt,
    };
    pendingTransformRef.current = pendingTransform;
    aiStartedAtRef.current = startedAt;
    pageSuspendedRef.current = false;

    setAiLoading(true);
    setError('');
    setAiProgress(formatAiProgress(type, startedAt, resume));

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    timerRef.current = setInterval(() => {
      setAiProgress(formatAiProgress(type, aiStartedAtRef.current, pageSuspendedRef.current));
    }, 1000);

    exportUiState({
      url,
      transcriptData: sourceTranscript,
      reconstructedText,
      summaryText,
      currentLang,
      pendingTransform,
    });

    let completed = false;

    try {
      const res = await fetch(TRANSFORM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snippets: sourceTranscript.snippets,
          type,
          mode,
          title: sourceTranscript?.title || '',
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

      completed = true;
      pendingTransformRef.current = null;
      aiStartedAtRef.current = null;
      exportUiState({
        url,
        transcriptData: sourceTranscript,
        reconstructedText: type === 'reconstruct' ? data.reconstructed : '',
        summaryText: type === 'summarize' ? data.summary : '',
        currentLang,
        pendingTransform: null,
      });
    } catch (err) {
      if (err.name === 'AbortError' && pageSuspendedRef.current) {
        // Safari may suspend or abort the request in the background; keep the pending task and resume later.
        return;
      }
      if (err.name === 'AbortError') {
        console.log('Transform aborted');
        setError(`${type === 'reconstruct' ? 'Reconstruction' : 'Summarization'} cancelled`);
      } else {
        setError(err.message || 'Transformation failed');
      }
      if (!pageSuspendedRef.current) {
        pendingTransformRef.current = null;
      }
    } finally {
      setAiLoading(false);
      if (timerRef.current) clearInterval(timerRef.current);
      setAiProgress('');
      aiAbortRef.current = null;
      resumeInFlightRef.current = false;

      if (!pageSuspendedRef.current && !completed) {
        exportUiState({
          url,
          transcriptData: sourceTranscript,
          reconstructedText,
          summaryText,
          currentLang,
          pendingTransform: null,
        });
      }
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

    pendingTransformRef.current = null;
    aiStartedAtRef.current = null;
    pageSuspendedRef.current = false;
    resumeInFlightRef.current = false;

    setAiLoading(false);
    setUrl('');
    setError('');
    setTranscriptData(null);
    setReconstructedText('');
    setSummaryText('');
    setAiProgress('');
    setIsReadingRaw(false);
    clearUiState();
  }

  async function handleReadRaw() {
    if (!rawTts.text) return;
    setIsReadingRaw(true);
    try {
      await rawTts.speak();
    } catch (e) {
      console.error('Read aloud error:', e);
    } finally {
      setIsReadingRaw(false);
    }
  }

  const isReconstructing = aiLoading && pendingTransformRef.current?.type === 'reconstruct';
  const isSummarizing = aiLoading && pendingTransformRef.current?.type === 'summarize';

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
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                New Transcript
              </button>
            </div>

            <div className="video-info">
              <h2>{transcriptData.title}</h2>
            </div>

            {/* Transcript card — actions above content */}
            <div className="transcript-card">
              <div className="transcript-card-header">
                <h3>Transcript</h3>
                <span className="transcript-meta">
                  {transcriptData.snippets.length} segments ·{' '}
                  {transcriptData.snippets
                    .map(s => s.text)
                    .join(' ')
                    .length.toLocaleString()}{' '}
                  chars
                </span>
              </div>

              {/* Action bar above transcript content */}
              <div className="transcript-action-bar">
                <button
                  className="action-btn action-btn-ai"
                  onClick={() => openModal('reconstruct')}
                  disabled={aiLoading}
                >
                  {isReconstructing ? (
                    <>
                      <span className="spinner-sm" />
                      Reconstructing…
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v4m0 12v4m-7.05-13.95l2.83 2.83m8.84 8.84l2.83 2.83M2 12h4m12 0h4M4.22 4.22l2.83 2.83m8.84 8.84l2.83 2.83" />
                      </svg>
                      Reconstruct with AI
                    </>
                  )}
                </button>
                <button
                  className="action-btn action-btn-ai"
                  onClick={() => openModal('summarize')}
                  disabled={aiLoading}
                >
                  {isSummarizing ? (
                    <>
                      <span className="spinner-sm" />
                      Summarizing…
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                      Summarize with AI
                    </>
                  )}
                </button>
                <button className="action-btn" onClick={handleReadRaw} disabled={isReadingRaw}>
                  {isReadingRaw ? (
                    <>
                      <span className="spinner-sm" />
                      Playing…
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 5L6 9H2v6h4l5 4V5z" />
                        <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                      </svg>
                      Read aloud
                    </>
                  )}
                </button>
                <ExportButtons snippets={transcriptData.snippets} />
              </div>

              {aiProgress && (
                <div className="reconstruct-progress" aria-live="polite">
                  <div className="reconstruct-progress-text">
                    <span className="reconstruct-progress-badge" />
                    <span>{aiProgress}</span>
                    <span className="reconstruct-progress-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                  </div>
                  <div className="reconstruct-progress-track" aria-hidden="true">
                    <div className="reconstruct-progress-fill" />
                  </div>
                </div>
              )}

              <TranscriptPanel snippets={transcriptData.snippets} />
            </div>

            {reconstructedText && (
              <ReconstructedPanel text={reconstructedText} lang={currentLang} />
            )}
            {summaryText && <SummaryPanel text={summaryText} lang={currentLang} />}
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
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Choose Language</h3>
              <button className="modal-close" onClick={closeModal} title="Cancel">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <button className="modal-choice-btn" onClick={() => handleModalChoice('original')}>
                <span className="modal-choice-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20v-8m0 0V4m0 8h8m-8 0H4" />
                  </svg>
                </span>
                <div className="modal-choice-text">
                  <strong>Keep original language</strong>
                  <span>
                    {modalAction === 'summarize'
                      ? 'Summarize in the language of the transcript'
                      : 'Reconstruct in the language of the transcript'}
                  </span>
                </div>
              </button>
              <button
                className="modal-choice-btn modal-choice-translate"
                onClick={() => handleModalChoice('translate')}
              >
                <span className="modal-choice-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 5h20M2 12h10M2 19h7" />
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
