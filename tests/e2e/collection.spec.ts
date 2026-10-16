import { test, expect } from '@playwright/test';
import { _electron as electron, type Page } from 'playwright';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

test('multi-image work saves independent notes, shared references, restores and imports partial batches', async () => {
  test.setTimeout(180000);
  const root = process.cwd(),
    dir = path.join(root, '.test-data', `batch-${Date.now()}`);
  await mkdir(path.join(dir, 'a'), { recursive: true });
  await mkdir(path.join(dir, 'b'), { recursive: true });
  const first = path.join(dir, 'a', 'same.png'),
    second = path.join(dir, 'b', 'same.png'),
    bad = path.join(dir, 'bad.png');
  await copyFile(path.join(root, 'assets/example.png'), first);
  await copyFile(path.join(root, 'tests/fixtures/transparent.png'), second);
  await writeFile(bad, 'invalid image');
  const env = Object.fromEntries(
    Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({
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
  let app = await launch();
  let page: Page;
  const errors: string[] = [];
  try {
    page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(e.message));
    await expect(page.getByRole('heading', { name: 'Here. Like this.' })).toBeVisible();
    await app.evaluate(
      ({ dialog }, files) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
      },
      [first, second],
    );
    await app.evaluate(({Menu,BrowserWindow})=>{
      const item=Menu.getApplicationMenu()!.items.find(i=>i.label==='File')!.submenu!.items.find(i=>i.label==='Open image')!;
      item.click(item,BrowserWindow.getAllWindows()[0],{} as any);
    });
    await expect(page.locator('.image-tile')).toHaveCount(2);
    async function note(text: string) {
      await expect(page.locator('.busy-overlay')).toHaveCount(0);
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const stage = await page.getByTestId('stage').boundingBox();
      const pos = await page.getByTestId('image-transform').evaluate((e) => ({
        x: +e.getAttribute('data-x')!,
        y: +e.getAttribute('data-y')!,
        s: +e.getAttribute('data-scale')!,
      }));
      await page.mouse.click(stage!.x + pos.x + 10 * pos.s, stage!.y + pos.y + 10 * pos.s);
      await page.getByRole('textbox', { name: 'Edit instruction', exact: true }).fill(text);
    }
    await page.getByRole('button', { name: 'Open image 1', exact: true }).click();
    await note('Only first image');
    await page.getByRole('button', { name: 'Open image 2', exact: true }).click();
    await note('Only second image');
    await page.getByRole('button', { name: 'Open image 1', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    await page.getByRole('checkbox', { name: 'Select image 1', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Add instruction for selected images' }).click();
    const current = await page.evaluate(() => window.pinto.collection());
    await page
      .getByRole('combobox', { name: 'Reference for shared instruction' })
      .selectOption(current!.images[0].id);
    await page
      .getByRole('textbox', { name: 'Shared instruction', exact: true })
      .fill('Match the reference colors; keep the second image layout.');
    await page.getByRole('button', { name: 'Copy all instructions', exact: false }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Copied 3 instructions across 2 images.' }),
    ).toBeVisible();
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(copied).toContain('## Image 1 — same.png');
    expect(copied).toContain('## Image 2 — same.png');
    expect(copied).toContain('Only first image');
    expect(copied).toContain('Only second image');
    expect(copied).toContain('Apply to: Image 2');
    expect(copied).toContain('Reference image: Image 1');
    expect(new Set([...copied.matchAll(/^Image: (.+)$/gm)].map((m) => m[1])).size).toBe(2);
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
      },
      path.join(dir, 'batch.txt'),
    );
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('button', { name: 'Save instructions as TXT' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Instructions saved.' })).toBeVisible();
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.locator('.image-tile')).toHaveCount(2);
    await page.locator('.collection-panel summary').click();
    await expect(
      page.getByRole('textbox', { name: 'Shared instruction', exact: true }),
    ).toHaveValue('Match the reference colors; keep the second image layout.');
    await page.getByRole('button', { name: 'Remove image 1 from work', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('target or reference');
    await expect(page.locator('.image-tile')).toHaveCount(2);
    await page.getByRole('button',{name:'Copy all instructions',exact:false}).click();
    await expect(page.getByRole('status').filter({hasText:'Copied 3 instructions across 2 images.'})).toBeVisible();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(860, 620),
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    const copyBounds = await page
      .getByRole('button', { name: 'Copy all instructions', exact: false })
      .boundingBox();
    expect(copyBounds!.x + copyBounds!.width).toBeLessThanOrEqual(
      await page.evaluate(() => window.innerWidth),
    );
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1320, 880),
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await page.screenshot({ path: path.join(root, 'test-results/multi-image.png') });
    await page.getByRole('button', { name: 'Close work', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Here. Like this.' })).toBeVisible();
    await expect(page.locator('.recent-grid button')).toHaveCount(1);
    await expect(page.locator('.recent-grid button')).toContainText('2 images');
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByRole('heading', { name: 'Here. Like this.' })).toBeVisible();
    await page.locator('.recent-grid button').first().click();
    await expect(page.locator('.image-tile')).toHaveCount(2);
    await page.locator('.collection-panel summary').click();
    await page.getByRole('button', { name: 'Delete shared instruction' }).click();
    await page.getByRole('button', { name: 'Remove image 1 from work', exact: true }).click();
    await expect(page.locator('.image-tile')).toHaveCount(0);
    await page.getByRole('button', { name: 'Copy instructions', exact: false }).click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('Only second image');
    await app.evaluate(
      ({ dialog }, files) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
      },
      [bad, path.join(root, 'tests/fixtures/sample.webp')],
    );
    await page.getByRole('button', { name: 'Add images', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Some images could not be opened');
    await expect(page.locator('.image-tile')).toHaveCount(2);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('dropping several real files opens one collection', async () => {
  const root = process.cwd(),
    dir = path.join(root, '.test-data', `drop-batch-${Date.now()}`);
  await mkdir(dir, { recursive: true });
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
      'es',
      '--no-restore',
      '--data-dir',
      path.join(dir, 'data'),
      '--workspace',
      dir,
    ],
    env,
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole('heading', { name: 'Aquí. Así.' }).waitFor();
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.id = 'drop-files';
      document.body.append(input);
    });
    await page
      .locator('#drop-files')
      .setInputFiles([
        path.join(root, 'assets/example.png'),
        path.join(root, 'assets/example-es.png'),
      ]);
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('#drop-files')!;
      const transfer = new DataTransfer();
      for (const file of Array.from(input.files!)) transfer.items.add(file);
      document
        .querySelector('.app')!
        .dispatchEvent(
          new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }),
        );
      input.remove();
    });
    await expect(page.locator('.image-tile')).toHaveCount(2);
    await expect(
      page.getByRole('button', { name: 'Copiar todas las instrucciones', exact: false }),
    ).toBeDisabled();
    await page
      .getByRole('button', { name: 'Añadir instrucción a las imágenes seleccionadas' })
      .click();
    await page
      .getByRole('textbox', { name: 'Instrucción compartida', exact: true })
      .fill('Usa el mismo fondo en ambas imágenes.');
    await page
      .getByRole('button', { name: 'Copiar todas las instrucciones', exact: false })
      .click();
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('Aplicar a: Imagen 1, Imagen 2');
  } finally {
    await app.close();
  }
});
