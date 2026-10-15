import { test, expect } from '@playwright/test';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';
import { mkdir, readFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd(),
  run = path.join(root, '.test-data', `editor-${Date.now()}`);
let app: ElectronApplication, page: Page;
const failures: string[] = [];
test.describe.configure({ mode: 'serial' });
async function launch(restore = false) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({
    args: [
      root,
      '--isolated',
      '--background',
      '--data-dir',
      path.join(run, 'data'),
      '--workspace',
      run,
      ...(restore ? [] : ['--no-restore']),
    ],
    env,
  });
  page = await app.firstWindow();
  page.on('pageerror', (e) => failures.push(e.message));
  await page.getByText('PINTO', { exact: true }).first().waitFor();
}
async function at(x: number, y: number) {
  const stage = await page.getByTestId('stage').boundingBox();
  const v = await page.getByTestId('image-transform').evaluate((e) => ({
    x: Number(e.getAttribute('data-x')),
    y: Number(e.getAttribute('data-y')),
    scale: Number(e.getAttribute('data-scale')),
  }));
  return { x: stage!.x + v.x + x * v.scale, y: stage!.y + v.y + y * v.scale };
}
test.beforeAll(async () => {
  await mkdir(run, { recursive: true });
  await launch();
});
test.afterAll(async () => {
  await app?.close();
});

test('welcome, point, rectangle, multiple targets, copy and export', async () => {
  await expect(page.getByRole('heading', { name: '여기, 이렇게.' })).toBeVisible();
  await page.screenshot({ path: path.join(root, 'test-results/pinto-welcome.png') });
  await page.getByRole('button', { name: '예시 이미지로 둘러보기' }).click();
  await expect(page.getByTestId('stage')).toBeVisible();
  const p = await at(400, 350);
  await page.mouse.click(p.x, p.y);
  await page
    .getByRole('textbox', { name: '수정 지시', exact: true })
    .fill('이 이미지의 배경을 더 밝게 해줘.');
  await page.getByRole('textbox', { name: '수정 지시', exact: true }).press('Enter');
  await page.getByRole('button', { name: '네모 도구' }).click();
  const a = await at(1200, 10),
    b = await at(1400, 75);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await page
    .getByRole('textbox', { name: '수정 지시', exact: true })
    .fill('이 버튼과 아래 요소의 색을 같게 해줘.');
  await page.getByRole('button', { name: '점 도구' }).click();
  await page.getByRole('button', { name: '대상 추가', exact: true }).click();
  const extra = await at(800, 500);
  await page.mouse.click(extra.x, extra.y);
  await expect(page.getByTestId('note-editor')).toContainText('대상 2개');
  await page.getByRole('button', { name: '대상 추가 끝내기' }).click();
  await page.getByRole('button', { name: '완료', exact: false }).click();
  await expect(page.getByRole('textbox', { name: '전체 지시', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'AI 작업 폴더 연결', exact: true })).toHaveCount(0);
  await expect(page.locator('.handoff-guide')).toContainText('원본을 만든 AI 대화');
  await expect(page.locator('.handoff-guide')).toContainText('새 대화라면 원본 이미지도 함께');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
  await expect(page.getByRole('status').filter({ hasText: '지시 2개 복사' })).toBeVisible();
  const text = await app.evaluate(async ({ clipboard }) => await clipboard.readText());
  expect(text).toContain('지점 (400, 350)');
  expect(text).toContain('지점 (800, 500)');
  expect(text).toContain('영역 (1200, 10, 200, 65)');
  expect(text).toContain('이 대화의 원본 또는 함께 첨부한 이미지');
  expect(text).not.toContain('전체 지시:');
  const imagePath = text
    .split('\n')
    .find((l) => l.startsWith('이미지: '))!
    .slice(5);
  expect((await readFile(imagePath)).subarray(1, 4).toString()).toBe('PNG');
  await page.getByRole('button', { name: '지시 목록', exact: true }).click();
  await expect(page.locator('.note-list-item')).toHaveCount(2);
  await expect
    .poll(async () => {
      const image = await page.locator('.image-canvas image').boundingBox();
      const stage = await page.getByTestId('stage').boundingBox();
      return (
        !!image &&
        !!stage &&
        image.x >= stage.x &&
        image.x + image.width <= stage.x + stage.width + 1
      );
    })
    .toBe(true);
  await page.screenshot({ path: path.join(root, 'test-results/pinto-editor.png') });
  const output = path.join(run, '지시문.txt');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, output);
  await page.getByRole('button', { name: '더 보기' }).click();
  await page.getByRole('button', { name: '지시문 TXT로 저장' }).click();
  await expect.poll(async () => readFile(output, 'utf8').catch(() => '')).toBe(text);
  expect(failures).toEqual([]);
});
test('undo, redo, IME, zoom and local customization instructions', async () => {
  await page.getByRole('button', { name: '지시 목록 닫기' }).click();
  const p = await at(180, 700);
  await page.mouse.click(p.x, p.y);
  const input = page.getByRole('textbox', { name: '수정 지시', exact: true });
  await input.fill('한글 조합');
  await input.evaluate((el) =>
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
    ),
  );
  await expect(input).toBeVisible();
  await input.press('Enter');
  await page.getByRole('button', { name: '실행 취소', exact: true }).click();
  await page.getByRole('button', { name: '다시 실행', exact: true }).click();
  await page.getByRole('button', { name: '확대', exact: true }).click();
  await page.getByRole('button', { name: '지시 복사', exact: false }).click();
  await expect
    .poll(() => app.evaluate(async ({ clipboard }) => await clipboard.readText()))
    .toContain('지점 (180, 700)');
  await page.getByRole('button', { name: '더 보기' }).click();
  await page.getByRole('button', { name: '앱 수정 안내 복사' }).click();
  await expect
    .poll(() => app.evaluate(async ({ clipboard }) => await clipboard.readText()))
    .toContain('AGENTS.md');
  const guide = await app.evaluate(async ({ clipboard }) => await clipboard.readText());
  expect(guide).toContain(root);
  expect(guide).toContain('npm run build');
});
test('restore documents and preserve work before opening a Unicode path', async () => {
  await app.close();
  await launch(true);
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '전체 지시', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '지시 목록', exact: true }).click();
  await expect(page.locator('.note-list-item')).toHaveCount(3);
  const folder = path.join(run, '한글 경로');
  await mkdir(folder);
  const file = path.join(folder, '복사 이미지.png');
  await copyFile(path.join(root, 'assets/example.png'), file);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, file);
  await page.getByRole('button', { name: '열기', exact: true }).click();
  await expect(page.locator('.file-heading')).toContainText('복사 이미지.png');
  await expect(page.locator('.note-list-item')).toHaveCount(0);
  await page.getByRole('button', { name: '더 보기' }).click();
  await page.getByRole('button', { name: '최근 작업', exact: true }).click();
  await expect(page.locator('.recent-modal-list button')).toHaveCount(2);
  await page.locator('.recent-modal-list button').filter({ hasText: 'example.png' }).click();
  await expect(page.locator('.note-list-item')).toHaveCount(3);
  expect(failures).toEqual([]);
});
test('clipboard images, EXIF rotation, WebP, real-file drop and keyboard undo', async () => {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  const png = (await readFile(path.join(root, 'tests/fixtures/transparent.png'))).toString(
    'base64',
  );
  await app.evaluate(async ({ clipboard, ClipboardItem }, bytes) => {
    await clipboard.write([
      new ClipboardItem({
        'image/png': new Blob([Uint8Array.from(Buffer.from(bytes, 'base64'))], {
          type: 'image/png',
        }),
      }),
    ]);
  }, png);
  await page.locator('.file-heading').click();
  await page.keyboard.press(mod + '+v');
  await expect(page.locator('.file-heading')).toContainText('붙여넣은 이미지.png');
  await expect(page.locator('.file-heading')).toContainText('50 × 30');
  for (const [name, size] of [
    ['rotated.jpg', '40 × 80'],
    ['sample.webp', '80 × 40'],
  ]) {
    await app.evaluate(
      ({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
      },
      path.join(root, 'tests/fixtures', name),
    );
    await page.getByRole('button', { name: '열기', exact: true }).click();
    await expect(page.locator('.file-heading')).toContainText(name);
    await expect(page.locator('.file-heading')).toContainText(size);
  }
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'test-native-file';
    input.hidden = true;
    document.body.append(input);
  });
  await page
    .locator('#test-native-file')
    .setInputFiles(path.join(root, 'tests/fixtures/transparent.png'));
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#test-native-file')!;
    const transfer = new DataTransfer();
    transfer.items.add(input.files![0]);
    document
      .querySelector('.app')!
      .dispatchEvent(
        new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }),
      );
    input.remove();
  });
  await expect(page.locator('.file-heading')).toContainText('transparent.png');
  const p = await at(10, 10);
  await page.mouse.click(p.x, p.y);
  const input = page.getByRole('textbox', { name: '수정 지시', exact: true });
  await input.pressSequentially('Test note');
  await input.press(mod + '+z');
  await expect(input).not.toHaveValue('Test note');
  await input.fill('투명도 유지');
  await input.press('Enter');
  await page.keyboard.press(mod + '+z');
  await expect(page.getByRole('button', { name: '지시 복사', exact: false })).toBeDisabled();
  await page.keyboard.press(mod + '+Shift+z');
  await expect(page.getByRole('button', { name: '지시 복사', exact: false })).toBeEnabled();
  await page.getByRole('button', { name: '지시 복사', exact: false }).click();
  await expect
    .poll(() => app.evaluate(async ({ clipboard }) => await clipboard.readText()))
    .toContain('투명도 유지');
  const copied = await app.evaluate(async ({ clipboard }) => await clipboard.readText());
  const reference = copied
    .split('\n')
    .find((s) => s.startsWith('이미지: '))!
    .slice(5);
  const alpha = await app.evaluate(
    ({ nativeImage }, file) => nativeImage.createFromPath(file).toBitmap()[3],
    reference,
  );
  expect(alpha).toBe(128);
  expect(failures).toEqual([]);
});
test('freehand grouping, movement, copying and restoration with clear handoff', async () => {
  test.setTimeout(120_000);
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    },
    path.join(root, 'assets/example.png'),
  );
  await page.getByRole('button', { name: '열기', exact: true }).click();
  await expect(page.locator('.file-heading')).toContainText('example.png');
  if (await page.getByRole('button', { name: '지시 목록 닫기' }).isVisible())
    await page.getByRole('button', { name: '지시 목록 닫기' }).click();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.getByRole('button', { name: '자유도형 도구' }).click();
  async function draw(points: number[][]) {
    const first = await at(points[0][0], points[0][1]);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const [x, y] of points.slice(1)) {
      const p = await at(x, y);
      await page.mouse.move(p.x, p.y);
    }
    await page.mouse.up();
  }
  await draw([
    [300, 300],
    [320, 240],
    [420, 230],
    [500, 300],
    [480, 400],
    [320, 410],
    [300, 300],
  ]);
  await page
    .getByRole('textbox', { name: '수정 지시', exact: true })
    .fill('표시한 두 곳을 더 밝게 해줘.');
  await page.getByRole('button', { name: '대상 추가', exact: true }).click();
  await draw([
    [1000, 700],
    [1100, 760],
    [1200, 820],
  ]);
  await expect(page.getByTestId('note-editor')).toContainText('대상 2개');
  await page.getByRole('button', { name: '완료', exact: false }).click();
  await page.getByRole('button', { name: '점 도구' }).click();
  const from = await at(300, 300),
    to = await at(340, 320);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('button', { name: '완료', exact: false }).click();
  await page.getByRole('button', { name: '지시 복사', exact: false }).click();
  await expect
    .poll(() => app.evaluate(async ({ clipboard }) => await clipboard.readText()))
    .toContain('자유도형 범위 (340, 250, 200, 180)');
  const text = await app.evaluate(async ({ clipboard }) => await clipboard.readText());
  expect(text).toContain('로컬 파일에 접근할 수 있으면');
  expect(text).toContain('이 대화의 원본 또는 함께 첨부한 이미지');
  expect(text.match(/자유도형 범위/g)).toHaveLength(2);
  await page.getByRole('button', { name: '확대', exact: true }).click();
  await page.getByRole('button', { name: '지시 복사', exact: false }).click();
  await expect(page.getByRole('button', { name: '지시 복사', exact: false })).toBeEnabled();
  expect(await app.evaluate(async ({ clipboard }) => await clipboard.readText())).toBe(text);
  await app.close();
  await launch(true);
  await expect(page.getByTestId('freehand-stroke')).toHaveCount(2);
  await expect(page.locator('.handoff-guide')).toContainText('새 대화라면 원본 이미지도 함께');
  await page.getByRole('button', { name: '지시 목록', exact: true }).click();
  await expect(page.locator('.note-list-item')).toHaveCount(1);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({ path: path.join(root, 'test-results/pinto-freehand.png') });
  await page.evaluate(async () => {
    const boot = await window.pinto.bootstrap();
    if (boot.opened)
      await window.pinto.saveDocument({
        ...boot.opened.document,
        globalInstruction: '예전에 작성한 조건',
      });
  });
  await page.reload();
  await page.getByRole('button', { name: '지시 목록', exact: true }).click();
  await page.locator('.legacy-instruction summary').click();
  await expect(page.getByRole('textbox', { name: '이전 버전 추가 지시' })).toHaveValue(
    '예전에 작성한 조건',
  );
  await page.getByRole('button', { name: '지시 복사', exact: false }).click();
  await expect
    .poll(() => app.evaluate(async ({ clipboard }) => await clipboard.readText()))
    .toContain('전체 지시: 예전에 작성한 조건');
  expect(failures).toEqual([]);
});
test('five explicit tools, ellipse resizing and line endpoints survive a restart', async () => {
  test.setTimeout(120_000);
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    },
    path.join(root, 'assets/example.png'),
  );
  await page.getByRole('button', { name: '열기', exact: true }).click();
  await expect(page.locator('.file-heading')).toContainText('example.png');
  for (const label of ['네모', '동그라미', '점', '선', '자유도형'])
    await expect(page.getByRole('button', { name: `${label} 도구`, exact: true })).toBeVisible();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  async function dragBetween(x1: number, y1: number, x2: number, y2: number) {
    const a = await at(x1, y1),
      b = await at(x2, y2);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 2 });
    await page.mouse.up();
  }
  async function comment(text: string) {
    const input = page.getByRole('textbox', { name: '수정 지시', exact: true });
    await input.fill(text);
    await input.press('Enter');
  }
  await page.getByRole('button', { name: '동그라미 도구', exact: true }).click();
  await dragBetween(250, 350, 500, 550);
  await comment('동그라미 안쪽의 색을 바꿔줘.');
  await page.getByRole('button', { name: '점 도구', exact: true }).click();
  await dragBetween(500, 350, 540, 370);
  await dragBetween(540, 570, 600, 600);
  await page.getByRole('button', { name: '완료', exact: false }).click();
  await page.getByRole('button', { name: '선 도구', exact: true }).click();
  await dragBetween(950, 250, 1200, 400);
  await page
    .getByRole('textbox', { name: '수정 지시', exact: true })
    .fill('이 선을 기준으로 맞춰줘.');
  await dragBetween(1200, 400, 1250, 450);
  await page.getByRole('button', { name: '완료', exact: false }).click();
  await page.getByRole('button', { name: '네모 도구', exact: true }).click();
  await dragBetween(600, 600, 850, 750);
  await comment('네모 안의 간격을 넓혀줘.');
  await page.getByRole('button', { name: '점 도구', exact: true }).click();
  const point = await at(120, 150);
  await page.mouse.click(point.x, point.y);
  await comment('이 위치의 문구를 바꿔줘.');
  await page.getByRole('button', { name: '자유도형 도구', exact: true }).click();
  const first = await at(1100, 700);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const [x, y] of [
    [1200, 750],
    [1100, 800],
    [1050, 750],
    [1100, 700],
  ]) {
    const p = await at(x, y);
    await page.mouse.move(p.x, p.y);
  }
  await page.mouse.up();
  await comment('자유도형으로 표시한 부분을 정리해줘.');
  await page.getByRole('button', { name: '지시 복사', exact: false }).click();
  await expect
    .poll(() => app.evaluate(async ({ clipboard }) => await clipboard.readText()))
    .toContain('자유도형으로 표시한 부분');
  const text = await app.evaluate(async ({ clipboard }) => await clipboard.readText());
  expect(text).toContain('타원 영역 (290, 370, 310, 230)');
  expect(text).toContain('선 (950, 250) → (1250, 450)');
  expect(text).toContain('영역 (600, 600, 250, 150)');
  expect(text).toContain('지점 (120, 150)');
  const reference = text
    .split('\n')
    .find((line) => line.startsWith('이미지: '))!
    .slice(5);
  const stored = JSON.parse(
    await readFile(path.join(path.dirname(reference), 'annotations.json'), 'utf8'),
  );
  expect(stored.schemaVersion).toBe(3);
  expect(stored.notes.map((note: { targets: { kind: string }[] }) => note.targets[0].kind)).toEqual(
    ['ellipse', 'line', 'rect', 'point', 'stroke'],
  );
  await app.close();
  await launch(true);
  await expect(page.getByTestId('ellipse-shape')).toHaveCount(1);
  await expect(page.getByTestId('line-shape')).toHaveCount(1);
  await expect(page.getByTestId('freehand-stroke')).toHaveCount(1);
  await page.getByRole('button', { name: '지시 목록', exact: true }).click();
  await expect(page.locator('.note-list-item')).toHaveCount(5);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({ path: path.join(root, 'test-results/pinto-shapes.png') });
  await page.getByRole('button', { name: '지시 복사', exact: false }).click();
  await expect(page.getByRole('button', { name: '지시 복사', exact: false })).toBeEnabled();
  expect(await app.evaluate(async ({ clipboard }) => await clipboard.readText())).toBe(text);
  expect(failures).toEqual([]);
});

test('clear image saves pending notes and stays empty after restart', async () => {
  test.setTimeout(90000);
  if (await page.getByTestId('stage').count())
    await page.getByRole('button', { name: '이미지 닫기', exact: true }).click();
  await page.getByRole('button', { name: '예시 이미지로 둘러보기' }).click();
  await expect(page.getByTestId('stage')).toBeVisible();
  const p = await at(400, 350);
  await page.mouse.click(p.x, p.y);
  await page.getByRole('textbox', { name: '수정 지시', exact: true }).fill('닫기 직전 입력도 보관');
  await page.getByRole('button', { name: '이미지 닫기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '여기, 이렇게.' })).toBeVisible();
  await expect(page.getByTestId('stage')).toHaveCount(0);
  await expect(page.locator('.recent-grid button').first()).toContainText('1개의 지시');
  await app.close();
  await launch(true);
  await expect(page.getByRole('heading', { name: '여기, 이렇게.' })).toBeVisible();
  await page.locator('.recent-grid button').first().click();
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.getByRole('button', { name: '실행 취소', exact: true })).toBeDisabled();
  const restored = await page.evaluate(async () => {
    const recent = await window.pinto.recent();
    return (await window.pinto.openRecent(recent[0].id)).document;
  });
  expect(restored.notes[0].text).toBe('닫기 직전 입력도 보관');
  await page.getByRole('button', { name: '이미지 닫기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '여기, 이렇게.' })).toBeVisible();
  expect(failures).toEqual([]);
});
