import { useState, useRef } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export default function SummaryPanel({ text }) {
  const [copied, setCopied] = useState(false);
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const saveMenuRef = useRef(null);

  function downloadTxt() {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'summary.txt';
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
    a.download = 'summary.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowSaveMenu(false);
  }

  async function downloadPdf() {
    const el = saveMenuRef.current?.closest('.summary-panel')?.querySelector('.summary-content');
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#0f172a' });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const margin = 15;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 20;
    pdf.setFontSize(16);
    pdf.text('Summary', pageWidth / 2, 12, { align: 'center' });
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
    heightLeft -= (297 - position - margin);
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight + 20;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight);
      heightLeft -= (297 - margin);
    }
    pdf.save('summary.pdf');
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
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(copyFallback);
    } else {
      copyFallback();
    }
  }

  // Parse inline markdown: **bold** and *italic*
  function parseInlineMarkdown(str) {
    const parts = [];
    let idx = 0;
    while (idx < str.length) {
      const boldStart = str.indexOf('**', idx);
      const italicStart = str.indexOf('*', idx);
      const nextSpecial = Math.min(
        boldStart !== -1 ? boldStart : Infinity,
        italicStart !== -1 ? italicStart : Infinity
      );
      if (nextSpecial === Infinity) {
        if (idx < str.length) parts.push(str.slice(idx));
        break;
      }
      // text before
      if (nextSpecial > idx) {
        parts.push(str.slice(idx, nextSpecial));
      }
      if (nextSpecial === boldStart) {
        const boldEnd = str.indexOf('**', boldStart + 2);
        if (boldEnd !== -1) {
          parts.push(<strong key={idx}>{str.slice(boldStart + 2, boldEnd)}</strong>);
          idx = boldEnd + 2;
          continue;
        }
      }
      if (nextSpecial === italicStart) {
        const italicEnd = str.indexOf('*', italicStart + 1);
        if (italicEnd !== -1) {
          parts.push(<em key={idx}>{str.slice(italicStart + 1, italicEnd)}</em>);
          idx = italicEnd + 1;
          continue;
        }
      }
      // fallback: push the char and move on
      parts.push(str[nextSpecial]);
      idx = nextSpecial + 1;
    }
    return parts;
  }

  // Split text: intro (everything before first bullet) + bullets
  const allLines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const firstBulletIdx = allLines.findIndex(line => line.startsWith('- '));

  const introLines = firstBulletIdx > 0 ? allLines.slice(0, firstBulletIdx) : [];
  const bulletLines = firstBulletIdx >= 0 ? allLines.slice(firstBulletIdx).map(line => line.replace(/^- +/, '')) : allLines;

  const introText = introLines.join(' ');

  return (
    <div className="summary-panel">
      <div className="panel-header">
        <h3>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          AI Summary
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
        <div className="save-menu-wrapper" ref={saveMenuRef}>
          <button className="save-button" onClick={() => setShowSaveMenu(!showSaveMenu)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
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

      <div className="summary-content">
        {introText && (
          <div className="summary-intro">{parseInlineMarkdown(introText)}</div>
        )}
        <ul>
          {bulletLines.map((b, i) => (
            <li key={i}>{parseInlineMarkdown(b)}</li>
          ))}
        </ul>
      </div>

      <div className="panel-footer">
        <span>{bulletLines.length} bullet points</span>
        <span>{text.length.toLocaleString()} characters</span>
      </div>
    </div>
  );
}
