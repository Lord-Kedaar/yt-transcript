import { exportToTXT, exportToSRT } from '../api';

export default function ExportButtons({ snippets }) {
  function handleTXT() {
    exportToTXT(snippets);
  }

  function handleSRT() {
    exportToSRT(snippets);
  }

  return (
    <div className="export-bar">
      <span className="export-label">Export as:</span>
      <button 
        className="export-button" 
        onClick={handleTXT}
        title="Download as plain text"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        TXT
      </button>
      <button 
        className="export-button" 
        onClick={handleSRT}
        title="Download as subtitle file"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.5M3 12h.5M3 18h.5"/>
        </svg>
        SRT
      </button>
    </div>
  );
}
