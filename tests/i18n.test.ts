import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogs, locales, normalizeLocale, setLocale, tr } from '../src/core/i18n.mjs';
import { formatInstructions, type Document } from '../src/core/model';

test('all locales cover every message and preserve interpolation parameters', () => {
  const keys = Object.keys(catalogs.ko).sort();
  for (const locale of locales) {
    assert.deepEqual(Object.keys(catalogs[locale]).sort(), keys);
    for (const key of keys) {
      const tokens = (s: string) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort();
      assert.deepEqual(tokens(catalogs[locale][key]), tokens(catalogs.ko[key]), `${locale}:${key}`);
      assert.equal(typeof catalogs[locale][key], 'string');
      if (locale !== 'ko') assert.doesNotMatch(catalogs[locale][key], /[가-힣]/, key);
    }
  }
  assert.equal(normalizeLocale('es-CL'), 'es');
  assert.equal(normalizeLocale('en-GB'), 'en');
  assert.equal(normalizeLocale('ko_KR'), 'ko');
  assert.equal(normalizeLocale('fr-FR'), 'en');
  assert.equal(tr('m040', { p0: 3 }, 'es'), 'Objetivos: 3');
});

test('localized copy preserves user wording, paths and coordinates without changing the document', () => {
  const doc: Document = {
    schemaVersion: 3,
    id: 'demo',
    name: 'My image.png',
    referencePath: 'C:\\Users\\Example\\reference.png',
    width: 100,
    height: 100,
    createdAt: '',
    updatedAt: '',
    globalInstruction: 'Keep this exactly: 안녕 / hola',
    notes: [
      {
        id: 'n',
        text: 'Hazlo azul. Keep my wording.',
        targets: [{ id: 't', kind: 'rect', x: 10, y: 20, width: 30, height: 40 }],
      },
    ],
  };
  const original = JSON.stringify(doc);
  try {
    for (const locale of locales) {
      setLocale(locale);
      const copy = formatInstructions(doc);
      assert.ok(copy.includes(doc.referencePath));
      assert.ok(copy.includes('(10, 20, 30, 40)'));
      assert.ok(copy.includes(doc.notes[0].text));
      assert.ok(copy.includes(doc.globalInstruction));
      assert.equal(JSON.stringify(doc), original);
      if (locale === 'es') assert.match(copy, /Coordenadas:|Zona:/);
      if (locale === 'en') assert.match(copy, /Coordinates:|Region:/);
    }
  } finally {
    setLocale('ko');
  }
});
