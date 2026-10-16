import { tr } from './i18n.mjs';
import { formatInstructions, instructionCount, type Document } from './model';

export const MAX_IMAGES = 20;
export type SharedInstruction = {
  id: string;
  imageIds: string[];
  referenceId?: string;
  text: string;
};
export type Collection = {
  id: string;
  updatedAt?: string;
  images: { id: string; number: number }[];
  nextNumber: number;
  instructions: SharedInstruction[];
};
export type CollectionView = {
  collection: Collection;
  images: { id: string; name: string; number: number; thumbnail: string; noteCount: number }[];
};
export function validateCollection(value: unknown): asserts value is Collection {
  const c = value as Collection;
  if (
    !c ||
    typeof c.id !== 'string' ||
    !c.id ||
    !Array.isArray(c.images) ||
    !c.images.length ||
    c.images.length > MAX_IMAGES ||
    !Number.isSafeInteger(c.nextNumber)
  )
    throw new Error(tr('batchInvalid'));
  const ids = new Set<string>(),
    numbers = new Set<number>();
  for (const image of c.images) {
    if (
      !image ||
      typeof image.id !== 'string' ||
      !image.id ||
      ids.has(image.id) ||
      !Number.isSafeInteger(image.number) ||
      image.number < 1 ||
      numbers.has(image.number) ||
      image.number >= c.nextNumber
    )
      throw new Error(tr('batchInvalid'));
    ids.add(image.id);
    numbers.add(image.number);
  }
  if (!Array.isArray(c.instructions) || c.instructions.length > 100)
    throw new Error(tr('batchInvalid'));
  const rules = new Set<string>();
  for (const rule of c.instructions) {
    if (
      !rule ||
      typeof rule.id !== 'string' ||
      !rule.id ||
      rules.has(rule.id) ||
      typeof rule.text !== 'string' ||
      rule.text.length > 20000 ||
      !Array.isArray(rule.imageIds) ||
      !rule.imageIds.length ||
      new Set(rule.imageIds).size !== rule.imageIds.length ||
      rule.imageIds.some((id) => !ids.has(id)) ||
      (rule.referenceId !== undefined && !ids.has(rule.referenceId))
    )
      throw new Error(tr('batchInvalid'));
    rules.add(rule.id);
  }
}
export function collectionInstructionCount(c: Collection, docs: Document[]) {
  return (
    docs.reduce((n, d) => n + instructionCount(d), 0) +
    c.instructions.filter((r) => r.text.trim()).length
  );
}
export function formatCollectionInstructions(c: Collection, docs: Document[]) {
  validateCollection(c);
  const byId = new Map(docs.map((d) => [d.id, d]));
  const label = (id: string) =>
    tr('batchImage', { number: c.images.find((i) => i.id === id)!.number });
  const lines = [tr('batchPrompt'), tr('batchCoordinateHint'), ''];
  for (const image of c.images) {
    const doc = byId.get(image.id);
    if (!doc) throw new Error(tr('batchMissing'));
    lines.push(`## ${label(image.id)} — ${doc.name}`, formatInstructions(doc), '');
  }
  if (c.instructions.some((r) => r.text.trim())) lines.push(`## ${tr('batchShared')}`, '');
  for (const rule of c.instructions.filter((r) => r.text.trim())) {
    lines.push(tr('batchApply', { images: rule.imageIds.map(label).join(', ') }));
    if (rule.referenceId) lines.push(tr('batchReference', { image: label(rule.referenceId) }));
    lines.push(rule.text.trim(), '');
  }
  return lines.join('\n').trimEnd();
}
