import { useState, useRef } from 'react';
import { reconstructedToPdfBlocks, exportBlocksToPdf } from '../utils/pdfExport.js';
import { useTTS } from '../hooks/useTTS.js';

export default function ReconstructedPanel({ text, lang }) {
  const [copied, setCopied] = useState(false);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const saveMenuRef = useRef(null);
  const tts = useTTS({ initialText: text, lang: lang || 'pl', type: 'reconstruction' });

  async function handleSpeak() {
    try {
      setIsSpeaking(true);
      await tts.speak();
    } catch (e) {
      console.error('Speak error:', e);
    } finally {
      setIsSpeaking(false);
    }
  }

  function downloadTxt() {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reconstructed.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowSaveMenu(false);
  }

  function downloadMd() {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reconstructed.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowSaveMenu(false);
  }

  async function downloadPdf() {
    await exportBlocksToPdf({
      title: 'Reconstructed Transcript',
      filename: 'reconstructed.pdf',
      blocks: reconstructedToPdfBlocks(text),
    });
    setShowSaveMenu(false);
  }

  function handleCopy() {
    const copyFallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } finally {
        document.body.removeChild(ta);
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(copyFallback);
    } else {
      copyFallback();
    }
  }

  // Split text into paragraphs by double newlines or triple+ newlines
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim());

  return (
    <div className="reconstructed-panel">
      <div className="panel-header">
        <h3>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Reconstructed Text
        </h3>
        <button className="copy-button" onClick={handleCopy}>
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
        <button
          className="tts-button"
          onClick={handleSpeak}
          title="Read aloud"
          disabled={isSpeaking}
        >
          {isSpeaking ? (
            <span className="spinner-sm" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
            </svg>
          )}
        </button>
        <div className="save-menu-wrapper" ref={saveMenuRef}>
          <button className="save-button" onClick={() => setShowSaveMenu(!showSaveMenu)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
              <polyline points="17 21 17 13 7 13 7 21" />
              <polyline points="7 3 7 8 15 8" />
            </svg>
            Save
          </button>
          {showSaveMenu && (
            <div className="save-menu-dropdown">
              <button onClick={downloadTxt}>💾 TXT</button>
              <button onClick={downloadMd}>📝 MD</button>
              <button onClick={downloadPdf}>📄 PDF</button>
            </div>
          )}
        </div>
      </div>

      <div className="reconstructed-content">
        {paragraphs.map((para, i) => (
          <p key={i} className="reconstructed-paragraph">
            {para.trim()}
          </p>
        ))}
      </div>

      <div className="panel-footer">
        <span>{paragraphs.length} paragraphs</span>
        <span>{text.length.toLocaleString()} characters</span>
      </div>
    </div>
  );
}
