import { tr, setLocale, getLocale, locales } from '../core/i18n.mjs';
import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeImage, shell } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DocumentStore, atomicWrite } from './storage';
import { Collections } from './collections';
import {
  MAX_IMAGES,
  formatCollectionInstructions,
  collectionInstructionCount,
  type CollectionView,
} from '../core/collection';
import { parseLaunchOptions, readLaunchOptions, type LaunchKey } from '../core/arguments';
import {
  formatInstructions,
  instructionCount,
  type ImageSource,
  type Bootstrap,
  type AppInfo,
} from '../core/model';

const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const launchOptions = (() => {
  try {
    return parseLaunchOptions(args);
  } catch (error) {
    console.error(error);
    process.exit(2);
  }
})();
const option = (key: LaunchKey) => launchOptions[key];
app.setName('PINTO');
if (option('--data-dir')) app.setPath('userData', path.resolve(option('--data-dir')!));
else app.setPath('userData', path.join(app.getPath('appData'), 'PINTO'));
const store = new DocumentStore(app.getPath('userData'));
const collections = new Collections(path.join(app.getPath('userData'), 'collections.json'));
const pickedImages = new Map<string, string>();
const thumbnails = new Map<string, string>();
async function collectionView(): Promise<CollectionView | null> {
  await collections.settled();
  const collection = collections.current();
  if (!collection) return null;
  const images = [];
  for (const entry of collection.images) {
    const doc = await store.readDocument(entry.id);
    let thumbnail = thumbnails.get(entry.id);
    if (!thumbnail) {
      const raw = await fs.readFile(doc.referencePath);
      const scale = Math.min(120 / doc.width, 80 / doc.height);
      thumbnail = nativeImage
        .createFromBuffer(raw)
        .resize({
          width: Math.max(1, Math.round(doc.width * scale)),
          height: Math.max(1, Math.round(doc.height * scale)),
        })
        .toDataURL();
      thumbnails.set(entry.id, thumbnail);
      if (thumbnails.size > 100) thumbnails.delete(thumbnails.keys().next().value!);
    }
    images.push({
      id: doc.id,
      number: entry.number,
      name: doc.name,
      thumbnail,
      noteCount: instructionCount(doc),
    });
  }
  return { collection, images };
}
async function recentWorks() {
  await collections.settled();
  const recent = await store.recent();
  const seen = new Set<string>();
  const result = [];
  for (const entry of recent) {
    const c = collections.forImage(entry.id);
    if (!c || c.images.length === 1) {
      result.push(
        c
          ? {
              ...entry,
              noteCount: entry.noteCount + c.instructions.filter((r) => r.text.trim()).length,
            }
          : entry,
      );
      continue;
    }
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    let count = c.instructions.filter((r) => r.text.trim()).length;
    for (const image of c.images) {
      try {
        count += instructionCount(await store.readDocument(image.id));
      } catch {
        /* Keep the group discoverable; opening reports the missing image. */
      }
    }
    result.push({
      ...entry,
      imageCount: c.images.length,
      noteCount: count,
      updatedAt: c.updatedAt && c.updatedAt > entry.updatedAt ? c.updatedAt : entry.updatedAt,
    });
  }
  return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
async function outputInstructions(value: unknown) {
  const doc = await store.save(value);
  await collections.settled();
  const c = collections.current();
  if (c && (c.images.length > 1 || c.instructions.length > 0)) {
    if (!c.images.some((i) => i.id === doc.id)) throw new Error(tr('batchInvalid'));
    const docs = [];
    for (const image of c.images) {
      const d = await store.readDocument(image.id);
      await fs.access(d.referencePath);
      docs.push(d);
    }
    return {
      text: formatCollectionInstructions(c, docs),
      count: collectionInstructionCount(c, docs),
      name: doc.name,
    };
  }
  return { text: formatInstructions(doc), count: instructionCount(doc), name: doc.name };
}
let win: BrowserWindow | null = null;
let allowClose = false,
  rendererReady = false,
  quitting = false;
let pendingImage = option('--image');
const imports = new Map<string, { name: string; sourcePath?: string }>();
const version = app.getVersion();
const pendingReadyFiles = new Set<string>(
  option('--ready-file') ? [path.resolve(option('--ready-file')!)] : [],
);
async function reportReady() {
  const report = {
    status: 'ready',
    windowReady: true,
    windowVisible: win?.isVisible() ?? false,
    pid: process.pid,
    ...info(),
    sourceEditable: true,
    assistantMessage: tr('m163'),
  };
  for (const file of pendingReadyFiles) {
    await atomicWrite(file, JSON.stringify(report, null, 2));
    pendingReadyFiles.delete(file);
  }
  if (!args.includes('--isolated'))
    await atomicWrite(
      path.join(root, '.pinto/running', `${process.pid}.json`),
      JSON.stringify({ pid: process.pid, sourceRoot: root }),
    );
}
function info(): AppInfo {
  return {
    locale: getLocale(),
    version,
    platform: process.platform,
    sourceRoot: root,
    dataPath: store.dataPath,
    workspace: store.workspace,
    modificationGuide: [
      tr('m164'),
      tr('m165', { p0: root }),
      tr('m166', { p0: path.join(root, 'AGENTS.md') }),
      tr('m167', { p0: path.join(root, '.pinto/install-result.json') }),
      tr('m168'),
      tr('m169'),
      tr('m170'),
      tr('m171'),
      tr('m172'),
      tr('m173'),
      tr('m174'),
    ].join('\n'),
  };
}
function mimeOf(buffer: Buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  throw new Error(tr('m175'));
}
function source(buffer: Buffer, name: string, sourcePath?: string): ImageSource {
  if (buffer.length > 64 * 1024 * 1024) throw new Error(tr('m176'));
  const mime = mimeOf(buffer),
    token = randomUUID();
  if (imports.size > 10) imports.delete(imports.keys().next().value!);
  imports.set(token, { name, sourcePath });
  return { token, name, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` };
}
async function fileSource(file: unknown) {
  if (typeof file !== 'string' || !file || file.length > 32768) throw new Error(tr('m177'));
  const absolute = path.resolve(file),
    stat = await fs.stat(absolute);
  if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error(tr('m178'));
  return source(await fs.readFile(absolute), path.basename(absolute), absolute);
}
async function pickImage() {
  const result = await dialog.showOpenDialog(win!, {
    title: tr('m179'),
    properties: ['openFile'],
    filters: [{ name: tr('m180'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
  });
  return result.canceled ? null : fileSource(result.filePaths[0]);
}
async function clipboardImage() {
  // Electron versions before the asynchronous clipboard API used readImage().
  const api = clipboard as unknown as {
    readImage?: () => Electron.NativeImage;
    read?: () => Promise<{ types: string[]; getType: (type: string) => Promise<Blob> }[]>;
  };
  if (api.read) {
    const items = await api.read();
    for (const item of items) {
      const type = item.types.find((t) => ['image/png', 'image/jpeg', 'image/webp'].includes(t));
      if (type)
        return source(Buffer.from(await (await item.getType(type)).arrayBuffer()), tr('m181'));
    }
  } else if (api.readImage) {
    const image = api.readImage();
    if (!image.isEmpty()) return source(image.toPNG(), tr('m181'));
  }
  return null;
}
function handle(name: string, fn: (...values: any[]) => unknown) {
  ipcMain.handle(`pinto:${name}`, (event, ...values) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
      throw new Error(tr('m182'));
    return fn(...values);
  });
}
function setupIPC() {
  handle('info', info);
  handle('set-language', async (locale: unknown) => {
    if (!locales.includes(locale as any)) throw new Error('Unsupported language');
    await atomicWrite(path.join(store.dataPath, 'language.json'), JSON.stringify({ locale }));
    setLocale(locale);
    buildMenu();
    return info();
  });
  handle('bootstrap', async (): Promise<Bootstrap> => {
    const result: Bootstrap = {
      info: info(),
      recent: await recentWorks(),
      warning: store.warning,
    };
    if (pendingImage) {
      const file = pendingImage;
      pendingImage = undefined;
      try {
        result.initialImage = await fileSource(file);
      } catch (error) {
        result.warning = (error as Error).message;
      }
    } else if (store.lastId && !args.includes('--no-restore')) {
      try {
        result.opened = await store.load(store.lastId);
        await collections.restore(result.opened.document.id);
        result.collection = await collectionView();
      } catch {
        result.warning = tr('m183');
      }
    }
    return result;
  });
  handle('pick-image', pickImage);
  handle('pick-images', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: tr('m179'),
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: tr('m180'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (result.canceled) return [];
    if (result.filePaths.length > MAX_IMAGES)
      throw new Error(tr('batchLimit', { count: MAX_IMAGES }));
    pickedImages.clear();
    return result.filePaths.map((file) => {
      const token = randomUUID();
      pickedImages.set(token, file);
      return { token, name: path.basename(file) };
    });
  });
  handle('read-picked-image', async (token: string) => {
    const file = pickedImages.get(token);
    if (!file) throw new Error(tr('m185'));
    pickedImages.delete(token);
    return fileSource(file);
  });
  handle('collection', collectionView);
  handle('shared-instructions', (id, rules) => collections.rules(id, rules));
  handle('activate-image', async (id: string) => {
    if (!collections.current()?.images.some((i) => i.id === id))
      throw new Error(tr('batchInvalid'));
    return store.load(id);
  });
  handle('remove-image', async (id: string) => {
    const c = await collections.remove(id);
    return store.load(c.images.find((i) => i.id === store.lastId)?.id || c.images[0].id);
  });
  handle('import-file', fileSource);
  handle('clipboard-image', clipboardImage);
  handle('example', () =>
    fileSource(
      path.join(root, getLocale() === 'es' ? 'assets/example-es.png' : 'assets/example.png'),
    ),
  );
  handle(
    'create-document',
    async (input: { token?: unknown; dataUrl?: unknown; append?: boolean }) => {
      if (input?.append && (collections.current()?.images.length || 0) >= MAX_IMAGES)
        throw new Error(tr('batchLimit', { count: MAX_IMAGES }));
      if (
        !input ||
        typeof input.token !== 'string' ||
        typeof input.dataUrl !== 'string' ||
        !input.dataUrl.startsWith('data:image/png;base64,') ||
        input.dataUrl.length > 100_000_000
      )
        throw new Error(tr('m184'));
      const meta = imports.get(input.token);
      if (!meta) throw new Error(tr('m185'));
      const png = Buffer.from(input.dataUrl.slice(22), 'base64');
      if (mimeOf(png) !== 'image/png' || png.length < 24) throw new Error(tr('m186'));
      const width = png.readUInt32BE(16),
        height = png.readUInt32BE(20);
      if (!width || !height || width > 16000 || height > 16000 || width * height > 64_000_000)
        throw new Error(tr('m001'));
      const image = nativeImage.createFromBuffer(png);
      if (image.isEmpty()) throw new Error(tr('m186'));
      const opened = await store.create(meta.name, png, width, height, meta.sourcePath);
      imports.delete(input.token);
      await collections.adopt(opened.document.id, !!input.append);
      return opened;
    },
  );
  handle('save', (value) => store.save(value).then(() => {}));
  handle('close-document', async () => {
    await store.closeDocument();
    await collections.close();
  });
  handle('recent', recentWorks);
  handle('open-recent', async (id: string) => {
    const opened = await store.load(id);
    await collections.restore(id);
    return opened;
  });
  handle('copy', async (value) => {
    const { text, count } = await outputInstructions(value);
    if (!count) throw new Error(tr('m187'));
    await clipboard.writeText(text);
    return count;
  });
  handle('export', async (value) => {
    const { text, count, name } = await outputInstructions(value);
    if (!count) throw new Error(tr('m187'));
    const result = await dialog.showSaveDialog(win!, {
      title: tr('m188'),
      defaultPath: tr('m189', { p0: path.parse(name).name }),
      filters: [{ name: tr('m190'), extensions: ['txt'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await atomicWrite(result.filePath, text);
    return true;
  });
  handle('copy-modification', () => clipboard.writeText(info().modificationGuide));
  handle('workspace', async (id?: string) => {
    if ((collections.current()?.images.length || 0) > 1) throw new Error(tr('batchWorkspace'));
    const result = await dialog.showOpenDialog(win!, {
      title: tr('m191'),
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: store.workspace,
    });
    if (result.canceled) return null;
    const opened = await store.setWorkspace(result.filePaths[0], id);
    if (id && opened && opened.document.id !== id)
      await collections.replace(id, opened.document.id);
    return { info: info(), opened };
  });
  handle('reveal-source', async () => {
    const error = await shell.openPath(root);
    if (error) throw new Error(error);
  });
  handle('reveal-reference', (id: string) => {
    shell.showItemInFolder(store.get(id).referencePath);
  });
  handle('ready', async () => {
    rendererReady = true;
    if (!args.includes('--background')) win?.show();
    await reportReady();
  });
  handle('close-ready', () => {
    allowClose = true;
    win?.close();
  });
}
async function sendImage(file?: string) {
  try {
    const value = file ? await fileSource(file) : await pickImage();
    if (value) {
      win?.show();
      win?.webContents.send('pinto:image', value);
    }
  } catch (error) {
    await dialog.showMessageBox(win!, {
      type: 'error',
      title: tr('m192'),
      message: (error as Error).message,
    });
  }
}
function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin'
        ? [
            {
              label: 'PINTO',
              submenu: [
                { label: tr('about'), role: 'about' as const },
                { type: 'separator' as const },
                { label: tr('hide'), role: 'hide' as const },
                { label: tr('quit'), role: 'quit' as const },
              ],
            },
          ]
        : []),
      {
        label: tr('m193'),
        submenu: [
          {
            label: tr('m055'),
            accelerator: 'CmdOrCtrl+O',
            click: () => win?.webContents.send('pinto:open-images'),
          },
          { label: tr('m077'), role: 'close' },
        ],
      },
      {
        label: tr('m194'),
        submenu: [
          {
            label: tr('m024'),
            accelerator: 'CmdOrCtrl+Z',
            click: () => win?.webContents.send('pinto:edit', 'undo'),
          },
          {
            label: tr('m025'),
            accelerator: 'CmdOrCtrl+Shift+Z',
            click: () => win?.webContents.send('pinto:edit', 'redo'),
          },
          { type: 'separator' },
          { label: tr('cut'), role: 'cut' },
          { label: tr('copy'), role: 'copy' },
          { label: tr('m056'), role: 'paste' },
          { label: tr('selectAll'), role: 'selectAll' },
        ],
      },
      { label: tr('m195'), submenu: [{ label: tr('fullScreen'), role: 'togglefullscreen' }] },
    ]),
  );
}
function createWindow() {
  allowClose = false;
  rendererReady = false;
  win = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 860,
    minHeight: 620,
    show: false,
    title: 'PINTO',
    backgroundColor: '#f6f2e9',
    icon: path.join(root, 'assets/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(root, 'dist/preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      backgroundThrottling: !args.includes('--background'),
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
  win.on('close', (event) => {
    if (!allowClose && rendererReady) {
      event.preventDefault();
      win?.webContents.send('pinto:before-close');
    }
  });
  win.on('closed', () => {
    win = null;
  });
  win.webContents.on('did-fail-load', (_event, _code, description) => {
    console.error(description);
  });
  void win.loadFile(path.join(root, 'dist/renderer/index.html'));
}
const single =
  args.includes('--isolated') ||
  app.requestSingleInstanceLock({
    pintoLaunch: launchOptions,
    pintoBackground: args.includes('--background'),
  });
if (!single) app.quit();
else {
  app.on('second-instance', (_event, argv, _workingDirectory, additionalData) => {
    void (async () => {
      // Chromium may reorder/remove duplicate arguments on Windows. Use the
      // original structured options sent with the single-instance request.
      const shared = (additionalData as { pintoLaunch?: unknown }).pintoLaunch;
      const incoming = shared ? readLaunchOptions(shared) : parseLaunchOptions(argv);
      const get = (key: LaunchKey) => incoming[key];
      if (get('--ready-file')) pendingReadyFiles.add(path.resolve(get('--ready-file')!));
      if (get('--workspace')) await store.setWorkspace(path.resolve(get('--workspace')!));
      if (!win) {
        pendingImage = get('--image');
        createWindow();
        return;
      }
      if (!(additionalData as { pintoBackground?: boolean }).pintoBackground) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
      if (get('--image')) await sendImage(get('--image'));
      if (rendererReady) await reportReady();
    })().catch((error) => console.error(error));
  });
  app.on('open-file', (event, file) => {
    event.preventDefault();
    if (rendererReady) void sendImage(file);
    else pendingImage = file;
  });
  app
    .whenReady()
    .then(async () => {
      let savedLocale: unknown;
      try {
        savedLocale = JSON.parse(
          await fs.readFile(path.join(store.dataPath, 'language.json'), 'utf8'),
        ).locale;
      } catch {
        /* Use system language if preferences are absent or damaged. */
      }
      setLocale(option('--language') || savedLocale || app.getLocale());
      await store.init(option('--workspace') ? path.resolve(option('--workspace')!) : undefined);
      await collections.init();
      if (process.platform === 'darwin') app.dock?.setIcon(path.join(root, 'assets/icon.png'));
      setupIPC();
      createWindow();
      buildMenu();
      app.on('activate', () => {
        if (!win) createWindow();
      });
    })
    .catch((error) => {
      console.error(error);
      dialog.showErrorBox(tr('m196'), String(error));
      app.quit();
    });
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || args.includes('--isolated') || quitting) app.quit();
  });
  app.on('will-quit', () => {
    void fs
      .rm(path.join(root, '.pinto/running', `${process.pid}.json`), { force: true })
      .catch(() => {});
  });
}
