import { BrowserWindow, nativeImage } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tr } from '../core/i18n.mjs';
import { validateActions, type LiveAction, type Surface } from '../core/surfaces';

export function localWebUrl(input: string) {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new Error(tr('docLocalOnly'));
  }
  if (
    u.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) ||
    u.username ||
    u.password
  )
    throw new Error(tr('docLocalOnly'));
  return u.href;
}
const collect = `(()=>{
 const selector=e=>{const parts=[];for(let n=e;n&&n!==document.body&&parts.length<4;n=n.parentElement){let p=n.tagName.toLowerCase();if(n.id){parts.unshift(p+'#'+CSS.escape(n.id));break;}p+=[...n.classList].slice(0,2).map(c=>'.'+CSS.escape(c)).join('');const same=n.parentElement?[...n.parentElement.children].filter(s=>s.tagName===n.tagName):[];if(same.length>1)p+=':nth-of-type('+(same.indexOf(n)+1)+')';parts.unshift(p);}return parts.join(' > ');};
 const boxes=[];for(const e of document.querySelectorAll('body *')){if(boxes.length>=2500)break;if(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','META','LINK'].includes(e.tagName))continue;const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(r.width<2||r.height<2||s.display==='none'||s.visibility==='hidden'||+s.opacity===0)continue;let text=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim();if(!text)text=e.textContent||'';boxes.push({selector:selector(e),text:text.replace(/\\s+/g,' ').slice(0,120),x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height});}
 return {height:Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0,1),boxes};
})()`;
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const partition = (url: string) =>
  'persist:pinto-web-' +
  createHash('sha256').update(new URL(url).origin).digest('hex').slice(0, 20);
let queue: Promise<unknown> = Promise.resolve();
const webWindows = new Map<string, BrowserWindow>();
async function configure(win: BrowserWindow, kind: 'html' | 'webapp', source: string) {
  const root = kind === 'html' ? await fs.realpath(path.dirname(source)) : '';
  const origin = kind === 'webapp' ? new URL(localWebUrl(source)).origin : '';
  const allowed = async (url: string) => {
    try {
      const u = new URL(url);
      if (['data:', 'blob:', 'about:'].includes(u.protocol)) return true;
      if (kind === 'html' && u.protocol === 'file:') {
        const real = await fs.realpath(fileURLToPath(u));
        const relative = path.relative(root, real);
        return (
          relative === '' ||
          (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
        );
      }
      return (
        kind === 'webapp' &&
        ['http:', 'ws:'].includes(u.protocol) &&
        new URL(url.replace(/^ws:/, 'http:')).origin === origin
      );
    } catch {
      return false;
    }
  };
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.session.setPermissionRequestHandler((_c, _p, done) => done(false));
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (request, done) => {
    void allowed(request.url).then((ok) => done({ cancel: !ok }));
  });
  win.webContents.on('will-navigate', (event, url) => {
    const u = new URL(url);
    if (kind === 'webapp' && u.origin !== origin) event.preventDefault();
    if (kind === 'html' && u.protocol !== 'file:') event.preventDefault();
  });
}
export async function openWebLogin(url: string, show = true) {
  const safe = localWebUrl(url);
  const origin = new URL(safe).origin;
  const existing = webWindows.get(origin);
  if (existing && !existing.isDestroyed()) {
    if (show) {
      existing.show();
      existing.focus();
    }
    return;
  }
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    show,
    title: 'PINTO',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: partition(safe),
    },
  });
  await configure(win, 'webapp', safe);
  webWindows.set(origin, win);
  win.on('closed', () => webWindows.delete(origin));
  try {
    await win.loadURL(safe);
  } catch (e) {
    win.destroy();
    throw e;
  }
}
export function signature(png: Buffer) {
  const b = nativeImage.createFromBuffer(png).resize({ width: 64, height: 36 }).toBitmap();
  const out = Buffer.alloc(64 * 36);
  for (let i = 0; i < out.length; i++)
    out[i] = Math.round(b[i * 4] * 0.114 + b[i * 4 + 1] * 0.587 + b[i * 4 + 2] * 0.299);
  return out.toString('base64');
}
export function sameSignature(a: string, b: string) {
  const x = Buffer.from(a, 'base64'),
    y = Buffer.from(b, 'base64');
  return (
    x.length === 2304 &&
    y.length === x.length &&
    x.reduce((n, v, i) => n + Math.abs(v - y[i]), 0) / x.length < 1.5
  );
}
export function snapshotSurface(
  kind: 'html' | 'webapp',
  source: string,
  actions: LiveAction[] = [],
): Promise<{ png: Buffer; width: number; height: number; surface: Surface }> {
  validateActions(actions);
  if (kind === 'webapp') source = localWebUrl(source);
  if (kind === 'webapp') {
    if (actions.length) throw new Error(tr('docInvalid'));
    const active = webWindows.get(new URL(source).origin);
    if (active && !active.isDestroyed()) {
      const current = active.webContents.getURL();
      if (current && new URL(current).origin === new URL(source).origin) source = current;
    }
  }
  const task = queue
    .catch(() => {})
    .then(async () => {
      const win = new BrowserWindow({
        show: false,
        width: 1280,
        height: 900,
        useContentSize: true,
        webPreferences: {
          offscreen: true,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          backgroundThrottling: false,
          partition: kind === 'webapp' ? partition(source) : 'pinto-html-' + randomUUID(),
        },
      });
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await configure(win, kind, source);
        await Promise.race([
          kind === 'html' ? win.loadFile(source) : win.loadURL(source),
          new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error(tr('docRenderFailed'))), 15000);
          }),
        ]);
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          if (!win.isDestroyed()) win.destroy();
        }, 25000);
        win.webContents.debugger.attach('1.3');
        await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
          width: 1280,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await delay(300);
        for (const action of actions) {
          if (action.kind === 'key') {
            win.webContents.sendInputEvent({
              type: 'keyDown',
              keyCode: action.key === 'ArrowLeft' ? 'Left' : 'Right',
            });
            win.webContents.sendInputEvent({
              type: 'keyUp',
              keyCode: action.key === 'ArrowLeft' ? 'Left' : 'Right',
            });
          } else {
            await win.webContents.executeJavaScript(
              `window.scrollTo(0,${Math.max(0, action.y - 400)})`,
            );
            await delay(30);
            const scroll = await win.webContents.executeJavaScript('window.scrollY');
            win.webContents.sendInputEvent({
              type: 'mouseDown',
              button: 'left',
              clickCount: 1,
              x: Math.round(action.x),
              y: Math.round(action.y - scroll),
            });
            win.webContents.sendInputEvent({
              type: 'mouseUp',
              button: 'left',
              clickCount: 1,
              x: Math.round(action.x),
              y: Math.round(action.y - scroll),
            });
          }
          await delay(200);
        }
        await win.webContents.executeJavaScript('window.scrollTo(0,0)');
        await delay(200);
        const found = await win.webContents.executeJavaScript(collect);
        const height = Math.min(Math.ceil(found.height), 8000);
        const result = await win.webContents.debugger.sendCommand('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: 1280, height, scale: 1 },
        });
        const png = Buffer.from(result.data, 'base64');
        return {
          png,
          width: 1280,
          height,
          surface: {
            kind,
            path: source,
            page: 1,
            boxes: found.boxes.filter((b: { y: number }) => b.y < height),
            actions,
            fullHeight: found.height,
            signature: signature(png),
            renderedUrl: win.webContents.getURL(),
          },
        };
      } catch {
        throw new Error(tr('docRenderFailed'));
      } finally {
        if (timeout) clearTimeout(timeout);
        if (!win.isDestroyed()) win.destroy();
      }
    });
  queue = task;
  return task;
}
