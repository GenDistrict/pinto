import { tr, setLocale, getLocale } from '../core/i18n.mjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Clipboard,
  Code2,
  Copy,
  FileImage,
  FolderOpen,
  HelpCircle,
  ImagePlus,
  List,
  LoaderCircle,
  MapPin,
  MoreHorizontal,
  Redo2,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type {} from '../core/api';
import {
  instructionCount,
  targetDescription,
  type AppInfo,
  type Document,
  type ImageSource,
  type OpenDocument,
  type Recent,
  type Target,
} from '../core/model';
import { useDocumentHistory } from './history';
import { Canvas } from './Canvas';
import { CollectionPanel } from './CollectionPanel';
import { preparePdf } from './document-adapters';
import { surfaceGroupKey, type LiveAction } from '../core/surfaces';
import { MAX_IMAGES, type CollectionView, type SharedInstruction } from '../core/collection';

function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 68" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M22 5H43C54 5 61 13 61 24V36C61 48 53 55 42 55H26L11 64V52C5 48 2 42 2 34V25C2 13 10 5 22 5Z M42 30A10 10 0 1 0 22 30A10 10 0 1 0 42 30Z M36 30A4 4 0 1 0 28 30A4 4 0 1 0 36 30Z"
      />
    </svg>
  );
}
const errorMessage = (error: unknown) =>
  String(error instanceof Error ? error.message : error).replace(
    /^Error invoking remote method '[^']+': (Error: )?/,
    '',
  );
const isTextInput = (target: EventTarget | null) =>
  target instanceof HTMLElement && !!target.closest('textarea,input,[contenteditable="true"]');
async function normalizeImage(source: ImageSource): Promise<string> {
  const image = new Image();
  image.src = source.dataUrl;
  await image.decode();
  if (
    image.naturalWidth > 16000 ||
    image.naturalHeight > 16000 ||
    image.naturalWidth * image.naturalHeight > 64_000_000
  )
    throw new Error(tr('m001'));
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(tr('m002'));
  ctx.drawImage(image, 0, 0);
  const result = canvas.toDataURL('image/png');
  canvas.width = 0;
  canvas.height = 0;
  if (!result.startsWith('data:image/png')) throw new Error(tr('m003'));
  return result;
}

export function App() {
  const history = useDocumentHistory(),
    { doc, ref: docRef, reset, update, undo, redo } = history;
  const [imageUrl, setImageUrl] = useState(''),
    [info, setInfo] = useState<AppInfo | null>(null),
    [recent, setRecent] = useState<Recent[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null),
    [adding, setAdding] = useState(false),
    [sidebar, setSidebar] = useState(false);
  const [busy, setBusy] = useState(''),
    [copying, setCopying] = useState(false),
    [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null),
    [menu, setMenu] = useState(false),
    [help, setHelp] = useState(false),
    [recentsOpen, setRecentsOpen] = useState(false);
  const [drop, setDrop] = useState(false);
  const [changingLanguage, setChangingLanguage] = useState(false);
  const [viewMode, setViewMode] = useState<'view' | 'edit'>('edit');
  const [pageList, setPageList] = useState(true);
  const [webDialog, setWebDialog] = useState(false),
    [webUrl, setWebUrl] = useState('http://localhost:3000');
  const [collection, setCollection] = useState<CollectionView | null>(null);
  const collectionRef = useRef<CollectionView | null>(null);
  const sharedQueue = useRef<Promise<unknown>>(Promise.resolve());
  const operationDone = useRef<Promise<void>>(Promise.resolve());
  const showCollection = useCallback((value: CollectionView | null) => {
    collectionRef.current = value;
    setCollection(value);
  }, []);
  const refreshCollection = useCallback(
    async () => showCollection(await window.pinto.collection()),
    [showCollection],
  );
  const changeShared = (instructions: SharedInstruction[]) => {
    const value = collectionRef.current;
    if (!value) return;
    showCollection({ ...value, collection: { ...value.collection, instructions } });
    const next = sharedQueue.current
      .catch(() => {})
      .then(() => window.pinto.saveSharedInstructions(value.collection.id, instructions));
    sharedQueue.current = next;
    setSaveState('saving');
    void next
      .then(() => {
        if (sharedQueue.current === next) setSaveState('saved');
      })
      .catch((e) => {
        setSaveState('error');
        notify(errorMessage(e), true);
      });
  };
  const multi =
    !!collection && (collection.images.length > 1 || collection.collection.instructions.length > 0);
  const documentGroup =
    !!doc?.surface &&
    !!collection &&
    collection.images.every(
      (i) =>
        i.kind === doc.surface!.kind &&
        surfaceGroupKey(i.kind, i.source || '') ===
          surfaceGroupKey(doc.surface!.kind, doc.surface!.path),
    );
  const pdfGroup = documentGroup && doc?.surface?.kind === 'pdf';
  const live = doc?.surface?.kind === 'html';
  const webDocument = live || doc?.surface?.kind === 'webapp';
  const noteRows = doc
    ? documentGroup && collection
      ? collection.images.flatMap((image) =>
          (image.id === doc.id ? doc.notes : image.notes || [])
            .filter((n) => n.text.trim())
            .map((note) => ({ note, documentId: image.id, page: image.page, kind: image.kind })),
        )
      : doc.notes.map((note) => ({ note, documentId: doc.id, page: undefined, kind: undefined }))
    : [];
  const numberOffset =
    documentGroup && collection
      ? collection.images
          .slice(
            0,
            collection.images.findIndex((i) => i.id === doc?.id),
          )
          .reduce((n, i) => n + (i.notes || []).filter((note) => note.text.trim()).length, 0)
      : 0;
  const totalInstructions = collection
    ? collection.images.reduce(
        (n, i) => n + (i.id === doc?.id ? instructionCount(doc) : i.noteCount),
        0,
      ) + collection.collection.instructions.filter((r) => r.text.trim()).length
    : doc
      ? instructionCount(doc)
      : 0;
  const savedDoc = useRef<Document | null>(null),
    saveQueue = useRef<Promise<unknown>>(Promise.resolve()),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false),
    closingDocument = useRef(false),
    busyRef = useRef(false),
    copyingRef = useRef(false),
    booted = useRef(false);
  const command = info?.platform === 'darwin' ? '⌘' : 'Ctrl';
  useEffect(() => {
    document.documentElement.lang = getLocale();
    document.title = tr('uiTitle');
  }, [info?.locale]);
  const changeLanguage = async (locale: string) => {
    setChangingLanguage(true);
    try {
      const next = await window.pinto.setLanguage(locale);
      setLocale(next.locale);
      setInfo(next);
      setToast(null);
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      setChangingLanguage(false);
    }
  };
  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), error ? 7000 : 3200);
  }, []);
  const save = useCallback(
    async (value: Document) => {
      if (savedDoc.current === value) return;
      setSaveState('saving');
      const next = saveQueue.current.catch(() => {}).then(() => window.pinto.saveDocument(value));
      saveQueue.current = next;
      try {
        await next;
        savedDoc.current = value;
        if (docRef.current === value) setSaveState('saved');
      } catch (error) {
        setSaveState('error');
        throw error;
      }
    },
    [docRef],
  );
  const flush = useCallback(async () => {
    if (docRef.current) await save(docRef.current);
    await saveQueue.current;
    await sharedQueue.current.catch(async () => {
      const value = collectionRef.current;
      if (!value) throw new Error(tr('batchInvalid'));
      const retry = window.pinto.saveSharedInstructions(
        value.collection.id,
        value.collection.instructions,
      );
      sharedQueue.current = retry;
      await retry;
    });
  }, [docRef, save]);
  const opened = useCallback(
    (value: OpenDocument) => {
      savedDoc.current = value.document;
      reset(value.document, true);
      setImageUrl(value.imageUrl);
      setActiveId(null);
      setAdding(false);
      setSaveState('saved');
    },
    [reset],
  );
  const refreshRecent = useCallback(async () => setRecent(await window.pinto.recent()), []);
  const importSource = useCallback(
    async (source: ImageSource, append = false) => {
      if (source.kind === 'pdf') {
        let first: string | undefined;
        let index = 0;
        try {
          for await (const page of preparePdf(source)) {
            if (
              index === 0 &&
              (append ? collectionRef.current?.images.length || 0 : 0) +
                (page.surface!.pageCount || 0) >
                MAX_IMAGES
            )
              throw new Error(tr('docPdfLimit'));
            setBusy(
              tr('docPdfProgress', { page: page.surface!.page, count: page.surface!.pageCount }),
            );
            const value = await window.pinto.createDocument({
              token: source.token,
              ...page,
              append: append || index > 0,
            });
            if (!first) first = value.document.id;
            opened(value);
            index++;
          }
        } finally {
          if (first) opened(await window.pinto.activateImage(first));
          await refreshCollection();
          setInfo(await window.pinto.info());
          await refreshRecent();
        }
        return;
      }
      const dataUrl = await normalizeImage(source);
      opened(await window.pinto.createDocument({ token: source.token, dataUrl, append }));
      await refreshCollection();
      setInfo(await window.pinto.info());
      await refreshRecent();
    },
    [opened, refreshRecent, refreshCollection],
  );
  const operation = useCallback(
    async (message: string, fn: () => Promise<void>) => {
      if (busyRef.current || copyingRef.current) return;
      let finish!: () => void;
      operationDone.current = new Promise<void>((resolve) => {
        finish = resolve;
      });
      busyRef.current = true;
      setBusy(message);
      setMenu(false);
      try {
        await flush();
        await fn();
      } catch (error) {
        notify(errorMessage(error), true);
      } finally {
        busyRef.current = false;
        setBusy('');
        finish();
      }
    },
    [flush, notify],
  );
  const openImage = useCallback(
    () =>
      operation(tr('m004'), async () => {
        const files = await window.pinto.pickImages();
        let success = 0;
        const errors: string[] = [];
        for (const file of files) {
          try {
            await importSource(await window.pinto.readPickedImage(file.token), success > 0);
            success++;
          } catch (e) {
            errors.push(`${file.name}: ${errorMessage(e)}`);
          }
        }
        if (errors.length) notify(tr('batchImportErrors', { details: errors.join('\n') }), true);
      }),
    [operation, importSource, notify],
  );
  useEffect(
    () =>
      window.pinto.onOpenImages(() => {
        void openImage();
      }),
    [openImage],
  );
  const addImages = () =>
    operation(tr('m004'), async () => {
      const files = await window.pinto.pickImages();
      if (files.length + (collectionRef.current?.images.length || 0) > MAX_IMAGES)
        throw new Error(tr('batchLimit', { count: MAX_IMAGES }));
      const errors: string[] = [];
      for (const file of files) {
        try {
          await importSource(await window.pinto.readPickedImage(file.token), true);
        } catch (e) {
          errors.push(`${file.name}: ${errorMessage(e)}`);
        }
      }
      if (errors.length) notify(tr('batchImportErrors', { details: errors.join('\n') }), true);
    });
  const switchImage = (id: string) =>
    operation(tr('m011'), async () => {
      opened(await window.pinto.activateImage(id));
      await refreshCollection();
    });
  const removeImage = (id: string) =>
    operation(tr('m005'), async () => {
      opened(await window.pinto.removeImage(id));
      await refreshCollection();
    });
  const openNote = (documentId: string, noteId: string) => {
    if (documentId === docRef.current?.id) {
      setActiveId(noteId);
      setAdding(false);
      return;
    }
    void operation(tr('m011'), async () => {
      opened(await window.pinto.activateImage(documentId));
      await refreshCollection();
      setActiveId(noteId);
      setSidebar(true);
    });
  };
  const removeNote = (documentId: string, noteId: string) => {
    if (documentId === docRef.current?.id) {
      deleteNote(noteId);
      return;
    }
    void operation(tr('m011'), async () => {
      opened(await window.pinto.activateImage(documentId));
      update((value) => ({ ...value, notes: value.notes.filter((n) => n.id !== noteId) }));
      await save(docRef.current!);
      await refreshCollection();
      setSidebar(true);
    });
  };
  const interact = useCallback(
    (action?: LiveAction) => {
      if (!docRef.current) return;
      void operation(tr('m011'), async () => {
        const id = docRef.current!.id;
        opened(await window.pinto.interactDocument(id, action));
        await refreshCollection();
      });
    },
    [operation, docRef, opened, refreshCollection],
  );
  const openWeb = () =>
    operation(tr('docWebOpen'), async () => {
      opened(await window.pinto.openWebApp(webUrl));
      await refreshCollection();
      await refreshRecent();
      setWebDialog(false);
    });
  const navigationHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  navigationHandler.current = (e: KeyboardEvent) => {
    if (isTextInput(e.target) || e.ctrlKey || e.metaKey || composing.current) return;
    if (live && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      interact({ kind: 'key', key: e.key });
    } else if (
      pdfGroup &&
      collection &&
      ['PageUp', 'PageDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
    ) {
      e.preventDefault();
      const at = collection.images.findIndex((i) => i.id === docRef.current?.id);
      const next = at + (['PageUp', 'ArrowLeft'].includes(e.key) ? -1 : 1);
      if (collection.images[next]) void switchImage(collection.images[next].id);
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => navigationHandler.current(e);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const closeImage = async () => {
    if (busyRef.current || copyingRef.current || !docRef.current) return;
    closingDocument.current = true;
    try {
      await operation(tr('m005'), async () => {
        await window.pinto.closeDocument();
        reset(null);
        showCollection(null);
        savedDoc.current = null;
        setImageUrl('');
        setActiveId(null);
        setAdding(false);
        setSidebar(false);
        setSaveState('saved');
        await refreshRecent();
        notify(tr('m006'));
      });
    } finally {
      closingDocument.current = false;
    }
  };
  const pasteImage = useCallback(
    () =>
      operation(tr('m007'), async () => {
        const source = await window.pinto.clipboardImage();
        if (source) await importSource(source);
        else notify(tr('m008'));
      }),
    [operation, importSource, notify],
  );
  const openExample = () =>
    operation(tr('m009'), async () => {
      await importSource(await window.pinto.example());
      notify(tr('m010'));
    });
  const openRecent = (id: string) =>
    operation(tr('m011'), async () => {
      opened(await window.pinto.openRecent(id));
      await refreshCollection();
      setRecentsOpen(false);
    });
  const copy = useCallback(async () => {
    if (!docRef.current || busyRef.current || composing.current || copyingRef.current) return;
    copyingRef.current = true;
    setCopying(true);
    try {
      await flush();
      const value = docRef.current;
      if (!value) return;
      const count = await window.pinto.copyInstructions(value);
      setSaveState('saved');
      const images = collectionRef.current?.images.length || 1;
      notify(
        collectionRef.current?.images.some((i) => i.kind)
          ? tr('docCopied', { items: images, count })
          : images > 1
            ? tr('batchCopied', { images, count })
            : tr('m012', { p0: count }),
      );
    } catch (error) {
      notify(errorMessage(error), true);
    } finally {
      copyingRef.current = false;
      setCopying(false);
    }
  }, [docRef, flush, notify]);
  const dismiss = useCallback(() => {
    if (activeId)
      update((value) =>
        value.notes.some((n) => n.id === activeId && !n.text.trim())
          ? { ...value, notes: value.notes.filter((n) => n.id !== activeId) }
          : value,
      );
    setActiveId(null);
    setAdding(false);
  }, [activeId, update]);
  const deleteNote = useCallback(
    (id: string) => {
      update((value) => ({ ...value, notes: value.notes.filter((n) => n.id !== id) }));
      setActiveId(null);
      setAdding(false);
    },
    [update],
  );
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      try {
        const result = await window.pinto.bootstrap();
        setLocale(result.info.locale);
        setInfo(result.info);
        setRecent(result.recent);
        showCollection(result.collection || null);
        if (result.initialImage) await importSource(result.initialImage);
        else if (result.opened) opened(result.opened);
        if (result.warning) notify(result.warning, true);
        await window.pinto.ready();
      } catch (error) {
        notify(errorMessage(error), true);
        await window.pinto.ready();
      }
    })();
  }, [importSource, opened, notify]);
  useEffect(() => {
    if (!doc || doc === savedDoc.current) return;
    setSaveState('saving');
    const timer = setTimeout(() => {
      if (!closingDocument.current && docRef.current === doc)
        void save(doc).catch((error) => notify(errorMessage(error), true));
    }, 350);
    return () => clearTimeout(timer);
  }, [doc, docRef, save, notify]);
  useEffect(
    () =>
      window.pinto.onBeforeClose(() => {
        void operationDone.current
          .then(() => flush())
          .then(() => window.pinto.closeReady())
          .catch((error) => notify(tr('m013', { p0: errorMessage(error) }), true));
      }),
    [flush, notify],
  );
  useEffect(
    () =>
      window.pinto.onImage((source) => {
        void operation(tr('m004'), () => importSource(source));
      }),
    [operation, importSource],
  );
  useEffect(
    () =>
      window.pinto.onEdit((command) => {
        if (viewMode === 'view' && !isTextInput(document.activeElement)) return;
        if (isTextInput(document.activeElement)) document.execCommand(command);
        else if (command === 'undo') undo();
        else redo();
      }),
    [undo, redo, viewMode],
  );
  useEffect(() => {
    if (!help && !recentsOpen && !webDialog) return;
    const modal = document.querySelector<HTMLElement>('.modal');
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        modal.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,textarea,[tabindex="0"]',
        ),
      );
    focusables()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = focusables(),
        first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    modal.addEventListener('keydown', trap);
    return () => {
      modal.removeEventListener('keydown', trap);
      if (previous?.isConnected) previous.focus();
    };
  }, [help, recentsOpen, webDialog]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.isComposing || composing.current || e.keyCode === 229) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        void copy();
      } else if (
        viewMode === 'edit' &&
        mod &&
        e.key.toLowerCase() === 'z' &&
        !isTextInput(e.target)
      ) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (
        viewMode === 'edit' &&
        mod &&
        e.key.toLowerCase() === 'y' &&
        !isTextInput(e.target)
      ) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') {
        if (webDialog) setWebDialog(false);
        else if (help) setHelp(false);
        else if (menu) setMenu(false);
        else if (recentsOpen) setRecentsOpen(false);
        else if (adding) setAdding(false);
        else dismiss();
      } else if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        !isTextInput(e.target) &&
        activeId
      ) {
        e.preventDefault();
        deleteNote(activeId);
      }
    };
    const paste = (e: ClipboardEvent) => {
      if (isTextInput(e.target) && e.clipboardData?.types.includes('text/plain')) return;
      if (
        e.clipboardData?.items &&
        Array.from(e.clipboardData.items).some((item) => item.type.startsWith('image/'))
      ) {
        e.preventDefault();
        void pasteImage();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('paste', paste);
    };
  }, [
    copy,
    undo,
    redo,
    help,
    menu,
    recentsOpen,
    viewMode,
    webDialog,
    adding,
    dismiss,
    activeId,
    deleteNote,
    pasteImage,
  ]);
  useEffect(() => {
    if (activeId && !doc?.notes.some((n) => n.id === activeId)) {
      setActiveId(null);
      setAdding(false);
    }
  }, [doc, activeId]);
  function createTarget(target: Target, add: boolean) {
    const version =
      target.kind === 'ellipse' || target.kind === 'line' ? 3 : target.kind === 'stroke' ? 2 : 1;
    if (add && activeId && docRef.current?.notes.some((n) => n.id === activeId)) {
      update((value) => ({
        ...value,
        schemaVersion: Math.max(value.schemaVersion, version) as Document['schemaVersion'],
        notes: value.notes.map((n) =>
          n.id === activeId ? { ...n, targets: [...n.targets, target] } : n,
        ),
      }));
    } else {
      const id = crypto.randomUUID();
      update((value) => ({
        ...value,
        schemaVersion: Math.max(value.schemaVersion, version) as Document['schemaVersion'],
        notes: [...value.notes.filter((n) => n.text.trim()), { id, text: '', targets: [target] }],
      }));
      setActiveId(id);
      setAdding(false);
    }
  }
  const modifyGuide = async () => {
    try {
      await window.pinto.copyModificationGuide();
      notify(tr('m014'));
      setMenu(false);
    } catch (error) {
      notify(errorMessage(error), true);
    }
  };
  const chooseWorkspace = () =>
    operation(tr('m015'), async () => {
      const result = await window.pinto.chooseWorkspace(docRef.current?.id);
      if (result) {
        setInfo(result.info);
        if (result.opened) opened(result.opened);
        await refreshCollection();
        await refreshRecent();
        notify(tr('m016'));
      }
    });
  const exportText = () =>
    operation(tr('m017'), async () => {
      if (docRef.current && (await window.pinto.exportInstructions(docRef.current)))
        notify(tr('m018'));
    });
  const showRecents = async () => {
    try {
      await flush();
      await refreshRecent();
      setMenu(false);
      setRecentsOpen(true);
    } catch (error) {
      notify(errorMessage(error), true);
    }
  };
  return (
    <div
      className="app"
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) setDrop(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrop(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length)
          void operation(tr('m004'), async () => {
            if (files.length > MAX_IMAGES) throw new Error(tr('batchLimit', { count: MAX_IMAGES }));
            let success = 0;
            const errors: string[] = [];
            for (const file of files) {
              try {
                await importSource(await window.pinto.importFile(file), success > 0);
                success++;
              } catch (e) {
                errors.push(`${file.name}: ${errorMessage(e)}`);
              }
            }
            if (errors.length)
              notify(tr('batchImportErrors', { details: errors.join('\n') }), true);
          });
      }}
    >
      <header className="app-header">
        <div className="brand-lockup">
          <Mark />
          <span>PINTO</span>
        </div>
        <span className="header-divider" />
        <div className="file-heading">
          {doc ? (
            <>
              {doc.surface ? (
                <b className="file-kind-badge">{doc.surface.kind.toUpperCase()}</b>
              ) : (
                <FileImage size={16} />
              )}
              <span title={doc.surface?.path || doc.name}>{doc.name}</span>
              <small>
                {doc.width} × {doc.height}
              </small>
            </>
          ) : (
            <span className="brand-tagline">{tr('m019')}</span>
          )}
        </div>
        <div className="header-actions">
          {doc && (
            <div className="view-edit-switch" role="group" aria-label={tr('docMode')}>
              <button
                aria-pressed={viewMode === 'view'}
                onClick={() => {
                  dismiss();
                  setViewMode('view');
                }}
              >
                {tr('docView')}
              </button>
              <button aria-pressed={viewMode === 'edit'} onClick={() => setViewMode('edit')}>
                {tr('docEdit')}
              </button>
            </div>
          )}
          <button
            className="secondary-button open-header"
            aria-label={tr('m021')}
            onClick={() => void openImage()}
            title={tr('m020', { p0: command })}
          >
            <FolderOpen size={16} />
            <span>{tr('m021')}</span>
          </button>
          {doc && (
            <>
              <button
                className="icon-button"
                aria-label={tr('batchAdd')}
                title={tr('batchAdd')}
                disabled={!!busy || copying}
                onClick={() => void addImages()}
              >
                <ImagePlus size={18} />
              </button>
              <button
                className="secondary-button close-header"
                aria-label={tr(multi ? 'batchClose' : doc.surface ? 'docClose' : 'm023')}
                onClick={() => void closeImage()}
                disabled={!!busy || copying}
                title={tr('m022')}
              >
                <X size={16} />
                <span>{tr(multi ? 'batchClose' : doc.surface ? 'docClose' : 'm023')}</span>
              </button>
              <button
                className="icon-button"
                disabled={!history.canUndo || viewMode === 'view'}
                onClick={undo}
                aria-label={tr('m024')}
                title={`${command}+Z`}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="icon-button"
                disabled={!history.canRedo || viewMode === 'view'}
                onClick={redo}
                aria-label={tr('m025')}
              >
                <Redo2 size={17} />
              </button>
              <button
                className={`secondary-button notes-toggle ${sidebar ? 'on' : ''}`}
                onClick={() => setSidebar(!sidebar)}
                aria-label={tr('m026')}
                aria-expanded={sidebar}
              >
                <List size={16} />
                <span>
                  {tr('m027')}
                  {documentGroup ? noteRows.length : doc.notes.length}
                </span>
              </button>
              <button
                className="primary-button copy-button"
                disabled={!totalInstructions || copying || !!busy}
                onClick={() => void copy()}
              >
                {copying ? <LoaderCircle size={16} className="spin" /> : <Copy size={16} />}
                {tr(multi ? 'batchCopy' : 'm028')}
                <kbd>{command} ↵</kbd>
              </button>
            </>
          )}
          <button
            className="icon-button"
            aria-label={tr('m029')}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <MoreHorizontal size={21} />
          </button>
        </div>
      </header>
      {doc && multi && collection && !documentGroup && (
        <CollectionPanel
          key={collection.collection.id}
          readOnly={viewMode === 'view'}
          view={collection}
          active={doc.id}
          busy={!!busy || copying}
          onSwitch={(id) => void switchImage(id)}
          onRemove={(id) => void removeImage(id)}
          onAdd={() => void addImages()}
          onRules={changeShared}
        />
      )}
      {doc ? (
        <main className="editor-layout">
          {pdfGroup && pageList && collection && (
            <nav className="document-pages" aria-label={tr('docPages')}>
              {collection.images.map((i) => (
                <button
                  key={i.id}
                  aria-label={tr('docPage', { page: i.page })}
                  aria-current={i.id === doc.id ? 'page' : undefined}
                  disabled={!!busy}
                  onClick={() => void switchImage(i.id)}
                >
                  <img src={i.thumbnail} alt="" />
                  <span>{i.page}</span>
                  {i.noteCount > 0 && <b>{i.noteCount}</b>}
                </button>
              ))}
            </nav>
          )}
          <div className="workspace">
            {(pdfGroup || webDocument) && (
              <div className="document-controls">
                {doc.surface?.fullHeight && doc.surface.fullHeight > doc.height && (
                  <small className="document-clipped" role="status">
                    {tr('docClipped', { height: doc.height, total: doc.surface.fullHeight })}
                  </small>
                )}
                {pdfGroup && (
                  <button
                    className="page-edge-tab"
                    aria-label={tr('docPages')}
                    aria-expanded={pageList}
                    onClick={() => setPageList(!pageList)}
                  >
                    <List size={16} />
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label={tr('docPrevious')}
                  hidden={doc.surface?.kind === 'webapp'}
                  disabled={!!busy || (!live && collection!.images[0].id === doc.id)}
                  onClick={() => {
                    if (live) interact({ kind: 'key', key: 'ArrowLeft' });
                    else {
                      const at = collection!.images.findIndex((i) => i.id === doc.id);
                      void switchImage(collection!.images[at - 1].id);
                    }
                  }}
                >
                  ←
                </button>
                <span>
                  {tr(pdfGroup ? 'docPage' : 'docScreen', { page: doc.surface!.page })}
                  {pdfGroup ? ` / ${doc.surface!.pageCount}` : ''}
                </span>
                <button
                  className="icon-button"
                  aria-label={tr('docNext')}
                  hidden={doc.surface?.kind === 'webapp'}
                  disabled={!!busy || (!live && collection!.images.at(-1)!.id === doc.id)}
                  onClick={() => {
                    if (live) interact({ kind: 'key', key: 'ArrowRight' });
                    else {
                      const at = collection!.images.findIndex((i) => i.id === doc.id);
                      void switchImage(collection!.images[at + 1].id);
                    }
                  }}
                >
                  →
                </button>
                {webDocument && (
                  <button className="text-button" disabled={!!busy} onClick={() => interact()}>
                    {tr('docRefresh')}
                  </button>
                )}
                {doc.surface?.kind === 'webapp' && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void window.pinto
                        .openWebWindow(doc.id)
                        .catch((e) => notify(errorMessage(e), true))
                    }
                  >
                    {tr('docWebLogin')}
                  </button>
                )}
              </div>
            )}
            <Canvas
              key={doc.id}
              mode={viewMode}
              live={live}
              onInteract={interact}
              numberOffset={numberOffset}
              doc={doc}
              imageUrl={imageUrl}
              activeId={activeId}
              adding={adding}
              onSelect={(id) => {
                setActiveId(id);
                setAdding(false);
              }}
              onCreate={createTarget}
              onTarget={(noteId, target) =>
                update((value) => ({
                  ...value,
                  notes: value.notes.map((n) =>
                    n.id === noteId
                      ? { ...n, targets: n.targets.map((t) => (t.id === target.id ? target : t)) }
                      : n,
                  ),
                }))
              }
              onText={(id, text) =>
                update(
                  (value) => ({
                    ...value,
                    notes: value.notes.map((n) => (n.id === id ? { ...n, text } : n)),
                  }),
                  `text:${id}`,
                )
              }
              onDelete={deleteNote}
              onDismiss={dismiss}
              onAdding={() => setAdding(!adding)}
            />
            <div className="handoff-guide">
              <Copy size={18} />
              <div>
                <strong>{tr(doc.surface ? 'docSourceHint' : 'm030')}</strong>
                <p>
                  {tr(doc.surface ? (webDocument ? 'docNetworkHint' : 'docPdfLocation') : 'm031', {
                    page: doc.surface?.page,
                    count: doc.surface?.pageCount,
                    width: doc.width,
                    height: doc.height,
                  })}
                </p>
              </div>
              <button
                className="secondary-button"
                onClick={() =>
                  void window.pinto
                    .revealReference(doc.id)
                    .catch((e) => notify(errorMessage(e), true))
                }
                title={tr('m032')}
              >
                <FileImage size={15} />
                {tr('m033')}
              </button>
            </div>
          </div>
          {sidebar && viewMode === 'edit' && (
            <aside className="notes-panel">
              <div className="panel-header">
                <h2>
                  {tr('m034')}
                  <span>{noteRows.length}</span>
                </h2>
                <button
                  className="icon-button small"
                  aria-label={tr('m035')}
                  onClick={() => setSidebar(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="notes-scroll">
                {doc.globalInstruction.trim() && (
                  <details className="legacy-instruction">
                    <summary>{tr('m036')}</summary>
                    <textarea
                      aria-label={tr('m037')}
                      value={doc.globalInstruction}
                      maxLength={20000}
                      onChange={(e) =>
                        update(
                          (value) => ({ ...value, globalInstruction: e.target.value }),
                          'global',
                        )
                      }
                    />
                    <small>{tr('m038')}</small>
                  </details>
                )}
                {noteRows.length ? (
                  noteRows.map(({ note, documentId, page, kind }, i) => (
                    <div
                      className={`note-list-item ${activeId === note.id ? 'active' : ''}`}
                      key={note.id}
                    >
                      <button className="note-select" onClick={() => openNote(documentId, note.id)}>
                        <span className="number-badge">{i + 1}</span>
                        <div>
                          <p>{note.text.trim() || tr('m039')}</p>
                          <small>
                            {page && (
                              <>{tr(kind === 'pdf' ? 'docPage' : 'docScreen', { page })} · </>
                            )}
                            {note.targets.length > 1
                              ? tr('m040', { p0: note.targets.length })
                              : {
                                  rect: tr('m041'),
                                  ellipse: tr('m042'),
                                  point: tr('m043'),
                                  line: tr('m044'),
                                  stroke: tr('m045'),
                                }[note.targets[0]?.kind || 'point']}
                          </small>
                        </div>
                      </button>
                      <button
                        className="list-delete"
                        aria-label={tr('m046', { p0: i + 1 })}
                        onClick={() => removeNote(documentId, note.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                      <details>
                        <summary>{tr('m047')}</summary>
                        {note.targets.map((t) => (
                          <code key={t.id}>{targetDescription(t)}</code>
                        ))}
                      </details>
                    </div>
                  ))
                ) : (
                  <div className="panel-empty">
                    <MapPin size={26} />
                    <p>
                      {tr('m048')}
                      <br />
                      {tr('m049')}
                    </p>
                  </div>
                )}
              </div>
              <div className="panel-footer">
                <CheckCheck size={15} />
                <span>{tr('m050')}</span>
              </div>
            </aside>
          )}
        </main>
      ) : (
        <main className="welcome">
          <div className="welcome-kicker">
            <span className="tiny-dot" />
            POINT. NOTE. COPY.
          </div>
          <h1>{tr('m051')}</h1>
          <p className="welcome-description">
            {tr('m052')}
            <br />
            {tr('m053')}
          </p>
          <div className="welcome-card">
            <div className="demo-paper">
              <div className="paper-toolbar">
                <i />
                <i />
                <i />
                <span>{tr('demoTitle')}</span>
              </div>
              <div className="paper-content">
                <div className="paper-illustration">
                  <div className="mini-sheet back" />
                  <div className="mini-sheet front">
                    <i />
                    <i />
                    <i />
                  </div>
                  <span className="mini-ring" />
                </div>
                <div className="paper-lines">
                  <i />
                  <i />
                  <i />
                  <div className="mini-button">
                    {tr('demoStart')}
                    <span className="demo-badge">1</span>
                  </div>
                </div>
              </div>
              <div className="demo-comment">
                <span>1</span>
                {tr('m054')}
                <span className="demo-cursor">↖</span>
              </div>
            </div>
            <div className="welcome-buttons">
              <button className="primary-button" onClick={() => void openImage()}>
                <ImagePlus size={18} />
                {tr('docOpen')}
                <ArrowRight size={17} />
              </button>
              <button className="secondary-button" onClick={() => void pasteImage()}>
                <Clipboard size={17} />
                {tr('m056')}
                <kbd>{command} V</kbd>
              </button>
              <button className="secondary-button" onClick={() => setWebDialog(true)}>
                {tr('docWebOpen')}
              </button>
            </div>
            <p className="drop-instruction">
              {tr('docFilesHint')}
              <span>PNG · JPG · WEBP · PDF · HTML</span>
            </p>
          </div>
          <button className="sample-link" onClick={() => void openExample()}>
            {tr('m058')}
            <ChevronRight size={15} />
          </button>
          <p className="welcome-handoff">
            {tr('m030')}
            <br />
            {tr('m059')}
          </p>
          {recent.length > 0 && (
            <div className="recent-welcome">
              <div>
                <h2>{tr('m060')}</h2>
                <button onClick={() => void showRecents()}>
                  {tr('m061')}
                  <ChevronRight size={13} />
                </button>
              </div>
              <div className="recent-grid">
                {recent.slice(0, 3).map((r) => (
                  <button key={r.id} onClick={() => void openRecent(r.id)}>
                    <FileImage size={22} />
                    <span>
                      <strong>{r.name}</strong>
                      <small>
                        {r.itemCount && <>{tr('docItems', { count: r.itemCount })} · </>}
                        {r.imageCount && <>{tr('batchImages', { count: r.imageCount })} · </>}
                        {tr(r.noteCount === 1 ? 'notesOne' : 'notesOther', {
                          count: r.noteCount,
                        })}{' '}
                        · {r.width} × {r.height}
                      </small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>
      )}
      <footer className="status-bar">
        <span className={`save-status ${saveState}`}>
          {doc ? (
            saveState === 'saving' ? (
              <>
                <LoaderCircle size={12} className="spin" />
                {tr('m063')}
              </>
            ) : saveState === 'error' ? (
              <button onClick={() => void flush().catch((e) => notify(errorMessage(e), true))}>
                {tr('m064')}
              </button>
            ) : (
              <>
                <Check size={12} />
                {tr('m065')}
              </>
            )
          ) : (
            <>
              <span className="tiny-dot" />
              {tr('m066')}
            </>
          )}
        </span>
        <select
          className="language-select"
          aria-label="Language / Idioma / 언어"
          value={info?.locale || getLocale()}
          disabled={!info || !!busy || copying || changingLanguage}
          onChange={(event) => void changeLanguage(event.target.value)}
        >
          <option value="ko">한국어</option>
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
        <button className="help-link" onClick={() => setHelp(true)}>
          <HelpCircle size={13} />
          {tr('m067')}
        </button>
      </footer>
      {webDialog && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-label={tr('docWebOpen')}>
            <h2>{tr('docWebOpen')}</h2>
            <p>{tr('docWebHint')}</p>
            <input
              className="web-url-input"
              aria-label={tr('docWebUrl')}
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void openWeb();
              }}
            />
            <p>{tr('docNetworkHint')}</p>
            <div className="welcome-buttons">
              <button className="secondary-button" onClick={() => setWebDialog(false)}>
                {tr('m077')}
              </button>
              <button className="primary-button" onClick={() => void openWeb()}>
                {tr('docWebOpen')}
              </button>
            </div>
          </section>
        </div>
      )}
      {menu && (
        <>
          <div className="menu-scrim" onClick={() => setMenu(false)} />
          <div className="app-menu">
            <button
              onClick={() => {
                setMenu(false);
                setWebDialog(true);
              }}
            >
              <FolderOpen size={16} />
              {tr('docWebOpen')}
            </button>
            <button onClick={() => void showRecents()}>
              <FileImage size={16} />
              {tr('m068')}
            </button>
            {doc?.surface && (
              <button
                onClick={() => {
                  setMenu(false);
                  void window.pinto
                    .openOriginal(doc.id)
                    .catch((e) => notify(errorMessage(e), true));
                }}
              >
                <FolderOpen size={16} />
                {tr('docOpenOriginal')}
              </button>
            )}
            <button disabled={!doc} onClick={() => void exportText()}>
              <ArrowDownToLine size={16} />
              {tr('m069')}
            </button>
            <button onClick={() => void chooseWorkspace()}>
              <FolderOpen size={16} />
              {tr('m070')}
            </button>
            {doc && (
              <button
                onClick={() => {
                  void window.pinto
                    .revealReference(doc.id)
                    .catch((e) => notify(errorMessage(e), true));
                  setMenu(false);
                }}
              >
                <FileImage size={16} />
                {tr('m071')}
              </button>
            )}
            <hr />
            <button onClick={() => void modifyGuide()}>
              <Code2 size={16} />
              {tr('m072')}
            </button>
            <button
              onClick={() => {
                void window.pinto.revealSource().catch((e) => notify(errorMessage(e), true));
                setMenu(false);
              }}
            >
              <FolderOpen size={16} />
              {tr('m073')}
            </button>
            <button
              onClick={() => {
                setHelp(true);
                setMenu(false);
              }}
            >
              <HelpCircle size={16} />
              {tr('m074')}
            </button>
            <div className="menu-version">
              PINTO {info?.version}
              {tr('m075')}
            </div>
          </div>
        </>
      )}
      {(help || recentsOpen) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setHelp(false);
            setRecentsOpen(false);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={help ? tr('m076') : tr('m068')}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label={tr('m077')}
              onClick={() => {
                setHelp(false);
                setRecentsOpen(false);
              }}
            >
              <X size={19} />
            </button>
            {help ? (
              <>
                <div className="help-mark">
                  <Mark size={40} />
                </div>
                <h2>{tr('m078')}</h2>
                <p>
                  {tr('m079')}
                  <br />
                  {tr('m030')}
                  <br />
                  {tr('m059')}
                </p>
                <div className="shortcut-list">
                  <div>
                    <span>{tr('m080')}</span>
                    <strong>{tr('m081')}</strong>
                  </div>
                  <div>
                    <span>{tr('m082')}</span>
                    <strong>{tr('m083')}</strong>
                  </div>
                  <div>
                    <span>{tr('m084')}</span>
                    <strong>{tr('m085')}</strong>
                  </div>
                  <div>
                    <span>{tr('m028')}</span>
                    <strong>{command} + Enter</strong>
                  </div>
                  <div>
                    <span>{tr('m086')}</span>
                    <strong>{tr('m087')}</strong>
                  </div>
                  <div>
                    <span>{tr('m088')}</span>
                    <strong>
                      {command} + Z / {command} + Shift + Z
                    </strong>
                  </div>
                </div>
                <div className="customize-tip">
                  <Code2 size={19} />
                  <div>
                    <strong>{tr('m089')}</strong>
                    <p>{tr('m090')}</p>
                    <button className="text-button" onClick={() => void modifyGuide()}>
                      {tr('m072')}
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2>{tr('m068')}</h2>
                <p>{tr('m091')}</p>
                <div className="recent-modal-list">
                  {recent.length ? (
                    recent.map((r) => (
                      <button key={r.id} onClick={() => void openRecent(r.id)}>
                        <FileImage size={22} />
                        <span>
                          <strong>{r.name}</strong>
                          <small>
                            {r.itemCount && <>{tr('docItems', { count: r.itemCount })} · </>}
                            {r.imageCount && <>{tr('batchImages', { count: r.imageCount })} · </>}
                            {tr(r.noteCount === 1 ? 'notesOne' : 'notesOther', {
                              count: r.noteCount,
                            })}{' '}
                            · {new Date(r.updatedAt).toLocaleDateString(getLocale())}
                          </small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))
                  ) : (
                    <p>{tr('m093')}</p>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {drop && (
        <div className="drop-overlay">
          <ImagePlus size={44} />
          <strong>{tr('m094')}</strong>
          <span>{tr('m095')}</span>
        </div>
      )}
      {busy && (
        <div className="busy-overlay" role="status">
          <LoaderCircle size={25} className="spin" />
          <span>{busy}</span>
        </div>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? 'error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <HelpCircle size={17} /> : <CheckCheck size={17} />}
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label={tr('m096')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
