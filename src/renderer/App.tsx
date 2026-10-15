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
    throw new Error('이미지는 한 변 16,000px, 총 6,400만 픽셀 이하로 열어 주세요.');
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 표시할 수 없어요.');
  ctx.drawImage(image, 0, 0);
  const result = canvas.toDataURL('image/png');
  canvas.width = 0;
  canvas.height = 0;
  if (!result.startsWith('data:image/png')) throw new Error('이미지 변환에 실패했어요.');
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
  const savedDoc = useRef<Document | null>(null),
    saveQueue = useRef<Promise<unknown>>(Promise.resolve()),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false),
    closingDocument = useRef(false),
    busyRef = useRef(false),
    copyingRef = useRef(false),
    booted = useRef(false);
  const command = info?.platform === 'darwin' ? '⌘' : 'Ctrl';
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
  }, [docRef, save]);
  const opened = useCallback(
    (value: OpenDocument) => {
      savedDoc.current = value.document;
      reset(value.document);
      setImageUrl(value.imageUrl);
      setActiveId(null);
      setAdding(false);
      setSaveState('saved');
    },
    [reset],
  );
  const refreshRecent = useCallback(async () => setRecent(await window.pinto.recent()), []);
  const importSource = useCallback(
    async (source: ImageSource) => {
      const dataUrl = await normalizeImage(source);
      opened(await window.pinto.createDocument({ token: source.token, dataUrl }));
      setInfo(await window.pinto.info());
      await refreshRecent();
    },
    [opened, refreshRecent],
  );
  const operation = useCallback(
    async (message: string, fn: () => Promise<void>) => {
      if (busyRef.current) return;
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
      }
    },
    [flush, notify],
  );
  const openImage = useCallback(
    () =>
      operation('이미지를 열고 있어요', async () => {
        const source = await window.pinto.pickImage();
        if (source) await importSource(source);
      }),
    [operation, importSource],
  );
  const closeImage = async () => {
    if (busyRef.current || copyingRef.current || !docRef.current) return;
    closingDocument.current = true;
    try {
      await operation('이미지를 닫고 있어요.', async () => {
        await window.pinto.closeDocument();
        reset(null);
        savedDoc.current = null;
        setImageUrl('');
        setActiveId(null);
        setAdding(false);
        setSidebar(false);
        setSaveState('saved');
        await refreshRecent();
        notify('이미지를 닫았어요. 최근 작업에서 다시 열 수 있어요.');
      });
    } finally {
      closingDocument.current = false;
    }
  };
  const pasteImage = useCallback(
    () =>
      operation('이미지를 붙여넣고 있어요', async () => {
        const source = await window.pinto.clipboardImage();
        if (source) await importSource(source);
        else notify('클립보드에 이미지가 없어요. 이미지를 복사한 뒤 다시 시도해 주세요.');
      }),
    [operation, importSource, notify],
  );
  const openExample = () =>
    operation('예시 이미지를 준비하고 있어요', async () => {
      await importSource(await window.pinto.example());
      notify('바꿀 곳을 클릭하거나 드래그해 보세요.');
    });
  const openRecent = (id: string) =>
    operation('작업을 열고 있어요', async () => {
      opened(await window.pinto.openRecent(id));
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
      notify(`지시 ${count}개 복사했어요. 원본을 만든 AI 대화에 붙여넣으세요.`);
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
        setInfo(result.info);
        setRecent(result.recent);
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
        void flush()
          .then(() => window.pinto.closeReady())
          .catch((error) => notify(`저장하지 못해 창을 유지했어요. ${errorMessage(error)}`, true));
      }),
    [flush, notify],
  );
  useEffect(
    () =>
      window.pinto.onImage((source) => {
        void operation('이미지를 열고 있어요', () => importSource(source));
      }),
    [operation, importSource],
  );
  useEffect(
    () =>
      window.pinto.onEdit((command) => {
        if (isTextInput(document.activeElement)) document.execCommand(command);
        else if (command === 'undo') undo();
        else redo();
      }),
    [undo, redo],
  );
  useEffect(() => {
    if (!help && !recentsOpen) return;
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
  }, [help, recentsOpen]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.isComposing || composing.current || e.keyCode === 229) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        void copy();
      } else if (mod && e.key.toLowerCase() === 'z' && !isTextInput(e.target)) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y' && !isTextInput(e.target)) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') {
        if (help) setHelp(false);
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
      notify('앱 수정 안내를 복사했어요. AI에게 원하는 변경을 함께 말해 주세요.');
      setMenu(false);
    } catch (error) {
      notify(errorMessage(error), true);
    }
  };
  const chooseWorkspace = () =>
    operation('이미지 보관 위치를 변경하고 있어요', async () => {
      const result = await window.pinto.chooseWorkspace(docRef.current?.id);
      if (result) {
        setInfo(result.info);
        if (result.opened) opened(result.opened);
        await refreshRecent();
        notify('이미지와 메모의 보관 위치를 변경했어요.');
      }
    });
  const exportText = () =>
    operation('지시문을 저장하고 있어요', async () => {
      if (docRef.current && (await window.pinto.exportInstructions(docRef.current)))
        notify('지시문을 저장했어요.');
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
        const file = e.dataTransfer.files[0];
        if (file)
          void operation('이미지를 열고 있어요', async () =>
            importSource(await window.pinto.importFile(file)),
          );
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
              <FileImage size={16} />
              <span title={doc.name}>{doc.name}</span>
              <small>
                {doc.width} × {doc.height}
              </small>
            </>
          ) : (
            <span className="brand-tagline">작은 표시, 명확한 지시.</span>
          )}
        </div>
        <div className="header-actions">
          <button
            className="secondary-button open-header"
            onClick={() => void openImage()}
            title={`이미지 열기 (${command}+O)`}
          >
            <FolderOpen size={16} />
            <span>열기</span>
          </button>
          {doc && (
            <>
              <button
                className="secondary-button"
                onClick={() => void closeImage()}
                disabled={!!busy || copying}
                title="이미지를 닫고 시작 화면으로 돌아가기 · 작업은 자동 저장됩니다"
              >
                <X size={16} />
                <span>이미지 닫기</span>
              </button>
              <button
                className="icon-button"
                disabled={!history.canUndo}
                onClick={undo}
                aria-label="실행 취소"
                title={`${command}+Z`}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="icon-button"
                disabled={!history.canRedo}
                onClick={redo}
                aria-label="다시 실행"
              >
                <Redo2 size={17} />
              </button>
              <button
                className={`secondary-button notes-toggle ${sidebar ? 'on' : ''}`}
                onClick={() => setSidebar(!sidebar)}
                aria-label="지시 목록"
                aria-expanded={sidebar}
              >
                <List size={16} />
                <span>지시 {doc.notes.length}</span>
              </button>
              <button
                className="primary-button copy-button"
                disabled={!instructionCount(doc) || copying}
                onClick={() => void copy()}
              >
                {copying ? <LoaderCircle size={16} className="spin" /> : <Copy size={16} />}지시
                복사<kbd>{command} ↵</kbd>
              </button>
            </>
          )}
          <button
            className="icon-button"
            aria-label="더 보기"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <MoreHorizontal size={21} />
          </button>
        </div>
      </header>
      {doc ? (
        <main className="editor-layout">
          <div className="workspace">
            <Canvas
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
                <strong>지시를 복사해 원본을 만든 AI 대화에 붙여넣으세요.</strong>
                <p>
                  새 대화라면 원본 이미지도 함께 전달하세요. 공통 조건은 그 대화에서 덧붙이면 돼요.
                </p>
              </div>
              <button
                className="secondary-button"
                onClick={() =>
                  void window.pinto
                    .revealReference(doc.id)
                    .catch((e) => notify(errorMessage(e), true))
                }
                title="표시가 없는 참고 이미지 파일의 위치를 엽니다"
              >
                <FileImage size={15} />
                이미지 파일 보기
              </button>
            </div>
          </div>
          {sidebar && (
            <aside className="notes-panel">
              <div className="panel-header">
                <h2>
                  남긴 지시 <span>{doc.notes.length}</span>
                </h2>
                <button
                  className="icon-button small"
                  aria-label="지시 목록 닫기"
                  onClick={() => setSidebar(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="notes-scroll">
                {doc.globalInstruction.trim() && (
                  <details className="legacy-instruction">
                    <summary>이전 버전에서 작성한 추가 지시</summary>
                    <textarea
                      aria-label="이전 버전 추가 지시"
                      value={doc.globalInstruction}
                      maxLength={20000}
                      onChange={(e) =>
                        update(
                          (value) => ({ ...value, globalInstruction: e.target.value }),
                          'global',
                        )
                      }
                    />
                    <small>기존 내용은 복사할 때 함께 포함됩니다.</small>
                  </details>
                )}
                {doc.notes.length ? (
                  doc.notes.map((note, i) => (
                    <div
                      className={`note-list-item ${activeId === note.id ? 'active' : ''}`}
                      key={note.id}
                    >
                      <button
                        className="note-select"
                        onClick={() => {
                          setActiveId(note.id);
                          setAdding(false);
                        }}
                      >
                        <span className="number-badge">{i + 1}</span>
                        <div>
                          <p>{note.text.trim() || '지시를 입력하고 있어요…'}</p>
                          <small>
                            {note.targets.length > 1
                              ? `대상 ${note.targets.length}개`
                              : {
                                  rect: '네모로 표시한 곳',
                                  ellipse: '동그라미로 표시한 곳',
                                  point: '점으로 표시한 곳',
                                  line: '선으로 표시한 곳',
                                  stroke: '자유도형으로 표시한 곳',
                                }[note.targets[0]?.kind || 'point']}
                          </small>
                        </div>
                      </button>
                      <button
                        className="list-delete"
                        aria-label={`지시 ${i + 1} 삭제`}
                        onClick={() => deleteNote(note.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                      <details>
                        <summary>좌표 보기</summary>
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
                      이미지 위에 콕 찍고
                      <br />첫 지시를 남겨보세요.
                    </p>
                  </div>
                )}
              </div>
              <div className="panel-footer">
                <CheckCheck size={15} />
                <span>위치는 지시와 함께 복사돼요.</span>
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
          <h1>여기, 이렇게.</h1>
          <p className="welcome-description">
            이미지 위에 콕. 바꿀 곳을 짚고,
            <br />
            AI에게 하고 싶은 말을 남겨보세요.
          </p>
          <div className="welcome-card">
            <div className="demo-paper">
              <div className="paper-toolbar">
                <i />
                <i />
                <i />
                <span>your next idea</span>
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
                    Start here<span className="demo-badge">1</span>
                  </div>
                </div>
              </div>
              <div className="demo-comment">
                <span>1</span>이 버튼을 조금 더 크게.<span className="demo-cursor">↖</span>
              </div>
            </div>
            <div className="welcome-buttons">
              <button className="primary-button" onClick={() => void openImage()}>
                <ImagePlus size={18} />
                이미지 열기
                <ArrowRight size={17} />
              </button>
              <button className="secondary-button" onClick={() => void pasteImage()}>
                <Clipboard size={17} />
                붙여넣기<kbd>{command} V</kbd>
              </button>
            </div>
            <p className="drop-instruction">
              또는 이 창에 이미지를 끌어다 놓으세요 <span>PNG · JPG · WEBP</span>
            </p>
          </div>
          <button className="sample-link" onClick={() => void openExample()}>
            예시 이미지로 둘러보기
            <ChevronRight size={15} />
          </button>
          <p className="welcome-handoff">
            지시를 복사해 원본을 만든 AI 대화에 붙여넣으세요.
            <br />새 대화라면 원본 이미지도 함께 전달하세요.
          </p>
          {recent.length > 0 && (
            <div className="recent-welcome">
              <div>
                <h2>이어서 작업하기</h2>
                <button onClick={() => void showRecents()}>
                  모두 보기
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
                        {r.noteCount}개의 지시 · {r.width} × {r.height}
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
                저장 중
              </>
            ) : saveState === 'error' ? (
              <button onClick={() => void flush().catch((e) => notify(errorMessage(e), true))}>
                저장 실패 · 다시 시도
              </button>
            ) : (
              <>
                <Check size={12} />
                자동 저장됨
              </>
            )
          ) : (
            <>
              <span className="tiny-dot" />내 컴퓨터에서, 내 방식대로.
            </>
          )}
        </span>
        <button className="help-link" onClick={() => setHelp(true)}>
          <HelpCircle size={13} />
          사용 방법
        </button>
      </footer>
      {menu && (
        <>
          <div className="menu-scrim" onClick={() => setMenu(false)} />
          <div className="app-menu">
            <button onClick={() => void showRecents()}>
              <FileImage size={16} />
              최근 작업
            </button>
            <button disabled={!doc} onClick={() => void exportText()}>
              <ArrowDownToLine size={16} />
              지시문 TXT로 저장
            </button>
            <button onClick={() => void chooseWorkspace()}>
              <FolderOpen size={16} />
              이미지 보관 폴더 변경
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
                참고 이미지 위치 열기
              </button>
            )}
            <hr />
            <button onClick={() => void modifyGuide()}>
              <Code2 size={16} />앱 수정 안내 복사
            </button>
            <button
              onClick={() => {
                void window.pinto.revealSource().catch((e) => notify(errorMessage(e), true));
                setMenu(false);
              }}
            >
              <FolderOpen size={16} />앱 소스 폴더 열기
            </button>
            <button
              onClick={() => {
                setHelp(true);
                setMenu(false);
              }}
            >
              <HelpCircle size={16} />
              사용 방법과 단축키
            </button>
            <div className="menu-version">PINTO {info?.version} · 원하는 대로 고쳐 쓰세요.</div>
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
            aria-label={help ? 'PINTO 사용 방법' : '최근 작업'}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="닫기"
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
                <h2>가리키고, 한 줄 남기세요.</h2>
                <p>
                  위치는 PINTO가 기억할게요.
                  <br />
                  지시를 복사해 원본을 만든 AI 대화에 붙여넣으세요.
                  <br />새 대화라면 원본 이미지도 함께 전달하세요.
                </p>
                <div className="shortcut-list">
                  <div>
                    <span>표시 도구</span>
                    <strong>네모 · 동그라미 · 점 · 선 · 자유도형</strong>
                  </div>
                  <div>
                    <span>그리기</span>
                    <strong>점은 클릭, 나머지는 드래그</strong>
                  </div>
                  <div>
                    <span>같은 지시에 대상 추가</span>
                    <strong>Shift + 클릭·드래그</strong>
                  </div>
                  <div>
                    <span>지시 복사</span>
                    <strong>{command} + Enter</strong>
                  </div>
                  <div>
                    <span>화면 이동 / 확대</span>
                    <strong>Space + 드래그 / 휠</strong>
                  </div>
                  <div>
                    <span>실행 취소 / 다시 실행</span>
                    <strong>
                      {command} + Z / {command} + Shift + Z
                    </strong>
                  </div>
                </div>
                <div className="customize-tip">
                  <Code2 size={19} />
                  <div>
                    <strong>PINTO도 원하는 대로 바꿔 쓰세요.</strong>
                    <p>AI에게 글자 크기, 단축키, 지시문 형식을 바꿔달라고 해보세요.</p>
                    <button className="text-button" onClick={() => void modifyGuide()}>
                      앱 수정 안내 복사
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2>최근 작업</h2>
                <p>이미지와 남긴 지시를 다시 불러와요.</p>
                <div className="recent-modal-list">
                  {recent.length ? (
                    recent.map((r) => (
                      <button key={r.id} onClick={() => void openRecent(r.id)}>
                        <FileImage size={22} />
                        <span>
                          <strong>{r.name}</strong>
                          <small>
                            {r.noteCount}개의 지시 ·{' '}
                            {new Date(r.updatedAt).toLocaleDateString('ko-KR')}
                          </small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))
                  ) : (
                    <p>아직 저장된 작업이 없어요.</p>
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
          <strong>여기에 이미지를 놓아주세요.</strong>
          <span>새로운 지시를 시작해 볼까요?</span>
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
          <button onClick={() => setToast(null)} aria-label="알림 닫기">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
