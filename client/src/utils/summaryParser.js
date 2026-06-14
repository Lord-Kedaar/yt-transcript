/**
 * Parse Bielik-style summary text into an intro and semantic sections.
 *
 * Supported section headers:
 * - `1) Header: paragraph`
 * - `1. Header: paragraph`
 * - `**Header:** paragraph`
 * - `1) **Header:** paragraph`
 * - `- **Header:** paragraph`
 *
 * Handles the pathological Bielik case where multiple numbered sections are
 * returned on one physical line: `1) A: ... 2) B: ...`.
 */

function normalizeSummaryText(rawText = '') {
  return (
    String(rawText)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim()
      // Split inline numbered sections before parsing, without touching decimals.
      .replace(/([^\n])\s+((?:\d+[.)])\s+(?:\*\*[^*\n]{1,120}:\*\*|[^:\n]{2,120}:))/g, '$1\n$2')
  );
}

function stripListPrefix(line) {
  return line.replace(/^[-*]\s+/, '').trim();
}

function parseHeaderLine(line) {
  const trimmed = line.trim();

  // Numbered or bold section headers are accepted. Plain unnumbered `Foo:` is
  // intentionally NOT accepted, because intro paragraphs often contain colons.
  const match = trimmed.match(
    /^(?:[-*]\s+)?(?:(\d+)[.)]\s*)?(?:\*\*([^*\n]{1,120}?):\*\*|([^:\n]{2,120}?):)\s*(.*)$/,
  );
  if (!match) return null;

  const [, numberPrefix, boldHeader, plainHeader, rest = ''] = match;
  const hasBoldHeader = Boolean(boldHeader);
  const hasNumberPrefix = Boolean(numberPrefix);

  if (!hasBoldHeader && !hasNumberPrefix) return null;

  return {
    header: (boldHeader || plainHeader || '').trim().replace(/\*\*/g, ''),
    rest: rest.trim(),
  };
}

export function parseSummarySections(rawText = '') {
  const normalized = normalizeSummaryText(rawText);
  if (!normalized) return { intro: '', sections: [] };

  const lines = normalized
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const introParts = [];
  const sections = [];
  let currentSection = null;

  for (const rawLine of lines) {
    const header = parseHeaderLine(rawLine);

    if (header) {
      if (currentSection) sections.push(currentSection);
      currentSection = { header: header.header, paragraphs: [] };
      if (header.rest) currentSection.paragraphs.push(stripListPrefix(header.rest));
      continue;
    }

    const content = stripListPrefix(rawLine);
    if (currentSection) {
      currentSection.paragraphs.push(content);
    } else {
      introParts.push(content);
    }
  }

  if (currentSection) sections.push(currentSection);

  return {
    intro: introParts.join(' ').trim(),
    sections,
  };
}

export function parseInlineMarkdown(str = '') {
  const text = String(str);
  const parts = [];
  const pattern = /(\*\*([^*]+?)\*\*)|(\*([^*]+?)\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2] != null) {
      parts.push({ type: 'strong', content: match[2] });
    } else if (match[4] != null) {
      parts.push({ type: 'em', content: match[4] });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
