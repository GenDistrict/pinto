import { useEffect, useState } from 'react';
import { ImagePlus, X, Trash2 } from 'lucide-react';
import type { CollectionView, SharedInstruction } from '../core/collection';
import { tr } from '../core/i18n.mjs';

export function CollectionPanel({
  view,
  active,
  busy,
  onSwitch,
  onRemove,
  onAdd,
  onRules,
  readOnly = false,
}: {
  view: CollectionView;
  active: string;
  busy: boolean;
  onSwitch: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onRules: (rules: SharedInstruction[]) => void;
  readOnly?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>(view.images.map((i) => i.id));
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setSelected((s) => s.filter((id) => view.images.some((i) => i.id === id)));
  }, [view.images]);
  const label = (id: string) =>
    tr(view.images.find((i) => i.id === id)?.kind ? 'docItem' : 'batchImage', {
      number: view.images.find((i) => i.id === id)?.number,
    });
  const update = (id: string, patch: Partial<SharedInstruction>) =>
    onRules(view.collection.instructions.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <section
      className={`collection-panel${readOnly ? ' is-readonly' : ''}`}
      aria-label={tr('batchShared')}
    >
      <div className="image-strip">
        {view.images.map((image) => (
          <div key={image.id} className={`image-tile ${image.id === active ? 'active' : ''}`}>
            <input
              type="checkbox"
              aria-label={tr('batchSelect', { number: image.number })}
              checked={selected.includes(image.id)}
              disabled={busy}
              onChange={(e) =>
                setSelected((s) =>
                  e.target.checked ? [...s, image.id] : s.filter((id) => id !== image.id),
                )
              }
            />
            <button
              className="image-tile-open"
              disabled={busy}
              aria-label={tr('batchSwitch', { number: image.number })}
              aria-current={image.id === active ? 'true' : undefined}
              onClick={() => onSwitch(image.id)}
            >
              <img src={image.thumbnail} alt="" />
              <span>
                <b>{label(image.id)}</b>
                <small title={image.name}>{image.name}</small>
              </span>
            </button>
            <button
              className="icon-button small"
              disabled={busy || view.images.length < 2}
              aria-label={tr('batchRemove', { number: image.number })}
              onClick={() => onRemove(image.id)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <button className="secondary-button" disabled={busy} onClick={onAdd}>
          <ImagePlus size={16} />
          {tr('batchAdd')}
        </button>
      </div>
      <div className="collection-actions">
        <span title={tr('batchHint')}>{tr('batchSelected', { count: selected.length })}</span>
        <button disabled={busy} onClick={() => setSelected(view.images.map((i) => i.id))}>
          {tr('batchSelectAll')}
        </button>
        <button disabled={busy} onClick={() => setSelected([])}>
          {tr('batchSelectNone')}
        </button>
        <button
          disabled={busy || !selected.length}
          onClick={() => {
            onRules([
              ...view.collection.instructions,
              { id: crypto.randomUUID(), imageIds: selected, text: '' },
            ]);
            setExpanded(true);
          }}
        >
          {tr('batchNewRule')}
        </button>
      </div>
      {view.collection.instructions.length > 0 && (
        <details open={expanded} onToggle={(e) => setExpanded(e.currentTarget.open)}>
          <summary>
            {tr('batchShared')} ({view.collection.instructions.length})
          </summary>
          <div className="shared-rules">
            {view.collection.instructions.map((rule) => (
              <div className="shared-rule" key={rule.id}>
                <div>
                  <strong>
                    {tr('batchApply', { images: rule.imageIds.map(label).join(', ') })}
                  </strong>
                  <button
                    disabled={busy || !selected.length}
                    onClick={() => update(rule.id, { imageIds: selected })}
                  >
                    {tr('batchRuleTargets')}
                  </button>
                  <select
                    aria-label={tr('batchRuleReference')}
                    value={rule.referenceId || ''}
                    disabled={busy}
                    onChange={(e) => update(rule.id, { referenceId: e.target.value || undefined })}
                  >
                    <option value="">{tr('batchNoReference')}</option>
                    {view.images.map((i) => (
                      <option key={i.id} value={i.id}>
                        {label(i.id)} — {i.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-button small"
                    disabled={busy}
                    aria-label={tr('batchRuleRemove')}
                    onClick={() =>
                      onRules(view.collection.instructions.filter((r) => r.id !== rule.id))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <textarea
                  aria-label={tr('batchRuleText')}
                  placeholder={tr('batchRulePlaceholder')}
                  value={rule.text}
                  maxLength={20000}
                  disabled={busy}
                  onChange={(e) => update(rule.id, { text: e.target.value })}
                />
              </div>
            ))}
          </div>
          <small>{tr('batchRuleSaved')}</small>
        </details>
      )}
    </section>
  );
}
