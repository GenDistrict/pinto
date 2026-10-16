import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Collections } from '../src/main/collections';
import {
  formatCollectionInstructions,
  validateCollection,
  MAX_IMAGES,
} from '../src/core/collection';
import { setLocale } from '../src/core/i18n.mjs';
import type { Document } from '../src/core/model';

test('collections persist membership and cross references, retain numbers, and reject dangling targets', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pinto-collection-'));
  try {
    const file = path.join(dir, 'collections.json'),
      store = new Collections(file);
    await store.init();
    await store.adopt('a');
    await store.adopt('b', true);
    let c = await store.adopt('c', true);
    const rules = [{ id: 'rule', text: 'match the reference', imageIds: ['b'], referenceId: 'a' }];
    await store.rules(c.id, rules);
    await assert.rejects(store.remove('a'));
    await assert.rejects(store.rules(c.id, [{ ...rules[0], imageIds: ['unknown'] }]));
    c = await store.remove('c');
    assert.deepEqual(
      c.images.map((i) => i.number),
      [1, 2],
    );
    c = await store.adopt('d', true);
    assert.deepEqual(
      c.images.map((i) => i.number),
      [1, 2, 4],
    );
    const restored = new Collections(file);
    await restored.init();
    assert.deepEqual(restored.current(), store.current());
    await restored.close();
    assert.equal(restored.current(), undefined);
    await restored.restore('b');
    assert.deepEqual(restored.current()?.instructions, rules);
    await restored.adopt('other');
    await restored.restore('a');
    assert.equal(restored.current()?.images.length, 3);
    while (restored.current()!.images.length < MAX_IMAGES)
      await restored.adopt('extra-' + restored.current()!.images.length, true);
    await assert.rejects(restored.adopt('overflow', true));
    assert.equal(restored.current()?.images.length, MAX_IMAGES);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('multi-image copy distinguishes same filenames and dimensions and keeps reference roles in all locales', () => {
  const c = {
    id: 'work',
    images: [
      { id: 'a', number: 1 },
      { id: 'b', number: 3 },
    ],
    nextNumber: 4,
    instructions: [
      { id: 'rule', text: 'Use the reference colors.', imageIds: ['b'], referenceId: 'a' },
    ],
  };
  const make = (id: string, width: number, height: number): Document => ({
    schemaVersion: 3,
    id,
    name: 'same.png',
    referencePath: `/${id}/reference.png`,
    width,
    height,
    createdAt: '',
    updatedAt: '',
    globalInstruction: '',
    notes: [{ id: 'n', text: `only ${id}`, targets: [{ id: 't', kind: 'point', x: 1, y: 2 }] }],
  });
  const docs = [make('a', 100, 200), make('b', 300, 400)];
  const original = JSON.stringify([c, docs]);
  try {
    for (const locale of ['ko', 'en', 'es']) {
      setLocale(locale);
      const text = formatCollectionInstructions(c, docs);
      assert.ok(text.includes('/a/reference.png'));
      assert.ok(text.includes('/b/reference.png'));
      assert.ok(text.includes('100×200'));
      assert.ok(text.includes('300×400'));
      assert.ok(text.includes('only a'));
      assert.ok(text.includes('only b'));
      assert.ok(text.includes('Use the reference colors.'));
      if (locale === 'en') {
        assert.match(text, /Apply to: Image 3/);
        assert.match(text, /Reference image: Image 1/);
      }
      if (locale === 'es') assert.match(text, /Aplicar a: Imagen 3/);
      assert.equal(JSON.stringify([c, docs]), original);
    }
    assert.throws(() => formatCollectionInstructions(c, [docs[0]]));
    assert.throws(() =>
      validateCollection({
        ...c,
        instructions: [{ ...c.instructions[0], referenceId: 'missing' }],
      }),
    );
  } finally {
    setLocale('ko');
  }
});
