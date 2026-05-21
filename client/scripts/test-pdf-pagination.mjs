#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  paginateMeasuredBlocks,
  summaryToPdfBlocks,
  reconstructedToPdfBlocks,
  stripMarkdown,
} from '../src/utils/pdfExport.js';

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test('paginateMeasuredBlocks moves overflowing block to next page without duplication', () => {
  const blocks = [
    { id: 'a', height: 40 },
    { id: 'b', height: 50 },
    { id: 'c', height: 30 },
  ];

  const pages = paginateMeasuredBlocks(blocks, { availableHeight: 100 });

  assert.deepEqual(pages.map((page) => page.map((block) => block.id)), [
    ['a', 'b'],
    ['c'],
  ]);
  assert.deepEqual(pages.flat().map((block) => block.id), ['a', 'b', 'c']);
});

test('paginateMeasuredBlocks keeps over-tall single block once instead of looping', () => {
  const blocks = [
    { id: 'huge', height: 180 },
    { id: 'next', height: 30 },
  ];

  const pages = paginateMeasuredBlocks(blocks, { availableHeight: 100 });

  assert.deepEqual(pages.map((page) => page.map((block) => block.id)), [
    ['huge'],
    ['next'],
  ]);
});

test('summaryToPdfBlocks creates intro, section headers, and paragraphs from Bielik summary', () => {
  const raw = 'Wstęp filmu.\n\n1) Wprowadzenie: Pierwszy akapit. 2) Energia: Drugi akapit.';
  const blocks = summaryToPdfBlocks(raw);

  assert.deepEqual(blocks.map((block) => block.type), [
    'intro',
    'sectionHeader',
    'paragraph',
    'sectionHeader',
    'paragraph',
  ]);
  assert.equal(blocks[1].text, 'Wprowadzenie');
  assert.equal(blocks[3].text, 'Energia');
});

test('reconstructedToPdfBlocks splits paragraphs on blank lines', () => {
  const blocks = reconstructedToPdfBlocks('Akapit 1.\n\nAkapit 2.');

  assert.deepEqual(blocks, [
    { type: 'paragraph', text: 'Akapit 1.' },
    { type: 'paragraph', text: 'Akapit 2.' },
  ]);
});

test('stripMarkdown removes emphasis markers without losing Polish characters', () => {
  assert.equal(stripMarkdown('**Zażółć** *gęślą* jaźń'), 'Zażółć gęślą jaźń');
});

console.log('pdf pagination: all tests passed');
