import test from 'node:test';
import assert from 'node:assert/strict';
import { contextFor, validateActions, validateSurface, type Surface } from '../src/core/surfaces';
import { formatInstructions, validateDocument, type Document } from '../src/core/model';
import { setLocale } from '../src/core/i18n.mjs';
const point = { id: 'p', kind: 'point' as const, x: 100, y: 100 };
test('PDF and HTML contexts use document units and the most specific element', () => {
  const s: Surface = {
    kind: 'pdf',
    path: '/report.pdf',
    page: 2,
    pageCount: 3,
    boxes: [
      { x: 80, y: 90, width: 100, height: 20, text: 'Revenue 12 percent' },
      { x: 80, y: 140, width: 100, height: 20, text: 'Other line' },
    ],
  };
  assert.equal(contextFor(s, point), 'Revenue 12 percent');
  const html: Surface = {
    kind: 'html',
    path: '/page.html',
    page: 1,
    boxes: [
      { x: 0, y: 0, width: 1000, height: 1000, text: 'Whole page', selector: 'body' },
      { x: 60, y: 60, width: 300, height: 200, text: 'Card', selector: '.card' },
      { x: 80, y: 90, width: 100, height: 20, text: 'Buy now', selector: '#buy' },
    ],
  };
  assert.match(contextFor(html, point), /#buy "Buy now"/);
  assert.match(
    contextFor(html, { id: 'r', kind: 'rect', x: 60, y: 60, width: 300, height: 200 }),
    /^\.card/,
  );
  assert.throws(() => validateActions([{ kind: 'key', key: 'F12' }]));
  assert.throws(() => validateActions([{ kind: 'click', x: -1, y: 0 }]));
  assert.throws(() => validateSurface({ ...s, boxes: [{ ...s.boxes[0], x: Infinity }] }));
});
test('schema 4 source instructions target original PDF/HTML/project, preserving earlier image schemas', () => {
  const doc: Document = {
    schemaVersion: 4,
    id: 'd',
    name: 'Report.pdf',
    referencePath: '/cache/page.png',
    width: 612,
    height: 792,
    createdAt: '',
    updatedAt: '',
    globalInstruction: '',
    notes: [{ id: 'n', text: 'Change to 15 percent', targets: [point] }],
    surface: {
      kind: 'pdf',
      path: '/source/report.pdf',
      page: 2,
      pageCount: 2,
      boxes: [{ x: 80, y: 90, width: 100, height: 20, text: 'Revenue 12 percent' }],
    },
  };
  try {
    setLocale('en');
    validateDocument(doc);
    let out = formatInstructions(doc);
    assert.match(out, /PDF page 2 of 2/);
    assert.match(out, /points \(1\/72 inch\)/);
    assert.match(out, /Text under the mark: Revenue/);
    assert.match(out, /regenerate the PDF/);
    assert.match(out, /Source to edit: \/source\/report.pdf/);
    doc.surface = {
      kind: 'webapp',
      path: 'http://localhost:3000/settings',
      page: 3,
      actions: [{ kind: 'key', key: 'ArrowRight' }],
      boxes: [{ x: 80, y: 90, width: 100, height: 20, text: 'Save', selector: '#save' }],
    };
    out = formatInstructions(doc);
    assert.match(out, /CSS px/);
    assert.match(out, /ArrowRight/);
    assert.match(out, /#save/);
    assert.match(out, /not build output/);
    const legacy = { ...doc, schemaVersion: 3 as const };
    delete legacy.surface;
    validateDocument(legacy);
    assert.match(formatInstructions(legacy), /Image name:/);
  } finally {
    setLocale('ko');
  }
});
