import { test, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
const root = process.cwd();
async function launch(dir: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    args: [
      root,
      '--isolated',
      '--background',
      '--language',
      'en',
      '--data-dir',
      path.join(dir, 'data'),
      '--workspace',
      dir,
    ],
    env,
  });
  const page = await app.firstWindow();
  await page.getByRole('combobox', { name: 'Language / Idioma / 언어' }).waitFor();
  return { app, page };
}
async function choose(app: ElectronApplication, page: Page, file: string) {
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, file);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator('.busy-overlay')).toHaveCount(0);
}
async function point(page: Page, x: number, y: number) {
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const b = await page.getByTestId('stage').boundingBox();
  const v = await page.getByTestId('image-transform').evaluate((e) => ({
    x: +e.getAttribute('data-x')!,
    y: +e.getAttribute('data-y')!,
    s: +e.getAttribute('data-scale')!,
  }));
  await page.mouse.click(b!.x + v.x + x * v.s, b!.y + v.y + y * v.s);
}

test('PDF pages retain point units, text context, annotations and mode across reopening', async () => {
  test.setTimeout(120000);
  const dir = path.join(root, '.test-data', `pdf-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  let { app, page } = await launch(dir);
  try {
    const bytes = await app.evaluate(async ({ BrowserWindow }) => {
      const w = new BrowserWindow({
        show: false,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      try {
        await w.loadURL(
          'data:text/html,' +
            encodeURIComponent(
              '<style>@page{size:612pt 792pt;margin:0}body{margin:0;font:20pt Arial}section{height:792pt;box-sizing:border-box;padding:72pt;page-break-after:always}section:last-child{page-break-after:auto}</style><section><h1>Annual report</h1><p>Page one</p></section><section><h1>Results</h1><p>Revenue grew 12 percent</p></section>',
            ),
        );
        return (
          await w.webContents.printToPDF({ preferCSSPageSize: true, printBackground: true })
        ).toString('base64');
      } finally {
        w.destroy();
      }
    });
    const file = path.join(dir, 'report.pdf');
    await writeFile(file, Buffer.from(bytes, 'base64'));
    await choose(app, page, file);
    await expect(page.locator('.document-pages button')).toHaveCount(2);
    await point(page, 30, 30);
    await page
      .getByRole('textbox', { name: 'Edit instruction', exact: true })
      .fill('Keep the cover unchanged');
    await page.getByRole('textbox', { name: 'Edit instruction', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Page 2', exact: true }).click();
    await expect(page.locator('.busy-overlay')).toHaveCount(0);
    const c = await page.evaluate(() => window.pinto.collection());
    const active = c!.images.find((i) => i.page === 2)!;
    const stored = JSON.parse(
      await readFile(path.join(dir, '.image-notes', active.id, 'annotations.json'), 'utf8'),
    );
    expect(stored.width).toBe(612);
    expect(stored.height).toBe(792);
    expect(stored.surface.kind).toBe('pdf');
    const box = stored.surface.boxes.find((b: { text: string }) => b.text.includes('Revenue'));
    expect(box).toBeTruthy();
    await point(page, box.x + 10, box.y + box.height / 2);
    await page
      .getByRole('textbox', { name: 'Edit instruction', exact: true })
      .fill('Change to 15 percent');
    await page.getByRole('textbox', { name: 'Edit instruction', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Point tool', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Copy all instructions', exact: false }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('Text under the mark: Revenue grew 12 percent');
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(copied).toContain('PDF page 2 of 2');
    expect(copied).toMatch(/\n2\. Point/);
    expect(copied).toContain('Source to edit: ' + file);
    expect(copied).toContain('regenerate the PDF');
    await page.getByRole('button', { name: 'Instruction list', exact: true }).click();
    await expect(page.locator('.note-list-item')).toHaveCount(2);
    await page.locator('.note-select').filter({ hasText: 'Keep the cover unchanged' }).click();
    await expect(page.getByRole('button', { name: 'Page 1', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.locator('.note-select').filter({ hasText: 'Change to 15 percent' }).click();
    await expect(page.getByRole('button', { name: 'Page 2', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.screenshot({ path: path.join(root, 'test-results/pinto-pdf.png'), scale: 'css' });
    await app.close();
    ({ app, page } = await launch(dir));
    await expect(page.locator('.document-pages button')).toHaveCount(2);
    await page.getByRole('button', { name: 'Page 2', exact: true }).click();
    await expect(page.locator('.busy-overlay')).toHaveCount(0);
    await page.getByRole('button', { name: 'Copy all instructions', exact: false }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('Change to 15 percent');
  } finally {
    await app.close();
  }
});

test('HTML live navigation uses selectors, screen-local notes, deduplication and source paths', async () => {
  test.setTimeout(120000);
  const dir = path.join(root, '.test-data', `html-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const { app, page } = await launch(dir);
  try {
    await writeFile(
      path.join(dir, 'style.css'),
      'body{margin:0;font:32px Arial}section{height:900px;background:#164d3a;padding:50px;box-sizing:border-box;color:white}button{font:28px Arial}',
    );
    const file = path.join(dir, 'slides.html');
    await writeFile(
      file,
      '<link rel="stylesheet" href="style.css"><section id="slide"><h1 id="title">First screen</h1><button id="next" onclick="go(1)">Next</button></section><script>let n=0;function go(v){n=Math.max(0,Math.min(1,n+v));document.getElementById("title").textContent=n?"Second screen":"First screen";document.getElementById("slide").style.background=n?"#4d1628":"#164d3a"}addEventListener("keydown",e=>{if(e.key==="ArrowRight")go(1);if(e.key==="ArrowLeft")go(-1)})</script>',
    );
    await choose(app, page, file);
    await expect(page.getByTestId('stage')).toBeVisible();
    await page.getByRole('button', { name: 'Next page or screen' }).click();
    await expect(page.locator('.busy-overlay')).toHaveCount(0);
    await expect(page.locator('.document-controls')).toContainText('Screen 2');
    await expect(page.locator('.image-strip')).toHaveCount(0);
    await point(page, 120, 100);
    await page
      .getByRole('textbox', { name: 'Edit instruction', exact: true })
      .fill('Shorten the headline');
    await page.getByRole('textbox', { name: 'Edit instruction', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Copy all instructions', exact: false }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('h1#title');
    const copy = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(copy).toContain('ArrowRight');
    expect(copy).toContain('CSS px');
    expect(copy).toContain(file);
    await page.getByRole('button', { name: 'Previous page or screen' }).click();
    await expect(page.locator('.busy-overlay')).toHaveCount(0);
    await expect(page.locator('.document-controls')).toContainText('Screen 1');
    await page.getByRole('button', { name: 'Next page or screen' }).click();
    await expect(page.locator('.busy-overlay')).toHaveCount(0);
    expect((await page.evaluate(() => window.pinto.collection()))!.images.length).toBe(2);
    await page.screenshot({ path: path.join(root, 'test-results/pinto-html.png'), scale: 'css' });
  } finally {
    await app.close();
  }
});

test('web app is same-origin, persists its own sign-in and copies project-source instructions', async () => {
  test.setTimeout(120000);
  let outsideRequests = 0;
  const outside = createServer((_req, res) => {
    outsideRequests++;
    res.end('should not load');
  });
  await new Promise<void>((r) => outside.listen(0, '127.0.0.1', r));
  const outsidePort = (outside.address() as { port: number }).port;
  const server = createServer((req, res) => {
    if (req.url === '/login') {
      res.setHeader('Set-Cookie', 'pinto_demo=yes; HttpOnly; Path=/');
      res.end('ok');
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end(
      `<style>body{margin:0;font:30px Arial;padding:50px}</style><h1 id="account">${req.headers.cookie?.includes('pinto_demo=yes') ? 'Signed in' : 'Guest'}</h1><button id="save">Save settings</button><p id="network">Checking</p><script>fetch('http://127.0.0.1:${outsidePort}/blocked').then(()=>document.getElementById('network').textContent='Unexpected access').catch(()=>document.getElementById('network').textContent='Other origin blocked')</script>`,
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const dir = path.join(root, '.test-data', `web-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const { app, page } = await launch(dir);
  try {
    await page.getByRole('button', { name: 'Open web app', exact: true }).click();
    await page
      .getByRole('textbox', { name: 'Web app URL' })
      .fill(`http://127.0.0.1:${port}/settings`);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Open web app', exact: true })
      .click();
    await expect(page.locator('.busy-overlay')).toHaveCount(0);
    await expect(page.getByTestId('stage')).toBeVisible();
    await point(page, 90, 95);
    await page
      .getByRole('textbox', { name: 'Edit instruction', exact: true })
      .fill('Make this heading clearer');
    await page.getByRole('textbox', { name: 'Edit instruction', exact: true }).press('Enter');
    await page.getByRole('button', { name: 'Copy instructions', exact: false }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('project source serving this URL');
    const text = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(text).toContain('/settings');
    expect(text).toContain('h1#account');
    const error = await page.evaluate(async () => {
      try {
        await window.pinto.openWebApp('https://example.com');
        return '';
      } catch (e) {
        return String(e);
      }
    });
    expect(error).toContain('localhost');
    const current = await page.evaluate(() => window.pinto.collection());
    await page.evaluate((id) => window.pinto.openWebWindow(id), current!.images[0].id);
    await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('http:'),
      )!;
      w.hide();
      await w.webContents.executeJavaScript("fetch('/login').then(r=>r.text())");
      await w.loadURL(new URL('/dashboard', w.webContents.getURL()).href);
    });
    await page.getByRole('button', { name: 'Refresh current screen' }).click();
    await expect(page.locator('.busy-overlay')).toHaveCount(0);
    const c = await page.evaluate(() => window.pinto.collection());
    expect(c!.images.length).toBe(2);
    const saved = JSON.parse(
      await readFile(
        path.join(dir, '.image-notes', c!.images.at(-1)!.id, 'annotations.json'),
        'utf8',
      ),
    );
    expect(saved.surface.boxes.some((b: { text: string }) => b.text === 'Signed in')).toBe(true);
    expect(saved.surface.path).toContain('/dashboard');
    expect(
      saved.surface.boxes.some((b: { text: string }) => b.text === 'Other origin blocked'),
    ).toBe(true);
    expect(outsideRequests).toBe(0);
    await expect(page.locator('.image-strip')).toHaveCount(0);
    await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((w) =>
        w.webContents.getURL().startsWith('http:'),
      )!;
      await w.loadURL(new URL('/identical-layout', w.webContents.getURL()).href);
    });
    await page.getByRole('button', { name: 'Refresh current screen' }).click();
    await expect(page.locator('.busy-overlay')).toHaveCount(0);
    const separate = await page.evaluate(() => window.pinto.collection());
    expect(separate!.images.length).toBe(3);
    expect(separate!.images.at(-1)!.source).toContain('/identical-layout');
    expect(separate!.images[1].source).toContain('/dashboard');
  } finally {
    await app.close();
    await new Promise<void>((r) => server.close(() => r()));
    await new Promise<void>((r) => outside.close(() => r()));
  }
});
