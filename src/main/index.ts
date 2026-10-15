import { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeImage, shell } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DocumentStore, atomicWrite } from './storage';
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
    assistantMessage:
      '설치했고 앱 창을 열었습니다. 이 앱은 로컬 소스를 직접 수정해서 사용할 수 있습니다. 원하는 변경을 요청하시면 코드를 수정하고 확인한 뒤 다시 실행할 수 있습니다.',
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
    version,
    platform: process.platform,
    sourceRoot: root,
    dataPath: store.dataPath,
    workspace: store.workspace,
    modificationGuide: [
      '이 PC에 설치된 PINTO의 소스를 사용자 요청에 맞게 수정해 주세요.',
      `소스 위치: ${root}`,
      `수정 지침: ${path.join(root, 'AGENTS.md')}`,
      `실행 환경 정보: ${path.join(root, '.pinto/install-result.json')} (nodePath와 npmCli 참고)`,
      '위 소스 폴더에서 작업합니다.',
      '타입 확인: npm run check',
      '핵심 테스트: npm test',
      '빌드: npm run build',
      '실행: npm start',
      '코드 변경 전에 작업 내용을 확인하고, 이미지·코멘트 데이터와 기존 개인 수정은 보존해 주세요.',
      '원하는 변경: ',
    ].join('\n'),
  };
}
function mimeOf(buffer: Buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  throw new Error('PNG, JPEG, WebP 이미지를 열어 주세요.');
}
function source(buffer: Buffer, name: string, sourcePath?: string): ImageSource {
  if (buffer.length > 64 * 1024 * 1024) throw new Error('64MB 이하의 이미지를 열어 주세요.');
  const mime = mimeOf(buffer),
    token = randomUUID();
  if (imports.size > 10) imports.delete(imports.keys().next().value!);
  imports.set(token, { name, sourcePath });
  return { token, name, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` };
}
async function fileSource(file: unknown) {
  if (typeof file !== 'string' || !file || file.length > 32768)
    throw new Error('이미지 경로를 확인해 주세요.');
  const absolute = path.resolve(file),
    stat = await fs.stat(absolute);
  if (!stat.isFile() || stat.size > 64 * 1024 * 1024)
    throw new Error('64MB 이하의 이미지 파일을 열어 주세요.');
  return source(await fs.readFile(absolute), path.basename(absolute), absolute);
}
async function pickImage() {
  const result = await dialog.showOpenDialog(win!, {
    title: 'PINTO에서 이미지 열기',
    properties: ['openFile'],
    filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
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
        return source(
          Buffer.from(await (await item.getType(type)).arrayBuffer()),
          '붙여넣은 이미지.png',
        );
    }
  } else if (api.readImage) {
    const image = api.readImage();
    if (!image.isEmpty()) return source(image.toPNG(), '붙여넣은 이미지.png');
  }
  return null;
}
function handle(name: string, fn: (...values: any[]) => unknown) {
  ipcMain.handle(`pinto:${name}`, (event, ...values) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
      throw new Error('허용되지 않은 요청입니다.');
    return fn(...values);
  });
}
function setupIPC() {
  handle('info', info);
  handle('bootstrap', async (): Promise<Bootstrap> => {
    const result: Bootstrap = {
      info: info(),
      recent: await store.recent(),
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
      } catch {
        result.warning = '이전 작업을 열지 못했어요. 참고 이미지가 있는지 확인해 주세요.';
      }
    }
    return result;
  });
  handle('pick-image', pickImage);
  handle('import-file', fileSource);
  handle('clipboard-image', clipboardImage);
  handle('example', () => fileSource(path.join(root, 'assets/example.png')));
  handle('create-document', async (input: { token?: unknown; dataUrl?: unknown }) => {
    if (
      !input ||
      typeof input.token !== 'string' ||
      typeof input.dataUrl !== 'string' ||
      !input.dataUrl.startsWith('data:image/png;base64,') ||
      input.dataUrl.length > 100_000_000
    )
      throw new Error('이미지 정보를 확인해 주세요.');
    const meta = imports.get(input.token);
    if (!meta) throw new Error('이미지를 다시 열어 주세요.');
    const png = Buffer.from(input.dataUrl.slice(22), 'base64');
    if (mimeOf(png) !== 'image/png' || png.length < 24) throw new Error('이미지를 읽지 못했어요.');
    const width = png.readUInt32BE(16),
      height = png.readUInt32BE(20);
    if (!width || !height || width > 16000 || height > 16000 || width * height > 64_000_000)
      throw new Error('이미지는 한 변 16,000px, 총 6,400만 픽셀 이하로 열어 주세요.');
    const image = nativeImage.createFromBuffer(png);
    if (image.isEmpty()) throw new Error('이미지를 읽지 못했어요.');
    const opened = await store.create(meta.name, png, width, height, meta.sourcePath);
    imports.delete(input.token);
    return opened;
  });
  handle('save', (value) => store.save(value).then(() => {}));
  handle('close-document', () => store.closeDocument());
  handle('recent', () => store.recent());
  handle('open-recent', (id: string) => store.load(id));
  handle('copy', async (value) => {
    const doc = await store.save(value),
      count = instructionCount(doc);
    if (!count) throw new Error('지시를 하나 이상 적어 주세요.');
    await clipboard.writeText(formatInstructions(doc));
    return count;
  });
  handle('export', async (value) => {
    const doc = await store.save(value);
    if (!instructionCount(doc)) throw new Error('지시를 하나 이상 적어 주세요.');
    const result = await dialog.showSaveDialog(win!, {
      title: '지시문 저장',
      defaultPath: `${path.parse(doc.name).name}-지시.txt`,
      filters: [{ name: '텍스트', extensions: ['txt'] }],
    });
    if (result.canceled || !result.filePath) return false;
    await atomicWrite(result.filePath, formatInstructions(doc));
    return true;
  });
  handle('copy-modification', () => clipboard.writeText(info().modificationGuide));
  handle('workspace', async (id?: string) => {
    const result = await dialog.showOpenDialog(win!, {
      title: '이미지와 메모를 보관할 폴더',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: store.workspace,
    });
    if (result.canceled) return null;
    const opened = await store.setWorkspace(result.filePaths[0], id);
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
      title: '이미지를 열지 못했어요',
      message: (error as Error).message,
    });
  }
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
      await store.init(option('--workspace') ? path.resolve(option('--workspace')!) : undefined);
      if (process.platform === 'darwin') app.dock?.setIcon(path.join(root, 'assets/icon.png'));
      setupIPC();
      createWindow();
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          ...(process.platform === 'darwin'
            ? [
                {
                  label: 'PINTO',
                  submenu: [
                    { role: 'about' as const },
                    { type: 'separator' as const },
                    { role: 'hide' as const },
                    { role: 'quit' as const },
                  ],
                },
              ]
            : []),
          {
            label: '파일',
            submenu: [
              { label: '이미지 열기', accelerator: 'CmdOrCtrl+O', click: () => void sendImage() },
              { role: 'close' },
            ],
          },
          {
            label: '편집',
            submenu: [
              {
                label: '실행 취소',
                accelerator: 'CmdOrCtrl+Z',
                click: () => win?.webContents.send('pinto:edit', 'undo'),
              },
              {
                label: '다시 실행',
                accelerator: 'CmdOrCtrl+Shift+Z',
                click: () => win?.webContents.send('pinto:edit', 'redo'),
              },
              { type: 'separator' },
              { role: 'cut' },
              { role: 'copy' },
              { role: 'paste' },
              { role: 'selectAll' },
            ],
          },
          { label: '보기', submenu: [{ role: 'togglefullscreen' }] },
        ]),
      );
      app.on('activate', () => {
        if (!win) createWindow();
      });
    })
    .catch((error) => {
      console.error(error);
      dialog.showErrorBox('PINTO 실행 오류', String(error));
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
