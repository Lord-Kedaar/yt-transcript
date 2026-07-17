import { useState, useEffect } from 'react';

const NOTICE_DISMISSED_KEY = 'ytTranscript.demo_notice_dismissed.v1';
const IP_HASH_KEY = 'ytTranscript.ip_hash.v1';

// Simple hash function for IP address (client-side)
async function hashString(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 16); // Shorten to 16 chars for display
}

// Get IP hash from localStorage or fetch fresh
async function getIpHash() {
  // Try to get from localStorage first (may throw in Safari Private mode)
  try {
    const cached = localStorage.getItem(IP_HASH_KEY);
    if (cached) return cached;
  } catch {
    // localStorage unavailable — proceed to fetch fresh
  }

  try {
    // Fetch IP from a public service
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    const ip = data.ip;
    const hash = await hashString(ip);
    try {
      localStorage.setItem(IP_HASH_KEY, hash);
    } catch {
      // localStorage unavailable — skip caching
    }
    return hash;
  } catch (err) {
    console.warn('Failed to fetch IP hash', err);
    return 'unknown';
  }
}

export default function DemoNoticeModal() {
  const [visible, setVisible] = useState(false);
  const [ipHash, setIpHash] = useState('');

  useEffect(() => {
    // Check localStorage — if already dismissed, don't show again (may throw in Safari Private mode)
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(NOTICE_DISMISSED_KEY) === 'true';
    } catch {
      // localStorage unavailable — show modal anyway
    }

    if (!dismissed) {
      setVisible(true);
      // Fetch IP hash in background (getIpHash already wraps localStorage)
      getIpHash().then(setIpHash).catch(() => setIpHash('unknown'));
    }
  }, []);

  function handleClose() {
    try {
      localStorage.setItem(NOTICE_DISMISSED_KEY, 'true');
    } catch {
      // localStorage unavailable — proceed anyway
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="demo-notice-overlay">
      <div className="demo-notice-modal" onClick={e => e.stopPropagation()}>
        <div className="demo-notice-header">
          <h2>ytTranscript — Demo</h2>
        </div>

        <div className="demo-notice-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </div>

        <div className="demo-notice-content">
          <h3>Demo Notice</h3>
          <p className="demo-notice-text">
            This is a demo. Each user gets 6 AI actions per day based on IP address.
            Your IP is stored on the creator&apos;s server for quota tracking only — no personal data.
            Transcript fetching is unlimited and unaffected by the AI daily limit.
          </p>
        </div>

        <button className="demo-notice-ok" onClick={handleClose}>
          OK
        </button>

        <div className="demo-notice-footer">
          <a href="/privacy" className="demo-notice-link">
            Privacy policy
          </a>
          <span className="demo-notice-separator">•</span>
          <a href="/contact" className="demo-notice-link">
            Contact about unlock
          </a>
        </div>

        <div className="demo-notice-ip">
          IP hash: {ipHash}
        </div>
      </div>
    </div>
  );
}
