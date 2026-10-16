// Record the real localized UI in isolated data. Optional narration: --audio-dir <folder>.
import { _electron as electron } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tr } from '../src/core/i18n.mjs';

const root = process.cwd(),
  out = path.join(root, 'docs/examples');
const work = path.join(root, '.test-data', `localized-demo-${Date.now()}`);
await fs.mkdir(work, { recursive: true });
await fs.mkdir(out, { recursive: true });
const audioArg = process.argv.indexOf('--audio-dir');
const audioDir = audioArg >= 0 ? process.argv[audioArg + 1] : null;
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
for (const locale of ['en', 'es']) {
  const l = (id, values) => tr(id, values, locale);
  const events = {};
  let count = 0,
    recording = false,
    loop,
    encoder;
  const app = await electron.launch({
    args: [
      root,
      '--isolated',
      '--background',
      '--no-restore',
      '--language',
      locale,
      '--data-dir',
      path.join(work, locale, 'data'),
      '--workspace',
      work,
    ],
    env,
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1320, 880),
    );
    await page.getByRole('heading', { name: l('m051') }).waitFor();
    await page.evaluate(() => {
      const c = document.createElement('div');
      c.style.cssText =
        'position:fixed;width:18px;height:18px;border:3px solid #c64b28;background:#ffffff80;border-radius:50%;pointer-events:none;z-index:99999;transform:translate(-50%,-50%);left:900px;top:400px';
      document.body.append(c);
      window.addEventListener('pointermove', (e) => {
        c.style.left = e.clientX + 'px';
        c.style.top = e.clientY + 'px';
      });
      window.addEventListener('pointerdown', () => (c.style.background = '#c64b28'));
      window.addEventListener('pointerup', () => (c.style.background = '#ffffff80'));
    });
    encoder = spawn(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        '-r',
        '12',
        '-i',
        '-',
        '-vf',
        'scale=1320:880',
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        path.join(work, `${locale}-raw.mp4`),
      ],
      { windowsHide: true, stdio: ['pipe', 'inherit', 'inherit'] },
    );
    const closed = once(encoder, 'close');
    let latest;
    await page.screencast.start({
      size: { width: 1320, height: 880 },
      fps: 24,
      quality: 90,
      onFrame: ({ data }) => {
        latest = data;
      },
    });
    recording = true;
    loop = (async () => {
      while (recording) {
        const before = Date.now();
        if (latest) {
          if (!encoder.stdin.write(latest)) await once(encoder.stdin, 'drain');
          count++;
        }
        await new Promise((r) => setTimeout(r, Math.max(1, 83 - (Date.now() - before))));
      }
    })();
    const mark = (n) => (events[n] = count / 12);
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: l('m058') }).hover();
    await page.waitForTimeout(350);
    await page.getByRole('button', { name: l('m058') }).click();
    await page.getByTestId('stage').waitFor();
    mark('opened');
    async function at(x, y) {
      const b = await page.getByTestId('stage').boundingBox();
      const v = await page
        .getByTestId('image-transform')
        .evaluate((e) => ({ x: +e.dataset.x, y: +e.dataset.y, s: +e.dataset.scale }));
      return { x: b.x + v.x + x * v.s, y: b.y + v.y + y * v.s };
    }
    let a = await at(1240, 25),
      b = await at(1395, 65);
    await page.getByRole('button', { name: l('m113', { p0: l('m103') }) }).click();
    await page.mouse.move(a.x, a.y, { steps: 16 });
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(a.x + ((b.x - a.x) * i) / 20, a.y + ((b.y - a.y) * i) / 20);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    const input = page.getByRole('textbox', { name: l('m131'), exact: true });
    await input.pressSequentially(
      locale === 'en' ? 'Make this button larger.' : 'Haz este botón más grande.',
      { delay: 65 },
    );
    await page.waitForTimeout(600);
    await input.press('Enter');
    mark('first');
    await page.getByRole('button', { name: l('m113', { p0: l('m107') }) }).click();
    a = await at(760, 550);
    await page.mouse.move(a.x, a.y, { steps: 16 });
    await page.mouse.click(a.x, a.y);
    await input.pressSequentially(
      locale === 'en' ? 'Use a warmer background.' : 'Usa un fondo más cálido.',
      { delay: 65 },
    );
    await page.waitForTimeout(600);
    await input.press('Enter');
    await page.getByRole('button', { name: l('m026'), exact: true }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(out, `pinto-${locale}.png`), scale: 'css' });
    mark('copy');
    await page.getByRole('button', { name: l('m028'), exact: false }).hover();
    await page.waitForTimeout(450);
    await page.getByRole('button', { name: l('m028'), exact: false }).click();
    await page
      .getByRole('status')
      .filter({ hasText: l('m012', { p0: 2 }) })
      .waitFor();
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    // The sample keeps the real format but replaces the machine-specific absolute path.
    await fs.writeFile(
      path.join(out, `instructions-${locale}.txt`),
      copied.replace(/^((?:Image|Imagen): ).+$/m, '$1/path/to/reference.png') + '\n',
    );
    await page.waitForTimeout(1200);
    mark('end');
    recording = false;
    await loop;
    await page.screencast.stop();
    encoder.stdin.end();
    const [code] = await closed;
    if (code) throw new Error('Recording failed');
    await fs.writeFile(path.join(work, `${locale}-events.json`), JSON.stringify(events, null, 2));
    const target = 20,
      raw = count / 12;
    const args = [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      path.join(work, `${locale}-raw.mp4`),
    ];
    if (audioDir) args.push('-i', path.join(audioDir, `pinto-localized-${locale}.wav`));
    args.push(
      '-vf',
      `setpts=${target / raw}*PTS,fps=24`,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
    );
    if (audioDir) args.push('-af', 'adelay=300:all=1,apad', '-c:a', 'aac', '-b:a', '192k');
    args.push(
      '-t',
      String(target),
      '-movflags',
      '+faststart',
      path.join(out, `pinto-${locale}.mp4`),
    );
    const render = spawn('ffmpeg', args, { windowsHide: true, stdio: 'inherit' });
    const [result] = await once(render, 'close');
    if (result) throw new Error('Demo encoding failed');
    console.log(JSON.stringify({ locale, events, video: path.join(out, `pinto-${locale}.mp4`) }));
  } finally {
    recording = false;
    if (loop) await loop;
    if (encoder?.stdin.writable) encoder.stdin.end();
    await app.close();
  }
}
