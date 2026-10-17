import { tr } from './i18n.mjs';
import type { Document, Target } from './model';
export type LiveAction =
  { kind: 'key'; key: 'ArrowLeft' | 'ArrowRight' } | { kind: 'click'; x: number; y: number };
export type ContextBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  selector?: string;
};
export type Surface = {
  kind: 'pdf' | 'html' | 'webapp';
  path: string;
  page: number;
  pageCount?: number;
  boxes: ContextBox[];
  actions?: LiveAction[];
  signature?: string;
  fullHeight?: number;
  renderedUrl?: string;
};
export function validateSurface(value: unknown): asserts value is Surface {
  const s = value as Surface;
  if (
    !s ||
    !['pdf', 'html', 'webapp'].includes(s.kind) ||
    typeof s.path !== 'string' ||
    s.path.length > 32768 ||
    !Number.isSafeInteger(s.page) ||
    s.page < 1 ||
    s.page > 200 ||
    !Array.isArray(s.boxes) ||
    s.boxes.length > 5000
  )
    throw new Error(tr('docInvalid'));
  if (
    s.pageCount !== undefined &&
    (!Number.isSafeInteger(s.pageCount) ||
      s.pageCount < 1 ||
      s.pageCount > 200 ||
      s.page > s.pageCount)
  )
    throw new Error(tr('docInvalid'));
  for (const b of s.boxes)
    if (
      !b ||
      ![b.x, b.y, b.width, b.height].every(Number.isFinite) ||
      b.width < 0 ||
      b.height < 0 ||
      typeof b.text !== 'string' ||
      b.text.length > 2000 ||
      (b.selector !== undefined && (typeof b.selector !== 'string' || b.selector.length > 2000))
    )
      throw new Error(tr('docInvalid'));
  if (s.actions !== undefined) validateActions(s.actions);
  if (s.signature !== undefined && (typeof s.signature !== 'string' || s.signature.length > 10000))
    throw new Error(tr('docInvalid'));
  if (s.fullHeight !== undefined && (!Number.isFinite(s.fullHeight) || s.fullHeight < 1))
    throw new Error(tr('docInvalid'));
  if (
    s.renderedUrl !== undefined &&
    (typeof s.renderedUrl !== 'string' || s.renderedUrl.length > 32768)
  )
    throw new Error(tr('docInvalid'));
}
export function surfaceGroupKey(kind: string, path: string) {
  if (kind === 'webapp') {
    try {
      return `${kind}|${new URL(path).origin}`;
    } catch {
      return `${kind}|${path}`;
    }
  }
  return `${kind}|${path}`;
}
export function validateActions(value: unknown): asserts value is LiveAction[] {
  if (!Array.isArray(value) || value.length > 60) throw new Error(tr('docActionLimit'));
  for (const a of value) {
    if (a?.kind === 'key' && ['ArrowLeft', 'ArrowRight'].includes(a.key)) continue;
    if (
      a?.kind === 'click' &&
      Number.isFinite(a.x) &&
      Number.isFinite(a.y) &&
      a.x >= 0 &&
      a.y >= 0 &&
      a.x <= 1280 &&
      a.y <= 8000
    )
      continue;
    throw new Error(tr('docInvalid'));
  }
}
export function targetBounds(t: Target) {
  if (t.kind === 'rect' || t.kind === 'ellipse')
    return { x: t.x, y: t.y, width: t.width, height: t.height };
  const pts = t.kind === 'line' ? [t.start, t.end] : t.kind === 'stroke' ? t.points : [t];
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}
export function contextFor(s: Surface, t: Target) {
  const raw = targetBounds(t),
    pad = t.kind === 'point' ? 4 : t.kind === 'line' || t.kind === 'stroke' ? 6 : 0;
  const r = {
    x: raw.x - pad,
    y: raw.y - pad,
    width: Math.max(1, raw.width + pad * 2),
    height: Math.max(1, raw.height + pad * 2),
  };
  const hits = s.boxes
    .map((b) => {
      const overlap =
        Math.max(0, Math.min(r.x + r.width, b.x + b.width) - Math.max(r.x, b.x)) *
        Math.max(0, Math.min(r.y + r.height, b.y + b.height) - Math.max(r.y, b.y));
      return {
        b,
        overlap,
        score:
          ((overlap / Math.max(1, r.width * r.height)) * overlap) / Math.max(1, b.width * b.height),
      };
    })
    .filter((h) => h.overlap > 0);
  if (s.kind === 'pdf')
    return hits
      .filter((h) => pad > 0 || h.overlap / Math.max(1, h.b.width * h.b.height) >= 0.5)
      .sort((a, b) => a.b.y - b.b.y || a.b.x - b.b.x)
      .map((h) => h.b.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, 300);
  const best = hits
    .filter((h) => h.b.selector && !/^(html|body)$/.test(h.b.selector))
    .sort((a, b) => b.score - a.score || a.b.width * a.b.height - b.b.width * b.b.height)[0]?.b;
  return best
    ? `${best.selector}${best.text ? ` "${best.text.replace(/\s+/g, ' ').slice(0, 120)}"` : ''}`
    : '';
}
export function surfaceInstruction(
  doc: Document,
  describe: (t: Target) => string,
  numberOffset = 0,
) {
  const s = doc.surface!;
  const lines = [
    tr('docRequest'),
    tr('docSource', { path: s.path }),
    tr(s.kind === 'pdf' ? 'docPdfLocation' : 'docWebLocation', {
      page: s.page,
      count: s.pageCount || s.page,
      width: doc.width,
      height: doc.height,
    }),
  ];
  if (s.fullHeight && s.fullHeight > doc.height)
    lines.push(tr('docClipped', { height: doc.height, total: s.fullHeight }));
  if (s.renderedUrl) lines.push(tr('docRenderedUrl', { url: s.renderedUrl }));
  if (s.actions?.length)
    lines.push(
      tr('docSteps', {
        steps: s.actions
          .map((a) => (a.kind === 'key' ? a.key : `click (${a.x}, ${a.y})`))
          .join(' → '),
      }),
    );
  lines.push(tr('docPreview', { path: doc.referencePath }), '');
  doc.notes
    .filter((n) => n.text.trim())
    .forEach((n, i) => {
      lines.push(`${i + 1 + numberOffset}. ${n.targets.map(describe).join('; ')}`);
      const hints = [...new Set(n.targets.map((t) => contextFor(s, t)).filter(Boolean))];
      if (hints.length)
        lines.push(
          tr(s.kind === 'pdf' ? 'docTextContext' : 'docElementContext', {
            text: hints.join(' / '),
          }),
        );
      lines.push(n.text.trim(), '');
    });
  if (doc.globalInstruction.trim()) lines.push(doc.globalInstruction.trim(), '');
  lines.push(
    tr(s.kind === 'pdf' ? 'docEditPdf' : s.kind === 'html' ? 'docEditHtml' : 'docEditWeb'),
  );
  return lines.join('\n');
}
