import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateDocument, type Document, type OpenDocument, type Recent } from '../core/model';

export async function atomicWrite(file: string, value: string | Buffer) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, value);
    await fs.rename(temp, file);
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
  }
}
type Index = {
  version: 1;
  workspace?: string;
  lastId?: string;
  documents: { id: string; directory: string }[];
};
export class DocumentStore {
  private index: Index = { version: 1, documents: [] };
  private docs = new Map<string, Document>();
  private queue: Promise<unknown> = Promise.resolve();
  warning?: string;
  constructor(readonly dataPath: string) {}
  get workspace() {
    return this.index.workspace;
  }
  get lastId() {
    return this.index.lastId;
  }
  get root() {
    return this.workspace
      ? path.join(this.workspace, '.image-notes')
      : path.join(this.dataPath, 'documents');
  }
  async init(workspace?: string) {
    await fs.mkdir(this.dataPath, { recursive: true });
    try {
      const value = JSON.parse(await fs.readFile(path.join(this.dataPath, 'index.json'), 'utf8'));
      if (
        value.version !== 1 ||
        !Array.isArray(value.documents) ||
        value.documents.some(
          (d: { id?: unknown; directory?: unknown }) =>
            typeof d?.id !== 'string' || typeof d?.directory !== 'string',
        )
      )
        throw new Error('invalid index');
      this.index = value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        const file = path.join(this.dataPath, 'index.json');
        await fs.copyFile(file, `${file}.recovery-${Date.now()}`).catch(() => {});
        this.warning = '최근 작업 목록을 읽지 못했어요. 원래 목록은 복구용 사본으로 보관했습니다.';
      }
    }
    if (workspace) {
      await fs.access(workspace);
      this.index.workspace = path.resolve(workspace);
    }
  }
  private directory(id: string) {
    const entry = this.index.documents.find((d) => d.id === id);
    if (!entry) throw new Error('이 작업을 찾을 수 없어요. 최근 작업 목록을 확인해 주세요.');
    return entry.directory;
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => {}).then(fn);
    this.queue = next;
    return next;
  }
  private persistIndex() {
    return atomicWrite(path.join(this.dataPath, 'index.json'), JSON.stringify(this.index, null, 2));
  }
  closeDocument(): Promise<void> {
    return this.serial(async () => {
      const previous = this.index.lastId;
      delete this.index.lastId;
      try {
        await this.persistIndex();
      } catch (error) {
        this.index.lastId = previous;
        throw error;
      }
    });
  }
  async create(
    name: string,
    png: Buffer,
    width: number,
    height: number,
    sourcePath?: string,
  ): Promise<OpenDocument> {
    return this.serial(async () => {
      const id = randomUUID(),
        directory = path.join(this.root, id),
        now = new Date().toISOString();
      const doc: Document = {
        schemaVersion: 3,
        id,
        name,
        sourcePath,
        referencePath: path.join(directory, 'reference.png'),
        width,
        height,
        createdAt: now,
        updatedAt: now,
        globalInstruction: '',
        notes: [],
      };
      validateDocument(doc);
      await atomicWrite(doc.referencePath, png);
      await atomicWrite(path.join(directory, 'annotations.json'), JSON.stringify(doc, null, 2));
      this.index.documents.unshift({ id, directory });
      this.index.lastId = id;
      this.docs.set(id, doc);
      await this.persistIndex();
      return { document: doc, imageUrl: `data:image/png;base64,${png.toString('base64')}` };
    });
  }
  async load(id: string): Promise<OpenDocument> {
    return this.serial(async () => {
      const directory = this.directory(id);
      const doc: unknown = JSON.parse(
        await fs.readFile(path.join(directory, 'annotations.json'), 'utf8'),
      );
      validateDocument(doc);
      if (doc.id !== id)
        throw new Error('작업 식별 정보가 일치하지 않아요. 원본 데이터는 보존됩니다.');
      doc.referencePath = path.join(directory, 'reference.png');
      const png = await fs.readFile(doc.referencePath);
      this.docs.set(id, doc);
      this.index.lastId = id;
      await this.persistIndex();
      return { document: doc, imageUrl: `data:image/png;base64,${png.toString('base64')}` };
    });
  }
  async save(value: unknown): Promise<Document> {
    validateDocument(value);
    const input = structuredClone(value);
    return this.serial(async () => {
      const original = this.docs.get(input.id);
      if (!original) throw new Error('먼저 작업을 열어 주세요.');
      const doc: Document = {
        ...original,
        schemaVersion: Math.max(
          original.schemaVersion,
          input.schemaVersion,
        ) as Document['schemaVersion'],
        notes: input.notes,
        globalInstruction: input.globalInstruction,
        updatedAt: new Date().toISOString(),
      };
      validateDocument(doc);
      await fs.access(doc.referencePath);
      await atomicWrite(
        path.join(this.directory(doc.id), 'annotations.json'),
        JSON.stringify(doc, null, 2),
      );
      this.docs.set(doc.id, doc);
      this.index.lastId = doc.id;
      await this.persistIndex();
      return doc;
    });
  }
  async recent(): Promise<Recent[]> {
    await this.queue.catch(() => {});
    const results = await Promise.all(
      this.index.documents.map(async (entry) => {
        try {
          const doc =
            this.docs.get(entry.id) ??
            JSON.parse(await fs.readFile(path.join(entry.directory, 'annotations.json'), 'utf8'));
          validateDocument(doc);
          return {
            id: doc.id,
            name: doc.name,
            width: doc.width,
            height: doc.height,
            updatedAt: doc.updatedAt,
            noteCount: doc.notes.filter((n) => n.text.trim()).length,
          };
        } catch {
          return null;
        }
      }),
    );
    return results
      .filter((d): d is Recent => !!d)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 30);
  }
  async setWorkspace(directory: string, currentId?: string): Promise<OpenDocument | undefined> {
    const current = currentId ? await this.load(currentId) : undefined;
    await fs.mkdir(path.join(directory, '.image-notes'), { recursive: true });
    await this.serial(async () => {
      this.index.workspace = path.resolve(directory);
      await this.persistIndex();
    });
    if (!current) return;
    if (path.dirname(path.dirname(current.document.referencePath)) === this.root) return current;
    const old = current.document;
    const moved = await this.create(
      old.name,
      Buffer.from(current.imageUrl.split(',')[1], 'base64'),
      old.width,
      old.height,
      old.sourcePath,
    );
    moved.document.notes = old.notes;
    moved.document.globalInstruction = old.globalInstruction;
    moved.document = await this.save(moved.document);
    return moved;
  }
  get(id: string) {
    const doc = this.docs.get(id);
    if (!doc) throw new Error('먼저 작업을 열어 주세요.');
    return doc;
  }
}
