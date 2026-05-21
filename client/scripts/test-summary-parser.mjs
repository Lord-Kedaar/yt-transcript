#!/usr/bin/env node
import assert from 'node:assert/strict';
import { parseSummarySections, parseInlineMarkdown } from '../src/utils/summaryParser.js';

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test('splits same-line numbered Bielik sections into separate sections', () => {
  const raw = '1) Wprowadzenie: Tekst wprowadzenia. 2) Ateizm: Tekst o ateizmie.';
  const result = parseSummarySections(raw);

  assert.equal(result.intro, '');
  assert.equal(result.sections.length, 2);
  assert.equal(result.sections[0].header, 'Wprowadzenie');
  assert.deepEqual(result.sections[0].paragraphs, ['Tekst wprowadzenia.']);
  assert.equal(result.sections[1].header, 'Ateizm');
  assert.deepEqual(result.sections[1].paragraphs, ['Tekst o ateizmie.']);
});

test('parses bold markdown headers with inline paragraph', () => {
  const raw = '**Ateizm:** Tekst o ateizmie.\n**Teizm:** Tekst o teizmie.';
  const result = parseSummarySections(raw);

  assert.equal(result.sections.length, 2);
  assert.equal(result.sections[0].header, 'Ateizm');
  assert.deepEqual(result.sections[0].paragraphs, ['Tekst o ateizmie.']);
  assert.equal(result.sections[1].header, 'Teizm');
  assert.deepEqual(result.sections[1].paragraphs, ['Tekst o teizmie.']);
});

test('parses numbered bold headers', () => {
  const raw = '1) **Wprowadzenie:** Tekst.\n2) **Ateizm:** Drugi tekst.';
  const result = parseSummarySections(raw);

  assert.equal(result.sections.length, 2);
  assert.equal(result.sections[0].header, 'Wprowadzenie');
  assert.deepEqual(result.sections[0].paragraphs, ['Tekst.']);
  assert.equal(result.sections[1].header, 'Ateizm');
  assert.deepEqual(result.sections[1].paragraphs, ['Drugi tekst.']);
});

test('captures intro text before first section', () => {
  const raw = 'To jest wstęp do filmu. Autor omawia tematykę.\n\n1) Wprowadzenie: Pierwszy punkt.\n2) Ateizm: Drugi punkt.';
  const result = parseSummarySections(raw);

  assert.equal(result.intro, 'To jest wstęp do filmu. Autor omawia tematykę.');
  assert.equal(result.sections.length, 2);
});

test('treats bullet before first header as intro, not as markdown artifact', () => {
  const raw = '- To jest wstęp do filmu.\n\n1) Wprowadzenie: Pierwszy punkt.';
  const result = parseSummarySections(raw);

  assert.equal(result.intro, 'To jest wstęp do filmu.');
  assert.equal(result.sections.length, 1);
});

test('keeps multiple paragraphs inside one section', () => {
  const raw = '1) Wstęp: Pierwszy akapit.\nDrugi akapit w sekcji.';
  const result = parseSummarySections(raw);

  assert.equal(result.sections.length, 1);
  assert.deepEqual(result.sections[0].paragraphs, ['Pierwszy akapit.', 'Drugi akapit w sekcji.']);
});

test('handles text with no section headers as intro', () => {
  const result = parseSummarySections('To jest zwykły tekst bez nagłówków.');

  assert.equal(result.intro, 'To jest zwykły tekst bez nagłówków.');
  assert.deepEqual(result.sections, []);
});

test('parses inline markdown markers into typed parts', () => {
  assert.deepEqual(parseInlineMarkdown('Hello **world** and *term*'), [
    'Hello ',
    { type: 'strong', content: 'world' },
    ' and ',
    { type: 'em', content: 'term' },
  ]);
});

test('returns no parts for empty inline markdown input', () => {
  assert.deepEqual(parseInlineMarkdown(''), []);
});

console.log('summaryParser: all tests passed');
