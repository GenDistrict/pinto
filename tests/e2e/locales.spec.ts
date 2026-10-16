import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { tr, type Locale } from '../../src/core/i18n.mjs';

test('language switch covers UI, clipboard, dialogs, errors and restart persistence', async () => {
  test.setTimeout(150000);
  const root = process.cwd(),
    dir = path.join(root, '.test-data', `locales-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({
      args: [
        root,
        '--isolated',
        '--background',
        '--data-dir',
        path.join(dir, 'data'),
        '--workspace',
        dir,
      ],
      env,
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const choose = () => page.getByRole('combobox', { name: 'Language / Idioma / 언어' });
    await expect(choose()).toBeEnabled();
    const system = await app.evaluate(({ app }) => app.getLocale());
    const expected = /^ko/i.test(system) ? 'ko' : /^es/i.test(system) ? 'es' : 'en';
    await expect(page.locator('html')).toHaveAttribute('lang', expected);
    for (const locale of ['en', 'es', 'ko'] as Locale[]) {
      await choose().selectOption(locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { name: tr('m051', {}, locale) })).toBeVisible();
      await page.getByRole('button', { name: tr('m067', {}, locale), exact: true }).click();
      await expect(page.getByRole('heading', { name: tr('m078', {}, locale) })).toBeVisible();
      await page.getByRole('button', { name: tr('m077', {}, locale), exact: true }).click();
      await page.getByRole('button', { name: tr('m058', {}, locale) }).click();
      await expect(page.getByTestId('stage')).toBeVisible();
      await expect(
        page.getByRole('button', { name: tr('m113', { p0: tr('m111', {}, locale) }, locale) }),
      ).toBeVisible();
      const nativeLabels = await app.evaluate(({ Menu }) =>
        Menu.getApplicationMenu()!.items.map((i) => i.label),
      );
      expect(nativeLabels).toContain(tr('m193', {}, locale));
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(860, 620),
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setContentSize(1320, 880),
      );
      const stage = page.getByTestId('stage');
      await stage.click({ position: { x: 450, y: 300 } });
      const input = page.getByRole('textbox', { name: tr('m131', {}, locale), exact: true });
      await input.fill(
        locale === 'es'
          ? 'Haz este botón más grande.'
          : locale === 'en'
            ? 'Make this button larger.'
            : '버튼을 크게 해줘.',
      );
      await input.press('Enter');
      await page.getByRole('button', { name: tr('m028', {}, locale), exact: false }).click();
      await expect(
        page.getByRole('status').filter({ hasText: tr('m012', { p0: 1 }, locale) }),
      ).toBeVisible();
      const copy = await app.evaluate(({ clipboard }) => clipboard.readText());
      expect(copy).toContain(tr('m146', {}, locale));
      expect(copy).toContain(
        locale === 'es' ? 'Haz este botón' : locale === 'en' ? 'Make this button' : '버튼을',
      );
      if (locale !== 'ko') {
        expect(copy).not.toMatch(/[가-힣]/);
        const visible = await page.evaluate(() => {
          const node = document.body.cloneNode(true) as HTMLElement;
          node.querySelectorAll('select').forEach((e) => e.remove());
          return node.textContent;
        });
        expect(visible).not.toMatch(/[가-힣]/);
      }
      await app.evaluate(({ dialog }) => {
        dialog.showSaveDialog = (async (...args: any[]) => {
          (globalThis as any).exportOptions = args.at(-1);
          return { canceled: true, filePath: '' };
        }) as typeof dialog.showSaveDialog;
      });
      await page.getByRole('button', { name: tr('m029', {}, locale) }).click();
      await page.getByRole('button', { name: tr('m069', {}, locale) }).click();
      await expect
        .poll(() => app.evaluate(() => (globalThis as any).exportOptions?.title))
        .toBe(tr('m188', {}, locale));
      const failure = await page.evaluate(async () => {
        try {
          await window.pinto.createDocument({
            token: 'invalid',
            dataUrl: 'data:image/png;base64,AAAA',
          });
          return '';
        } catch (e) {
          return String(e);
        }
      });
      expect(failure).toContain(tr('m185', {}, locale));
      await page.getByRole('button', { name: tr('m023', {}, locale), exact: true }).click();
      await expect(page.getByRole('heading', { name: tr('m051', {}, locale) })).toBeVisible();
    }
    await choose().selectOption('es');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.getByRole('heading', { name: 'Aquí. Así.' })).toBeVisible();
    await page.locator('.recent-grid button').first().click();
    await expect(page.getByTestId('stage')).toBeVisible();
    const value = await page.evaluate(async () => {
      const recent = await window.pinto.recent();
      return (await window.pinto.openRecent(recent[0].id)).document.notes[0].text;
    });
    expect(value).toBe('버튼을 크게 해줘.');
  } finally {
    await app.close();
  }
});
