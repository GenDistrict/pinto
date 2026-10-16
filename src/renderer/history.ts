import { useCallback, useRef, useState } from 'react';
import type { Document } from '../core/model';

export function useDocumentHistory() {
  const [doc, setDoc] = useState<Document | null>(null);
  const ref = useRef<Document | null>(null);
  const past = useRef<Document[]>([]),
    future = useRef<Document[]>([]);
  const grouping = useRef({ key: '', at: 0 });
  const perImage = useRef(new Map<string, { past: Document[]; future: Document[] }>());
  const [, redraw] = useState(0);
  const reset = useCallback((value: Document | null, remember = false) => {
    if (remember && ref.current)
      perImage.current.set(ref.current.id, { past: past.current, future: future.current });
    if (!remember) perImage.current.clear();
    const previous = value ? perImage.current.get(value.id) : undefined;
    ref.current = value;
    setDoc(value);
    past.current = previous?.past || [];
    future.current = previous?.future || [];
    grouping.current.key = '';
    redraw((n) => n + 1);
  }, []);
  const update = useCallback((transform: (value: Document) => Document, group = '') => {
    const current = ref.current;
    if (!current) return;
    const next = transform(current);
    if (next === current) return;
    const time = Date.now();
    if (!group || group !== grouping.current.key || time - grouping.current.at > 1000) {
      past.current.push(current);
      if (past.current.length > 100) past.current.shift();
    }
    grouping.current = { key: group, at: time };
    future.current = [];
    next.updatedAt = new Date().toISOString();
    ref.current = next;
    setDoc(next);
  }, []);
  const undo = useCallback(() => {
    if (!past.current.length || !ref.current) return;
    future.current.push(ref.current);
    const value = past.current.pop()!;
    ref.current = value;
    setDoc(value);
    grouping.current.key = '';
  }, []);
  const redo = useCallback(() => {
    if (!future.current.length || !ref.current) return;
    past.current.push(ref.current);
    const value = future.current.pop()!;
    ref.current = value;
    setDoc(value);
    grouping.current.key = '';
  }, []);
  return {
    doc,
    ref,
    reset,
    update,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
