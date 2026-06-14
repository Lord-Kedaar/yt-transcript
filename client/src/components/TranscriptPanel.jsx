import { useState, useRef, useEffect } from 'react';

export default function TranscriptPanel({ snippets }) {
  const [highlightedIndex, setHighlightedIndex] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    setHighlightedIndex(null);
  }, [snippets]);

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  return (
    <div className="transcript-container">
      <div className="transcript-header">
        <h3>Transcript</h3>
        <span className="snippet-count">{snippets.length} segments</span>
      </div>

      <div
        ref={panelRef}
        className="transcript-panel"
        onScroll={e => {
          const el = e.target;
          const scrollPercent = el.scrollTop / (el.scrollHeight - el.clientHeight);
          document.dispatchEvent(
            new CustomEvent('scroll-percent', {
              detail: scrollPercent,
            }),
          );
        }}
      >
        <div className="transcript-content">
          {snippets.map((snippet, index) => (
            <div
              key={index}
              className={`transcript-segment ${highlightedIndex === index ? 'active' : ''}`}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => setHighlightedIndex(highlightedIndex === index ? null : index)}
            >
              <span className="timestamp">{formatTime(snippet.start)}</span>
              <span className="segment-text">{snippet.text}</span>
            </div>
          ))}
        </div>
      </div>

      {highlightedIndex !== null && (
        <div className="transcript-footer">
          <span>
            Highlighted: &ldquo;{snippets[highlightedIndex]?.text?.slice(0, 60)}
            {snippets[highlightedIndex]?.text?.length > 60 ? '...' : ''}&rdquo;
          </span>
        </div>
      )}
    </div>
  );
}
