import { useState, useEffect } from 'react';

export default function UrlInput({ value, onChange, onFetch, loading }) {
  const [focused, setFocused] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    onFetch();
  }

  return (
    <form className="url-form" onSubmit={handleSubmit}>
      <div className={`input-wrapper ${focused ? 'focused' : ''}`}>
        <svg className="url-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
        </svg>
        <input
          type="text"
          className="url-input"
          placeholder="https://youtube.com/watch?v=..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={loading}
        />
      </div>
      <button 
        type="submit" 
        className={`fetch-button ${loading ? 'loading' : ''}`}
        disabled={loading || !value.trim()}
      >
        {loading ? (
          <>
            <span className="spinner"></span>
            Extracting...
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            Extract Transcript
          </>
        )}
      </button>
    </form>
  );
}
