export default function Header() {
  return (
    <header className="app-header">
      <div className="logo-container">
        <svg className="logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
          <path d="M8 10l4 3-4 3v-6z"/>
        </svg>
        <h1 className="logo-text">ytTranscript</h1>
      </div>
      <p className="header-subtitle">Extract transcripts from any YouTube video</p>
    </header>
  );
}
