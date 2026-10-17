import { tr } from '../core/i18n.mjs';
import type { LiveAction } from '../core/surfaces';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import {
  Check,
  Crosshair,
  Hand,
  Maximize,
  Minus,
  Square,
  Circle,
  CircleDot,
  Slash,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  clamp,
  clampPoint,
  fitView,
  makeRectangle,
  makeEllipse,
  makeLine,
  makeStroke,
  moveTarget,
  screenToImage,
  strokePath,
  zoomAt,
  type Document,
  type Point,
  type Target,
  type View,
} from '../core/model';

type Props = {
  doc: Document;
  imageUrl: string;
  activeId: string | null;
  adding: boolean;
  onSelect(id: string): void;
  onCreate(target: Target, add: boolean): void;
  onTarget(noteId: string, target: Target): void;
  onText(id: string, text: string): void;
  onDelete(id: string): void;
  onDismiss(): void;
  onAdding(): void;
  mode?: 'view' | 'edit';
  live?: boolean;
  onInteract?(action: LiveAction): void;
  numberOffset?: number;
};
type Drag = {
  kind: 'create' | 'draw' | 'move' | 'resize' | 'endpoint' | 'pan';
  tool: Target['kind'];
  endpoint?: 'start' | 'end';
  start: Point;
  last: Point;
  imageStart: Point;
  view: View;
  target?: Target;
  noteId?: string;
  add: boolean;
  moved: boolean;
  points: Point[];
};
const isInput = (target: EventTarget | null) =>
  target instanceof HTMLElement && !!target.closest('textarea,input,[contenteditable="true"]');

export function Canvas({
  doc,
  imageUrl,
  activeId,
  adding,
  onSelect,
  onCreate,
  onTarget,
  onText,
  onDelete,
  onDismiss,
  onAdding,
  mode = 'edit',
  live = false,
  onInteract,
  numberOffset = 0,
}: Props) {
  const stage = useRef<HTMLDivElement>(null),
    svg = useRef<SVGSVGElement>(null),
    editor = useRef<HTMLTextAreaElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 });
  const [fitMode, setFitMode] = useState<'auto' | 'width' | 'page'>('auto');
  const viewRef = useRef(view),
    fitted = useRef(true),
    previousDoc = useRef('');
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<{ noteId?: string; target: Target } | null>(null);
  const [space, setSpace] = useState(false),
    [hand, setHand] = useState(false),
    [tool, setTool] = useState<Target['kind']>('point'),
    [dragging, setDragging] = useState(false);
  const active = doc.notes.find((n) => n.id === activeId);
  const changeView = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);
  useLayoutEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (previousDoc.current !== doc.id) {
      previousDoc.current = doc.id;
      fitted.current = true;
    }
    if (fitted.current) {
      const widthFit =
        fitMode === 'width' ||
        (fitMode === 'auto' &&
          (live || doc.surface?.kind === 'webapp') &&
          doc.height > doc.width * 1.6);
      if (widthFit) {
        const scale = Math.max(0.02, Math.min(4, (size.width - 64) / doc.width));
        changeView({ scale, x: (size.width - doc.width * scale) / 2, y: 32 });
      } else changeView(fitView(doc.width, doc.height, size.width, size.height - 48));
    }
  }, [doc.id, doc.width, doc.height, size, changeView, fitMode, live]);
  useEffect(() => {
    if (activeId && !dragging) editor.current?.focus();
  }, [activeId, active?.targets.length, dragging]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag.current) {
        drag.current = null;
        setPreview(null);
        setDragging(false);
      }
      if (e.code === 'Space' && !isInput(e.target)) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false);
    };
    const blur = () => setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (doc.surface && !e.ctrlKey && !e.metaKey) {
        fitted.current = false;
        changeView({
          ...viewRef.current,
          x: viewRef.current.x - e.deltaX,
          y: viewRef.current.y - e.deltaY,
        });
        return;
      }
      const rect = element.getBoundingClientRect();
      fitted.current = false;
      const scale = clamp(viewRef.current.scale * Math.exp(-e.deltaY * 0.0015), 0.03, 12);
      changeView(
        zoomAt(viewRef.current, { x: e.clientX - rect.left, y: e.clientY - rect.top }, scale),
      );
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [changeView, doc.surface]);
  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = svg.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  function begin(
    e: PointerEvent<SVGElement>,
    kind: Drag['kind'],
    target?: Target,
    noteId?: string,
    endpoint?: 'start' | 'end',
  ) {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    const start = local(e),
      imageStart = screenToImage(start, viewRef.current);
    if (space || hand || mode === 'view' || e.button === 1) kind = 'pan';
    else if (kind === 'create' && tool === 'stroke') kind = 'draw';
    if (
      (kind === 'create' || kind === 'draw') &&
      (imageStart.x < 0 ||
        imageStart.y < 0 ||
        imageStart.x >= doc.width ||
        imageStart.y >= doc.height)
    ) {
      onDismiss();
      return;
    }
    drag.current = {
      kind,
      tool,
      endpoint,
      start,
      last: start,
      imageStart,
      view: viewRef.current,
      target,
      noteId,
      add: e.shiftKey || adding,
      moved: false,
      points: [clampPoint(imageStart, doc.width, doc.height)],
    };
    svg.current?.setPointerCapture(e.pointerId);
    setDragging(true);
    if (noteId && kind !== 'pan') onSelect(noteId);
  }
  function drawnTarget(kind: Target['kind'], id: string, start: Point, end: Point): Target {
    if (kind === 'rect') return makeRectangle(id, start, end, doc.width, doc.height);
    if (kind === 'ellipse') return makeEllipse(id, start, end, doc.width, doc.height);
    if (kind === 'line') return makeLine(id, start, end, doc.width, doc.height);
    return { id, kind: 'point', ...clampPoint(start, doc.width, doc.height) };
  }
  function move(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    const point = local(e);
    d.last = point;
    if (Math.hypot(point.x - d.start.x, point.y - d.start.y) > 4) d.moved = true;
    if (d.kind === 'pan') {
      fitted.current = false;
      changeView({
        ...d.view,
        x: d.view.x + point.x - d.start.x,
        y: d.view.y + point.y - d.start.y,
      });
      return;
    }
    const end = screenToImage(point, d.view);
    if (d.kind === 'draw') {
      const p = clampPoint(end, doc.width, doc.height),
        last = d.points.at(-1)!;
      if (d.points.length < 4096 && Math.hypot(p.x - last.x, p.y - last.y) * d.view.scale >= 2)
        d.points.push(p);
      setPreview({ target: makeStroke('draft', d.points, doc.width, doc.height) });
      return;
    }
    if (d.kind === 'create' && d.moved)
      setPreview({ target: drawnTarget(d.tool, 'draft', d.imageStart, end) });
    else if (d.kind === 'move' && d.target && d.moved)
      setPreview({
        noteId: d.noteId,
        target: moveTarget(
          d.target,
          end.x - d.imageStart.x,
          end.y - d.imageStart.y,
          doc.width,
          doc.height,
        ),
      });
    else if (
      d.kind === 'resize' &&
      (d.target?.kind === 'rect' || d.target?.kind === 'ellipse') &&
      d.moved
    )
      setPreview({
        noteId: d.noteId,
        target: {
          ...d.target,
          width: Math.round(clamp(end.x - d.target.x, 1, doc.width - d.target.x)),
          height: Math.round(clamp(end.y - d.target.y, 1, doc.height - d.target.y)),
        },
      });
    else if (d.kind === 'endpoint' && d.target?.kind === 'line' && d.moved) {
      const line = makeLine(
        d.target.id,
        d.endpoint === 'start' ? end : d.target.start,
        d.endpoint === 'end' ? end : d.target.end,
        doc.width,
        doc.height,
      );
      if (line.kind === 'line') setPreview({ noteId: d.noteId, target: line });
    }
  }
  function end(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    const point = screenToImage(local(e), d.view);
    if (
      d.kind === 'pan' &&
      !d.moved &&
      live &&
      !space &&
      e.button === 0 &&
      d.imageStart.x >= 0 &&
      d.imageStart.y >= 0 &&
      d.imageStart.x < doc.width &&
      d.imageStart.y < doc.height
    )
      onInteract?.({ kind: 'click', x: Math.round(d.imageStart.x), y: Math.round(d.imageStart.y) });
    if (d.kind === 'draw') {
      d.points.push(clampPoint(point, doc.width, doc.height));
      onCreate(makeStroke(crypto.randomUUID(), d.points, doc.width, doc.height), d.add);
    } else if (d.kind === 'create' && (d.moved || d.tool === 'point')) {
      const id = crypto.randomUUID();
      onCreate(drawnTarget(d.tool, id, d.imageStart, point), d.add);
    } else if (d.noteId && d.target && d.moved) {
      if (d.kind === 'move')
        onTarget(
          d.noteId,
          moveTarget(
            d.target,
            point.x - d.imageStart.x,
            point.y - d.imageStart.y,
            doc.width,
            doc.height,
          ),
        );
      else if (d.kind === 'resize' && (d.target.kind === 'rect' || d.target.kind === 'ellipse'))
        onTarget(d.noteId, {
          ...d.target,
          width: Math.round(clamp(point.x - d.target.x, 1, doc.width - d.target.x)),
          height: Math.round(clamp(point.y - d.target.y, 1, doc.height - d.target.y)),
        });
      else if (d.kind === 'endpoint' && d.target.kind === 'line') {
        const line = makeLine(
          d.target.id,
          d.endpoint === 'start' ? point : d.target.start,
          d.endpoint === 'end' ? point : d.target.end,
          doc.width,
          doc.height,
        );
        if (line.kind === 'line') onTarget(d.noteId, line);
      }
    }
    drag.current = null;
    setPreview(null);
    setDragging(false);
    if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId);
  }
  function renderTarget(original: Target, noteId: string, index: number) {
    const t =
      preview?.noteId === noteId && preview.target.id === original.id ? preview.target : original;
    const selected = noteId === activeId,
      s = view.scale,
      color = selected ? '#c64b28' : '#d36a47';
    const bx =
        t.kind === 'rect' || t.kind === 'ellipse'
          ? t.x + t.width
          : t.kind === 'stroke'
            ? t.points[0].x
            : t.kind === 'line'
              ? (t.start.x + t.end.x) / 2
              : t.x,
      by =
        t.kind === 'stroke' ? t.points[0].y : t.kind === 'line' ? (t.start.y + t.end.y) / 2 : t.y;
    return (
      <g key={t.id} data-target-id={t.id}>
        {t.kind === 'stroke' || t.kind === 'line' ? (
          <>
            <path
              data-testid={t.kind === 'stroke' ? 'freehand-stroke' : 'line-shape'}
              d={strokePath(t.kind === 'stroke' ? t.points : [t.start, t.end])}
              fill="none"
              stroke={color}
              strokeWidth={selected ? 3 : 2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            <path
              d={strokePath(t.kind === 'stroke' ? t.points : [t.start, t.end])}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              vectorEffect="non-scaling-stroke"
              pointerEvents={tool === 'point' && !adding ? 'stroke' : 'none'}
              className="target-shape"
              onPointerDown={(e) => begin(e, 'move', t, noteId)}
            />
          </>
        ) : t.kind === 'ellipse' ? (
          <ellipse
            data-testid="ellipse-shape"
            cx={t.x + t.width / 2}
            cy={t.y + t.height / 2}
            rx={t.width / 2}
            ry={t.height / 2}
            fill={selected ? '#c64b2818' : '#c64b2808'}
            stroke={color}
            strokeWidth={selected ? 2 : 1.5}
            vectorEffect="non-scaling-stroke"
            pointerEvents={tool === 'point' && !adding ? 'auto' : 'none'}
            onPointerDown={(e) => begin(e, 'move', t, noteId)}
            className="target-shape"
          />
        ) : t.kind === 'rect' ? (
          <rect
            x={t.x}
            y={t.y}
            width={t.width}
            height={t.height}
            fill={selected ? '#c64b2818' : '#c64b2808'}
            stroke={color}
            strokeWidth={selected ? 2 : 1.5}
            vectorEffect="non-scaling-stroke"
            rx={2 / s}
            onPointerDown={(e) => begin(e, 'move', t, noteId)}
            className="target-shape"
            pointerEvents={tool === 'point' && !adding ? 'auto' : 'none'}
          />
        ) : (
          <circle cx={t.x} cy={t.y} r={20 / s} fill="#c64b2814" pointerEvents="none" />
        )}
        <g
          role="button"
          tabIndex={0}
          aria-label={tr('m097', { p0: index + 1 })}
          className="target-badge"
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSelect(noteId);
          }}
          onPointerDown={(e) => begin(e, 'move', t, noteId)}
        >
          <circle
            cx={bx}
            cy={by}
            r={14 / s}
            fill={color}
            stroke="#ffffff"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={bx}
            y={by}
            dominantBaseline="central"
            textAnchor="middle"
            fill="white"
            fontSize={12 / s}
            fontWeight="700"
            pointerEvents="none"
          >
            {index + 1}
          </text>
        </g>
        {selected && (t.kind === 'rect' || t.kind === 'ellipse') && (
          <rect
            aria-label={tr('m098')}
            x={t.x + t.width - 5 / s}
            y={t.y + t.height - 5 / s}
            width={10 / s}
            height={10 / s}
            rx={2 / s}
            fill="white"
            stroke={color}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            className="resize-handle"
            onPointerDown={(e) => begin(e, 'resize', t, noteId)}
          />
        )}
        {selected &&
          t.kind === 'line' &&
          (['start', 'end'] as const).map((endpoint) => (
            <circle
              key={endpoint}
              data-endpoint={endpoint}
              aria-label={endpoint === 'start' ? tr('m099') : tr('m100')}
              cx={t[endpoint].x}
              cy={t[endpoint].y}
              r={5 / s}
              fill="white"
              stroke={color}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              className="line-endpoint"
              onPointerDown={(e) => begin(e, 'endpoint', t, noteId, endpoint)}
            />
          ))}
      </g>
    );
  }
  const anchor = active?.targets.at(-1);
  const anchorX = anchor
    ? view.x +
      (anchor.kind === 'rect' || anchor.kind === 'ellipse'
        ? anchor.x + anchor.width
        : anchor.kind === 'stroke'
          ? anchor.points.at(-1)!.x
          : anchor.kind === 'line'
            ? anchor.end.x
            : anchor.x) *
        view.scale
    : 0;
  const anchorY = anchor
    ? view.y +
      (anchor.kind === 'stroke'
        ? anchor.points.at(-1)!.y
        : anchor.kind === 'line'
          ? anchor.end.y
          : anchor.y) *
        view.scale
    : 0;
  const editorX = clamp(anchorX + 24, 18, size.width - 326);
  const editorY = clamp(anchorY + 24, 18, size.height - 248);
  return (
    <div
      className={`stage ${space || hand || mode === 'view' ? 'pan-mode' : ''} ${dragging ? 'dragging' : ''} ${adding ? 'adding-mode' : ''}`}
      ref={stage}
      data-testid="stage"
    >
      <svg
        ref={svg}
        className="image-canvas"
        aria-label={tr('m101')}
        onPointerDown={(e) => begin(e, 'create')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={() => {
          drag.current = null;
          setPreview(null);
          setDragging(false);
        }}
      >
        <g
          transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}
          data-testid="image-transform"
          data-scale={view.scale}
          data-x={view.x}
          data-y={view.y}
        >
          <rect width={doc.width} height={doc.height} fill="white" className="image-shadow" />
          <image
            href={imageUrl}
            width={doc.width}
            height={doc.height}
            preserveAspectRatio="none"
            pointerEvents="none"
          />
          {mode === 'edit' &&
            doc.notes.map((note, i) =>
              note.targets.map((t) => renderTarget(t, note.id, i + numberOffset)),
            )}
          {preview && !preview.noteId && preview.target.kind === 'rect' && (
            <rect
              x={preview.target.x}
              y={preview.target.y}
              width={preview.target.width}
              height={preview.target.height}
              fill="#c64b2817"
              stroke="#c64b28"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
          {preview && !preview.noteId && preview.target.kind === 'stroke' && (
            <path
              d={strokePath(preview.target.points)}
              fill="none"
              stroke="#c64b28"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
          {preview && !preview.noteId && preview.target.kind === 'ellipse' && (
            <ellipse
              cx={preview.target.x + preview.target.width / 2}
              cy={preview.target.y + preview.target.height / 2}
              rx={preview.target.width / 2}
              ry={preview.target.height / 2}
              fill="#c64b2817"
              stroke="#c64b28"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
          {preview && !preview.noteId && preview.target.kind === 'line' && (
            <path
              d={strokePath([preview.target.start, preview.target.end])}
              fill="none"
              stroke="#c64b28"
              strokeWidth={2.5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
        </g>
      </svg>
      <div className="view-controls" aria-label={tr('m102')}>
        {mode === 'edit' &&
          (
            [
              ['point', tr('m107'), CircleDot, tr('m108')],
              ['rect', tr('m103'), Square, tr('m104')],
              ['ellipse', tr('m105'), Circle, tr('m106')],
              ['line', tr('m109'), Slash, tr('m110')],
              ['stroke', tr('m111'), Pencil, tr('m112')],
            ] as const
          ).map(([kind, label, Icon, title]) => (
            <button
              key={kind}
              className={`shape-tool ${!hand && tool === kind ? 'selected' : ''}`}
              aria-label={tr('m113', { p0: label })}
              aria-pressed={!hand && tool === kind}
              title={title}
              onClick={() => {
                setTool(kind);
                setHand(false);
              }}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        <span className="tool-divider" />
        <button
          className={hand || mode === 'view' ? 'selected' : ''}
          aria-label={tr('m114')}
          title={tr('m115')}
          onClick={() => {
            setHand(true);
          }}
        >
          <Hand size={17} />
        </button>
        <span className="tool-divider" />
        <button
          aria-label={tr('m116')}
          onClick={() => {
            fitted.current = false;
            changeView(
              zoomAt(
                viewRef.current,
                { x: size.width / 2, y: size.height / 2 },
                clamp(viewRef.current.scale / 1.25, 0.03, 12),
              ),
            );
          }}
        >
          <Minus size={16} />
        </button>
        <span className="zoom-value">{Math.round(view.scale * 100)}%</span>
        <button
          aria-label={tr('m117')}
          onClick={() => {
            fitted.current = false;
            changeView(
              zoomAt(
                viewRef.current,
                { x: size.width / 2, y: size.height / 2 },
                clamp(viewRef.current.scale * 1.25, 0.03, 12),
              ),
            );
          }}
        >
          <Plus size={16} />
        </button>
        <span className="tool-divider" />
        {doc.surface && (
          <button
            aria-label={tr('docFitWidth')}
            title={tr('docFitWidth')}
            onClick={() => {
              fitted.current = true;
              setFitMode('width');
              const scale = Math.max(0.02, Math.min(4, (size.width - 64) / doc.width));
              changeView({ scale, x: (size.width - doc.width * scale) / 2, y: 32 });
            }}
          >
            ↔
          </button>
        )}
        <button
          aria-label={tr('m118')}
          title={tr('m118')}
          onClick={() => {
            fitted.current = true;
            setFitMode('page');
            changeView(fitView(doc.width, doc.height, size.width, size.height - 48));
          }}
        >
          <Maximize size={17} />
        </button>
      </div>
      {!active && mode === 'edit' && (
        <div className="canvas-hint">
          <span className="tiny-dot" />
          {live
            ? tr('docLiveHint')
            : hand || space
              ? tr('m119')
              : {
                  point: tr('m120'),
                  rect: tr('m121'),
                  ellipse: tr('m122'),
                  line: tr('m123'),
                  stroke: tr('m124'),
                }[tool]}
        </div>
      )}
      {adding && (
        <div className="adding-hint">
          <Crosshair size={15} />
          {tr('m125')}
          <button onClick={onAdding} aria-label={tr('m126')}>
            <X size={14} />
          </button>
        </div>
      )}
      {active && !dragging && mode === 'edit' && (
        <div
          className="floating-note"
          style={{ left: editorX, top: editorY }}
          data-testid="note-editor"
        >
          <div className="note-top">
            <span className="number-badge">
              {doc.notes.findIndex((n) => n.id === activeId) + 1 + numberOffset}
            </span>
            <strong>{tr('m127')}</strong>
            <span className="target-count">{tr('m040', { p0: active.targets.length })}</span>
            <button className="icon-button small" aria-label={tr('m130')} onClick={onDismiss}>
              <X size={15} />
            </button>
          </div>
          <textarea
            ref={editor}
            aria-label={tr('m131')}
            placeholder={tr('m132')}
            value={active.text}
            maxLength={20000}
            onChange={(e) => onText(active.id, e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
              if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                onDismiss();
              }
            }}
          />
          <div className="note-actions">
            <button className={`text-button ${adding ? 'active' : ''}`} onClick={onAdding}>
              <Plus size={14} />
              {tr('m133')}
            </button>
            <button
              className="icon-button small delete"
              aria-label={tr('m134')}
              onClick={() => onDelete(active.id)}
            >
              <Trash2 size={14} />
            </button>
            <button className="done-button" onClick={onDismiss}>
              <Check size={14} />
              {tr('m135')}
              <kbd>↵</kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
