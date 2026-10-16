import { tr } from './i18n.mjs';
export type Point = { x: number; y: number };
export type PointTarget = Point & { id: string; kind: 'point' };
export type RectTarget = Point & { id: string; kind: 'rect'; width: number; height: number };
export type EllipseTarget = Point & { id: string; kind: 'ellipse'; width: number; height: number };
export type LineTarget = Point & { id: string; kind: 'line'; start: Point; end: Point };
export type StrokeTarget = Point & { id: string; kind: 'stroke'; points: Point[] };
export type Target = PointTarget | RectTarget | EllipseTarget | LineTarget | StrokeTarget;
export type Note = { id: string; text: string; targets: Target[] };
export type Document = {
  schemaVersion: 1 | 2 | 3;
  id: string;
  name: string;
  sourcePath?: string;
  referencePath: string;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
  globalInstruction: string;
  notes: Note[];
};
export type OpenDocument = { document: Document; imageUrl: string };
export type ImageSource = { token: string; name: string; dataUrl: string };
export type Recent = {
  imageCount?: number;
  id: string;
  name: string;
  width: number;
  height: number;
  updatedAt: string;
  noteCount: number;
};
export type AppInfo = {
  locale: import('./i18n.mjs').Locale;
  version: string;
  platform: string;
  sourceRoot: string;
  dataPath: string;
  workspace?: string;
  modificationGuide: string;
};
export type Bootstrap = {
  collection?: import('./collection').CollectionView | null;
  info: AppInfo;
  recent: Recent[];
  opened?: OpenDocument;
  initialImage?: ImageSource;
  warning?: string;
};
export type View = { x: number; y: number; scale: number };

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
export function screenToImage(point: Point, view: View): Point {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
}
export function clampPoint(p: Point, width: number, height: number): Point {
  return { x: Math.round(clamp(p.x, 0, width - 1)), y: Math.round(clamp(p.y, 0, height - 1)) };
}
export function makeRectangle(
  id: string,
  start: Point,
  end: Point,
  width: number,
  height: number,
): RectTarget {
  const x = Math.round(clamp(Math.min(start.x, end.x), 0, width - 1));
  const y = Math.round(clamp(Math.min(start.y, end.y), 0, height - 1));
  return {
    id,
    kind: 'rect',
    x,
    y,
    width: Math.max(1, Math.round(clamp(Math.max(start.x, end.x), x + 1, width)) - x),
    height: Math.max(1, Math.round(clamp(Math.max(start.y, end.y), y + 1, height)) - y),
  };
}
export function moveTarget(
  target: Target,
  dx: number,
  dy: number,
  width: number,
  height: number,
): Target {
  if (target.kind === 'stroke' || target.kind === 'line') {
    const points = target.kind === 'stroke' ? target.points : [target.start, target.end];
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y);
    const shiftX = Math.round(clamp(dx, -Math.min(...xs), width - 1 - Math.max(...xs)));
    const shiftY = Math.round(clamp(dy, -Math.min(...ys), height - 1 - Math.max(...ys)));
    const moved = points.map((p) => ({ x: p.x + shiftX, y: p.y + shiftY }));
    if (target.kind === 'line')
      return {
        ...target,
        x: target.x + shiftX,
        y: target.y + shiftY,
        start: moved[0],
        end: moved[1],
      };
    return {
      ...target,
      x: target.x + shiftX,
      y: target.y + shiftY,
      points: moved,
    };
  }
  const right =
    target.kind === 'rect' || target.kind === 'ellipse' ? width - target.width : width - 1;
  const bottom =
    target.kind === 'rect' || target.kind === 'ellipse' ? height - target.height : height - 1;
  return {
    ...target,
    x: Math.round(clamp(target.x + dx, 0, right)),
    y: Math.round(clamp(target.y + dy, 0, bottom)),
  };
}
export function makeEllipse(
  id: string,
  start: Point,
  end: Point,
  width: number,
  height: number,
): EllipseTarget {
  return { ...makeRectangle(id, start, end, width, height), kind: 'ellipse' };
}
export function makeLine(
  id: string,
  start: Point,
  end: Point,
  width: number,
  height: number,
): LineTarget | PointTarget {
  const a = clampPoint(start, width, height),
    b = clampPoint(end, width, height);
  if (a.x === b.x && a.y === b.y) return { id, kind: 'point', ...a };
  return { id, kind: 'line', x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), start: a, end: b };
}
export function makeStroke(
  id: string,
  input: Point[],
  width: number,
  height: number,
): StrokeTarget | PointTarget {
  const points: Point[] = [];
  for (const point of input) {
    const p = clampPoint(point, width, height),
      previous = points.at(-1);
    if (!previous || p.x !== previous.x || p.y !== previous.y) points.push(p);
  }
  if (points.length < 2) return { id, kind: 'point', ...(points[0] || { x: 0, y: 0 }) };
  // Keep a bounded, ordered path. Including both endpoints preserves open strokes.
  const sampled =
    points.length <= 128
      ? points
      : Array.from({ length: 128 }, (_, i) => points[Math.round((i * (points.length - 1)) / 127)]);
  return {
    id,
    kind: 'stroke',
    x: Math.min(...sampled.map((p) => p.x)),
    y: Math.min(...sampled.map((p) => p.y)),
    points: sampled,
  };
}
export function strokePath(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
}
export function fitView(
  width: number,
  height: number,
  containerWidth: number,
  containerHeight: number,
): View {
  const scale = Math.max(
    0.001,
    Math.min((containerWidth - 100) / width, (containerHeight - 100) / height, 1),
  );
  return {
    scale,
    x: (containerWidth - width * scale) / 2,
    y: (containerHeight - height * scale) / 2,
  };
}
export function zoomAt(view: View, anchor: Point, scale: number): View {
  const image = screenToImage(anchor, view);
  return { scale, x: anchor.x - image.x * scale, y: anchor.y - image.y * scale };
}
export function targetDescription(target: Target): string {
  if (target.kind === 'line')
    return tr('m136', {
      p0: target.start.x,
      p1: target.start.y,
      p2: target.end.x,
      p3: target.end.y,
    });
  if (target.kind === 'ellipse')
    return tr('m137', { p0: target.x, p1: target.y, p2: target.width, p3: target.height });
  if (target.kind === 'stroke') {
    const width = Math.max(1, Math.max(...target.points.map((p) => p.x)) - target.x);
    const height = Math.max(1, Math.max(...target.points.map((p) => p.y)) - target.y);
    return tr('m138', {
      p0: target.x,
      p1: target.y,
      p2: width,
      p3: height,
      p4: strokePath(target.points),
    });
  }
  return target.kind === 'point'
    ? tr('m139', { p0: target.x, p1: target.y })
    : tr('m140', { p0: target.x, p1: target.y, p2: target.width, p3: target.height });
}
export function instructionCount(doc: Document): number {
  return doc.notes.filter((n) => n.text.trim()).length + (doc.globalInstruction.trim() ? 1 : 0);
}
export function formatInstructions(doc: Document): string {
  const lines = [
    tr('m141'),
    tr('m142'),
    '',
    tr('m143', { p0: doc.name }),
    tr('m144', { p0: doc.referencePath }),
    tr('m145', { p0: doc.width, p1: doc.height }),
    tr('m146'),
    tr('m147'),
    '',
  ];
  if (doc.notes.some((n) => n.targets.some((t) => t.kind === 'stroke'))) {
    lines.push(tr('m148'), '');
  }
  doc.notes
    .filter((n) => n.text.trim())
    .forEach((note, i) => {
      lines.push(`${i + 1}. ${note.targets.map(targetDescription).join(', ')}`);
      lines.push(
        ...note.text
          .trim()
          .split(/\r?\n/)
          .map((line) => `   ${line}`),
        '',
      );
    });
  if (doc.globalInstruction.trim())
    lines.push(tr('m149', { p0: doc.globalInstruction.trim() }), '');
  return lines.join('\n').trimEnd();
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}
export function validateDocument(value: unknown): asserts value is Document {
  if (
    !record(value) ||
    (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3)
  )
    throw new Error(tr('m150'));
  if (
    !text(value.id, 100) ||
    !value.id ||
    !text(value.name, 1000) ||
    !text(value.referencePath, 32768) ||
    !text(value.createdAt, 100) ||
    !text(value.updatedAt, 100) ||
    !text(value.globalInstruction, 20000)
  )
    throw new Error(tr('m151'));
  if (
    !integer(value.width) ||
    !integer(value.height) ||
    value.width < 1 ||
    value.height < 1 ||
    value.width * value.height > 64_000_000 ||
    value.width > 16000 ||
    value.height > 16000
  )
    throw new Error(tr('m152'));
  if (value.sourcePath !== undefined && !text(value.sourcePath, 32768)) throw new Error(tr('m153'));
  if (!Array.isArray(value.notes) || value.notes.length > 1000) throw new Error(tr('m154'));
  const ids = new Set<string>();
  for (const n of value.notes) {
    if (
      !record(n) ||
      !text(n.id, 100) ||
      !n.id ||
      ids.has(n.id) ||
      !text(n.text, 20000) ||
      !Array.isArray(n.targets) ||
      n.targets.length < 1 ||
      n.targets.length > 100
    )
      throw new Error(tr('m155'));
    ids.add(n.id);
    for (const t of n.targets) {
      if (
        !record(t) ||
        !text(t.id, 100) ||
        !t.id ||
        ids.has(t.id) ||
        !['point', 'rect', 'ellipse', 'line', 'stroke'].includes(String(t.kind)) ||
        !integer(t.x) ||
        !integer(t.y) ||
        t.x < 0 ||
        t.y < 0 ||
        t.x >= value.width ||
        t.y >= value.height
      )
        throw new Error(tr('m156'));
      ids.add(t.id);
      if ((t.kind === 'ellipse' || t.kind === 'line') && value.schemaVersion !== 3)
        throw new Error(tr('m157'));
      if (t.kind === 'line') {
        const a = t.start,
          b = t.end;
        if (
          !record(a) ||
          !record(b) ||
          [a, b].some(
            (p) =>
              !integer(p.x) ||
              !integer(p.y) ||
              p.x < 0 ||
              p.y < 0 ||
              p.x >= (value.width as number) ||
              p.y >= (value.height as number),
          )
        )
          throw new Error(tr('m158'));
        if (
          t.x !== Math.min(a.x as number, b.x as number) ||
          t.y !== Math.min(a.y as number, b.y as number) ||
          (a.x === b.x && a.y === b.y)
        )
          throw new Error(tr('m159'));
      }
      if (t.kind === 'stroke') {
        if (
          value.schemaVersion < 2 ||
          !Array.isArray(t.points) ||
          t.points.length < 2 ||
          t.points.length > 128 ||
          t.points.some(
            (p) =>
              !record(p) ||
              !integer(p.x) ||
              !integer(p.y) ||
              p.x < 0 ||
              p.y < 0 ||
              p.x >= (value.width as number) ||
              p.y >= (value.height as number),
          )
        ) {
          throw new Error(tr('m160'));
        }
        const points = t.points as Point[];
        if (
          t.x !== Math.min(...points.map((p) => p.x)) ||
          t.y !== Math.min(...points.map((p) => p.y))
        )
          throw new Error(tr('m161'));
      }
      if (
        (t.kind === 'rect' || t.kind === 'ellipse') &&
        (!integer(t.width) ||
          !integer(t.height) ||
          t.width < 1 ||
          t.height < 1 ||
          t.x + t.width > value.width ||
          t.y + t.height > value.height)
      )
        throw new Error(tr('m162'));
    }
  }
}
