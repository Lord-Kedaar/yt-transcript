/**
 * PDF export utilities for ytTranscript.
 *
 * Root cause addressed: do not render one tall canvas and reuse it with
 * negative Y offsets. Instead, paginate block-level DOM first, render one
 * white A4 canvas per page, then add each page image at (0, 0) in jsPDF.
 * This preserves Polish glyphs because text is rasterized by the browser,
 * while avoiding page-boundary text cuts/duplication.
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { parseSummarySections } from './summaryParser.js';

export const PDF_PAGE = {
  widthMm: 210,
  heightMm: 297,
  widthPx: 794,
  heightPx: 1123,
  paddingTopPx: 56,
  paddingRightPx: 64,
  paddingBottomPx: 64,
  paddingLeftPx: 64,
};

export function stripMarkdown(text) {
  return String(text)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\*+/g, '');
}

export function summaryToPdfBlocks(rawText) {
  const blocks = [];
  const { intro, sections } = parseSummarySections(rawText);

  if (intro?.trim()) {
    blocks.push({ type: 'intro', text: stripMarkdown(intro.trim()) });
  }

  for (const section of sections) {
    if (section.header?.trim()) {
      blocks.push({ type: 'sectionHeader', text: stripMarkdown(section.header.trim()) });
    }
    for (const para of section.paragraphs || []) {
      if (para?.trim()) {
        blocks.push({ type: 'paragraph', text: stripMarkdown(para.trim()) });
      }
    }
  }

  return blocks;
}

export function reconstructedToPdfBlocks(text) {
  return String(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: 'paragraph', text: stripMarkdown(p) }));
}

export function paginateMeasuredBlocks(blocks, { availableHeight }) {
  if (!blocks.length) return [];

  const pages = [];
  let currentPage = [];
  let currentHeight = 0;

  for (const block of blocks) {
    const height = Number(block.height) || 0;

    if (height > availableHeight) {
      if (currentPage.length) {
        pages.push(currentPage);
        currentPage = [];
        currentHeight = 0;
      }
      pages.push([block]);
      continue;
    }

    if (currentPage.length && currentHeight + height > availableHeight) {
      pages.push(currentPage);
      currentPage = [block];
      currentHeight = height;
      continue;
    }

    currentPage.push(block);
    currentHeight += height;
  }

  if (currentPage.length) pages.push(currentPage);
  return pages;
}

function blockClass(type) {
  if (type === 'sectionHeader') return 'pdf-block pdf-section-header';
  if (type === 'intro') return 'pdf-block pdf-intro';
  return 'pdf-block pdf-paragraph';
}

function applyContainerStyles(node) {
  node.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    `width:${PDF_PAGE.widthPx}px`,
    'background:#ffffff',
    'color:#111827',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
    'font-size:15px',
    'line-height:1.55',
    'box-sizing:border-box',
    'z-index:-1',
  ].join(';');
}

function applyPageStyles(node) {
  node.style.cssText = [
    `width:${PDF_PAGE.widthPx}px`,
    `min-height:${PDF_PAGE.heightPx}px`,
    `padding:${PDF_PAGE.paddingTopPx}px ${PDF_PAGE.paddingRightPx}px ${PDF_PAGE.paddingBottomPx}px ${PDF_PAGE.paddingLeftPx}px`,
    'background:#ffffff',
    'color:#111827',
    'box-sizing:border-box',
    'overflow:hidden',
  ].join(';');
}

function createBlockElement(block, index) {
  const tag = block.type === 'sectionHeader' ? 'h3' : 'p';
  const el = document.createElement(tag);
  el.className = blockClass(block.type);
  el.dataset.pdfBlockIndex = String(index);
  el.textContent = block.text || '';

  if (block.type === 'sectionHeader') {
    el.style.cssText = 'font-size:16px;font-weight:700;line-height:1.35;margin:18px 0 8px 0;color:#111827;break-after:avoid;';
  } else if (block.type === 'intro') {
    el.style.cssText = 'font-size:15px;line-height:1.6;font-style:italic;color:#374151;border-left:4px solid #6366f1;padding-left:12px;margin:0 0 18px 0;';
  } else {
    el.style.cssText = 'font-size:15px;line-height:1.6;margin:0 0 12px 0;color:#111827;';
  }

  return el;
}

function createMeasureDom(blocks) {
  const container = document.createElement('div');
  applyContainerStyles(container);
  container.style.height = 'auto';
  container.style.padding = `${PDF_PAGE.paddingTopPx}px ${PDF_PAGE.paddingRightPx}px ${PDF_PAGE.paddingBottomPx}px ${PDF_PAGE.paddingLeftPx}px`;

  blocks.forEach((block, index) => {
    container.appendChild(createBlockElement(block, index));
  });

  return container;
}

function getOuterHeight(el) {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  const marginTop = parseFloat(style.marginTop) || 0;
  const marginBottom = parseFloat(style.marginBottom) || 0;
  return rect.height + marginTop + marginBottom;
}

function measureBlocks(blocks) {
  const measureDom = createMeasureDom(blocks);
  document.body.appendChild(measureDom);
  void measureDom.offsetHeight;

  const measured = blocks.map((block, index) => {
    const el = measureDom.querySelector(`[data-pdf-block-index="${index}"]`);
    return { ...block, height: el ? getOuterHeight(el) : 24 };
  });

  document.body.removeChild(measureDom);
  return measured;
}

function createPageDom(pageBlocks, pageIndex, title) {
  const page = document.createElement('div');
  applyPageStyles(page);

  const titleEl = document.createElement(pageIndex === 0 ? 'h1' : 'div');
  titleEl.textContent = title;
  titleEl.style.cssText = pageIndex === 0
    ? 'font-size:20px;line-height:1.2;font-weight:700;text-align:center;margin:0 0 24px 0;color:#111827;'
    : 'font-size:12px;line-height:1.2;text-align:center;margin:0 0 18px 0;color:#6b7280;';
  page.appendChild(titleEl);

  pageBlocks.forEach((block, index) => {
    page.appendChild(createBlockElement(block, index));
  });

  return page;
}

async function renderPageToCanvas(pageDom) {
  document.body.appendChild(pageDom);
  try {
    return await html2canvas(pageDom, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      width: PDF_PAGE.widthPx,
      height: PDF_PAGE.heightPx,
      windowWidth: PDF_PAGE.widthPx,
      windowHeight: PDF_PAGE.heightPx,
    });
  } finally {
    document.body.removeChild(pageDom);
  }
}

function downloadPdfBlob(pdf, filename) {
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportBlocksToPdf({ title, filename, blocks }) {
  if (!blocks?.length) return;

  const measured = measureBlocks(blocks);
  const titleReserve = 64;
  const availableHeight = PDF_PAGE.heightPx - PDF_PAGE.paddingTopPx - PDF_PAGE.paddingBottomPx - titleReserve;
  const pages = paginateMeasuredBlocks(measured, { availableHeight });

  const pdf = new jsPDF('p', 'mm', 'a4');

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    if (pageIndex > 0) pdf.addPage();
    const pageDom = createPageDom(pages[pageIndex], pageIndex, title);
    const canvas = await renderPageToCanvas(pageDom);
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, PDF_PAGE.widthMm, PDF_PAGE.heightMm);
  }

  downloadPdfBlob(pdf, filename);
}
