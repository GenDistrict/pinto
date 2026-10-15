import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  clampPoint,
  fitView,
  formatInstructions,
  instructionCount,
  makeRectangle,
  makeEllipse,
  makeLine,
  makeStroke,
  strokePath,
  moveTarget,
  screenToImage,
  validateDocument,
  zoomAt,
  type Document,
} from '../src/core/model';
import { DocumentStore } from '../src/main/storage';
import { parseLaunchOptions, readLaunchOptions } from '../src/core/arguments';
test('launch paths cannot consume another option and structured relaunch retains duplicate paths', () => {
  assert.throws(() => parseLaunchOptions(['--workspace', '--ready-file', 'reply.json']), /경로/);
  assert.throws(() => parseLaunchOptions(['--image']), /경로/);
  const options = parseLaunchOptions([
    '--workspace',
    'C:\\project',
    '--image',
    'C:\\project\\image.png',
    '--ready-file',
    'C:\\reply.json',
  ]);
  assert.deepEqual(readLaunchOptions(JSON.parse(JSON.stringify(options))), options);
  assert.throws(() => readLaunchOptions({ '--workspace': 42 }), /경로/);
});
const fixture = (): Document => ({
  schemaVersion: 1,
  id: 'doc',
  name: '한글 이미지.png',
  referencePath: 'C:\\작업 폴더\\reference.png',
  width: 1920,
  height: 1080,
  createdAt: '2026-10-15',
  updatedAt: '2026-10-15',
  globalInstruction: '',
  notes: [],
});
test('ellipse and straight line preserve geometry and require schema 3', () => {
  const ellipse = makeEllipse('ellipse', { x: 80, y: 70 }, { x: 10, y: 20 }, 100, 100);
  assert.deepEqual(ellipse, {
    id: 'ellipse',
    kind: 'ellipse',
    x: 10,
    y: 20,
    width: 70,
    height: 50,
  });
  assert.deepEqual(moveTarget(ellipse, 500, 500, 100, 100), { ...ellipse, x: 30, y: 50 });
  const line = makeLine('line', { x: 90, y: 80 }, { x: 20, y: 10 }, 100, 100);
  assert.equal(line.kind, 'line');
  if (line.kind !== 'line') throw new Error('Expected line');
  assert.deepEqual(moveTarget(line, 30, -40, 100, 100), {
    ...line,
    x: 29,
    y: 0,
    start: { x: 99, y: 70 },
    end: { x: 29, y: 0 },
  });
  const doc: Document = {
    ...fixture(),
    schemaVersion: 3,
    notes: [{ id: 'note', text: '도형 수정', targets: [ellipse, line] }],
  };
  validateDocument(doc);
  assert.match(formatInstructions(doc), /타원 영역 \(10, 20, 70, 50\)/);
  assert.match(formatInstructions(doc), /선 \(90, 80\) → \(20, 10\)/);
  assert.throws(() => validateDocument({ ...doc, schemaVersion: 2 }), /버전 3/);
  assert.throws(
    () =>
      validateDocument({
        ...doc,
        notes: [{ id: 'note', text: 'x', targets: [{ ...line, end: { x: 1920, y: 10 } }] }],
      }),
    /좌표/,
  );
});
test('freehand keeps ordered bounded coordinates and moves as one shape', () => {
  const stroke = makeStroke(
    'stroke',
    [
      { x: 10, y: 20 },
      { x: 40, y: 5 },
      { x: 80, y: 60 },
      { x: 10, y: 20 },
    ],
    100,
    80,
  );
  assert.equal(stroke.kind, 'stroke');
  if (stroke.kind !== 'stroke') throw new Error('Expected a stroke');
  assert.equal(strokePath(stroke.points), 'M10 20 L40 5 L80 60 L10 20');
  const moved = moveTarget(stroke, 1000, -1000, 100, 80);
  assert.equal(moved.kind, 'stroke');
  if (moved.kind !== 'stroke') throw new Error('Expected a stroke');
  assert.deepEqual(moved.points, [
    { x: 29, y: 15 },
    { x: 59, y: 0 },
    { x: 99, y: 55 },
    { x: 29, y: 15 },
  ]);
  const dense = makeStroke(
    'dense',
    Array.from({ length: 4096 }, (_, i) => ({ x: i % 100, y: Math.floor(i / 100) })),
    100,
    80,
  );
  assert.equal(dense.kind, 'stroke');
  if (dense.kind === 'stroke') assert.equal(dense.points.length, 128);
  const doc: Document = {
    ...fixture(),
    schemaVersion: 2,
    notes: [{ id: 'note', text: '이 부분을 밝게', targets: [stroke] }],
  };
  validateDocument(doc);
  assert.match(formatInstructions(doc), /자유도형 범위 \(10, 5, 70, 55\)/);
  assert.match(formatInstructions(doc), /경로: M10 20 L40 5 L80 60 L10 20/);
  assert.throws(() => validateDocument({ ...doc, schemaVersion: 1 }), /자유도형/);
  assert.throws(
    () =>
      validateDocument({
        ...doc,
        notes: [
          {
            id: 'note',
            text: 'x',
            targets: [
              {
                ...stroke,
                points: [
                  { x: 1, y: 1 },
                  { x: Infinity, y: 1 },
                ],
              },
            ],
          },
        ],
      }),
    /자유도형/,
  );
});
test('legacy documents retain existing global instructions while upgrading for freehand', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pinto-legacy-'));
  try {
    const store = new DocumentStore(temp);
    await store.init();
    const opened = await store.create('legacy.png', Buffer.from('reference'), 100, 100);
    const file = path.join(path.dirname(opened.document.referencePath), 'annotations.json');
    await writeFile(
      file,
      JSON.stringify({ ...opened.document, schemaVersion: 1, globalInstruction: '기존 지시 유지' }),
    );
    const loaded = await store.load(opened.document.id);
    assert.equal(loaded.document.schemaVersion, 1);
    const updated: Document = {
      ...loaded.document,
      schemaVersion: 2,
      notes: [
        {
          id: 'note',
          text: '선 표시',
          targets: [
            makeStroke(
              'line',
              [
                { x: 10, y: 10 },
                { x: 20, y: 20 },
              ],
              100,
              100,
            ),
          ],
        },
      ],
    };
    await store.save(updated);
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.schemaVersion, 2);
    assert.equal(saved.globalInstruction, '기존 지시 유지');
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test('coordinates survive zoom, pan, fit and different viewport sizes', () => {
  for (const width of [860, 1320, 2560])
    for (const height of [620, 900, 1440]) {
      const fitted = fitView(1920, 1080, width, height);
      const anchor = { x: width * 0.63, y: height * 0.41 };
      for (const scale of [0.1, 0.75, 1, 2, 5]) {
        const zoomed = zoomAt(fitted, anchor, scale);
        const before = screenToImage(anchor, fitted),
          after = screenToImage(anchor, zoomed);
        assert.ok(Math.abs(before.x - after.x) < 1e-8 && Math.abs(before.y - after.y) < 1e-8);
        const p = { x: 1240, y: 80 };
        assert.deepEqual(
          clampPoint(
            screenToImage({ x: zoomed.x + p.x * scale, y: zoomed.y + p.y * scale }, zoomed),
            1920,
            1080,
          ),
          p,
        );
      }
    }
});
test('reverse rectangles, image edges and target movement stay inside the image', () => {
  assert.deepEqual(makeRectangle('a', { x: 1990, y: 1120 }, { x: -10, y: -20 }, 1920, 1080), {
    id: 'a',
    kind: 'rect',
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
  });
  const rect = makeRectangle('r', { x: 100, y: 100 }, { x: 140, y: 150 }, 1920, 1080);
  assert.deepEqual(moveTarget(rect, 4000, -3000, 1920, 1080), { ...rect, x: 1880, y: 0 });
  assert.deepEqual(clampPoint({ x: 1920, y: 1080 }, 1920, 1080), { x: 1919, y: 1079 });
});
test('copy includes real paths, grouped targets and only written instructions', () => {
  const doc = fixture();
  doc.notes = [
    {
      id: 'n1',
      text: '  첫 줄\n둘째 줄  ',
      targets: [
        { id: 't1', kind: 'point', x: 10, y: 20 },
        { id: 't2', kind: 'rect', x: 100, y: 200, width: 30, height: 40 },
      ],
    },
    { id: 'n2', text: '  ', targets: [{ id: 't3', kind: 'point', x: 0, y: 0 }] },
  ];
  const text = formatInstructions(doc);
  assert.match(text, /C:\\작업 폴더\\reference.png/);
  assert.match(text, /1\. 지점 \(10, 20\), 영역 \(100, 200, 30, 40\)/);
  assert.match(text, /   첫 줄\n   둘째 줄/);
  assert.doesNotMatch(text, /전체 지시|2\./);
  assert.equal(instructionCount(doc), 1);
  doc.globalInstruction = '로고 유지';
  assert.equal(instructionCount(doc), 2);
  assert.match(formatInstructions(doc), /전체 지시: 로고 유지/);
});
test('document validation rejects corrupt formats, nonfinite and duplicate target coordinates', () => {
  validateDocument(fixture());
  for (const bad of [
    { ...fixture(), schemaVersion: 99 },
    { ...fixture(), width: Infinity },
    {
      ...fixture(),
      notes: [{ id: 'n', text: 'x', targets: [{ id: 't', kind: 'point', x: 1920, y: 1 }] }],
    },
    {
      ...fixture(),
      notes: [
        {
          id: 'n',
          text: 'x',
          targets: [{ id: 't', kind: 'rect', x: 1900, y: 1, width: 50, height: 10 }],
        },
      ],
    },
  ])
    assert.throws(() => validateDocument(bad));
});
test('serialized storage, restoration and workspace migration preserve user work', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'pinto-test-'));
  try {
    const workspace = path.join(temp, '작업 폴더');
    await mkdir(workspace);
    const store = new DocumentStore(path.join(temp, 'data'));
    await store.init(workspace);
    const png = Buffer.from('reference-fixture');
    const opened = await store.create('그림.png', png, 100, 100, 'original.png');
    const doc = opened.document;
    const first = { ...doc, globalInstruction: 'first' },
      second = { ...doc, globalInstruction: 'last', referencePath: 'wrong-file' };
    await Promise.all([store.save(first), store.save(second)]);
    const restored = new DocumentStore(path.join(temp, 'data'));
    await restored.init();
    const loaded = await restored.load(doc.id);
    assert.equal(loaded.document.globalInstruction, 'last');
    assert.equal(loaded.document.referencePath, doc.referencePath);
    assert.equal((await readFile(doc.referencePath)).toString(), 'reference-fixture');
    const moved = await restored.setWorkspace(path.join(temp, '새 폴더'), doc.id);
    assert.ok(moved);
    assert.notEqual(moved.document.id, doc.id);
    assert.equal(moved.document.globalInstruction, 'last');
    assert.deepEqual(await readFile(moved.document.referencePath), png);
    assert.deepEqual(await readFile(doc.referencePath), png);
    assert.equal((await restored.recent()).length, 2);
    await writeFile(
      path.join(path.dirname(doc.referencePath), 'annotations.json'),
      JSON.stringify({ ...doc, schemaVersion: 99 }),
    );
    await assert.rejects(restored.load(doc.id), /지원하지/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
