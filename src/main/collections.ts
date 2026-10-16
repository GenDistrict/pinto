import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { atomicWrite } from './storage';
import {
  MAX_IMAGES,
  validateCollection,
  type Collection,
  type SharedInstruction,
} from '../core/collection';
import { tr } from '../core/i18n.mjs';

type State = { version: 1; active?: string; collections: Collection[] };
export class Collections {
  private state: State = { version: 1, collections: [] };
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}
  async init() {
    try {
      const s = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (s.version !== 1 || !Array.isArray(s.collections)) throw new Error(tr('batchInvalid'));
      s.collections.forEach(validateCollection);
      this.state = s;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  current() {
    return structuredClone(this.state.collections.find((c) => c.id === this.state.active));
  }
  forImage(id: string) {
    return structuredClone(
      [...this.state.collections].reverse().find((c) => c.images.some((i) => i.id === id)),
    );
  }
  private change<T>(fn: (s: State) => T): Promise<T> {
    const next = this.queue
      .catch(() => {})
      .then(async () => {
        const draft = structuredClone(this.state);
        const result = fn(draft);
        draft.collections.forEach(validateCollection);
        await atomicWrite(this.file, JSON.stringify(draft, null, 2));
        this.state = draft;
        return result;
      });
    this.queue = next;
    return next;
  }
  async adopt(id: string, append = false) {
    return this.change((s) => {
      let c = append ? s.collections.find((c) => c.id === s.active) : undefined;
      if (c) {
        if (c.images.length >= MAX_IMAGES) throw new Error(tr('batchLimit', { count: MAX_IMAGES }));
        if (!c.images.some((i) => i.id === id)) c.images.push({ id, number: c.nextNumber++ });
      } else {
        c = { id: randomUUID(), images: [{ id, number: 1 }], nextNumber: 2, instructions: [] };
        s.collections.push(c);
      }
      s.active = c.id;
      c.updatedAt = new Date().toISOString();
      return structuredClone(c);
    });
  }
  async restore(id: string) {
    return this.change((s) => {
      let c = [...s.collections].reverse().find((c) => c.images.some((i) => i.id === id));
      if (!c) {
        c = { id: randomUUID(), images: [{ id, number: 1 }], nextNumber: 2, instructions: [] };
        s.collections.push(c);
      }
      s.active = c.id;
      return structuredClone(c);
    });
  }
  async close() {
    await this.change((s) => {
      delete s.active;
    });
  }
  async rules(id: string, rules: SharedInstruction[]) {
    return this.change((s) => {
      const c = s.collections.find((c) => c.id === id);
      if (!c) throw new Error(tr('batchInvalid'));
      c.instructions = structuredClone(rules);
      c.updatedAt = new Date().toISOString();
      validateCollection(c);
    });
  }
  async remove(id: string) {
    return this.change((s) => {
      const c = s.collections.find((c) => c.id === s.active);
      if (!c || c.images.length < 2 || !c.images.some((i) => i.id === id))
        throw new Error(tr('batchInvalid'));
      if (c.instructions.some((r) => r.imageIds.includes(id) || r.referenceId === id))
        throw new Error(tr('batchLinked'));
      c.images = c.images.filter((i) => i.id !== id);
      c.updatedAt = new Date().toISOString();
      return structuredClone(c);
    });
  }
  async replace(oldId: string, newId: string) {
    return this.change((s) => {
      const c = s.collections.find((c) => c.id === s.active);
      if (!c) return;
      c.images = c.images.map((i) => (i.id === oldId ? { ...i, id: newId } : i));
      c.instructions = c.instructions.map((r) => ({
        ...r,
        imageIds: r.imageIds.map((id) => (id === oldId ? newId : id)),
        referenceId: r.referenceId === oldId ? newId : r.referenceId,
      }));
    });
  }
  async settled() {
    await this.queue.catch(() => {});
  }
}
