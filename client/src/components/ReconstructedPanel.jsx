import { useState } from 'react';

export default function ReconstructedPanel({ text }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Split text into paragraphs by double newlines or triple+ newlines
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim());

  return (
    <div className="reconstructed-panel">
      <div className="panel-header">
        <h3>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          Reconstructed Text
        </h3>
        <button className="copy-button" onClick={handleCopy}>
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </>
          )}
        </button>
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
