import { useState, useEffect } from 'react';

const NOTICE_DISMISSED_KEY = 'ytTranscript.demo_notice_dismissed.v1';

export default function DemoNoticeModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check localStorage — if already dismissed, don't show again (until key is cleared)
    const dismissed = localStorage.getItem(NOTICE_DISMISSED_KEY);
    if (!dismissed) {
      setVisible(true);
    }
  }, []);

  function handleClose() {
    // Persist dismissal in localStorage (survives session resets)
    localStorage.setItem(NOTICE_DISMISSED_KEY, 'true');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="demo-notice-overlay">
      <div className="demo-notice-modal" onClick={e => e.stopPropagation()}>
        <h3>Demo Notice</h3>
        <p className="demo-notice-text">
          This is a demo. Each user gets 6 AI actions per day based on IP address.
          Your IP is stored on the creator&apos;s server for quota tracking only — no personal data.
          Transcript fetching is unlimited and unaffected by the AI daily limit.
        </p>
        <button className="demo-notice-ok" onClick={handleClose}>
          OK, rozumiem
        </button>
      </div>
    </div>
  );
}