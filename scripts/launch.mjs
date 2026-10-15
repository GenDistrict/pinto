import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, cleanEnv, electronPath } from './lib/runtime.mjs';

export async function launch(extra = []) {
  const directory = path.join(ROOT, '.pinto');
  await fs.mkdir(directory, { recursive: true });
  const ready = path.join(directory, 'ready', `${randomUUID()}.json`);
  await fs.mkdir(path.dirname(ready), { recursive: true });
  const log = await fs.open(path.join(directory, 'app.log'), 'a');
  let failure;
  const child = spawn(await electronPath(), [ROOT, ...extra, '--ready-file', ready], {
    cwd: ROOT,
    env: cleanEnv(),
    detached: true,
    windowsHide: extra.includes('--background'),
    stdio: ['ignore', log.fd, log.fd],
  });
  child.on('error', (error) => {
    failure = error;
  });
  child.on('exit', (code) => {
    if (code) failure = new Error(`PINTO exited with code ${code}. See .pinto/app.log`);
  });
  child.unref();
  await log.close();
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const report = JSON.parse(await fs.readFile(ready, 'utf8'));
      if (report.status === 'ready' && report.windowReady) {
        await fs.rm(ready, { force: true });
        if (path.resolve(report.sourceRoot).toLowerCase() !== path.resolve(ROOT).toLowerCase())
          throw new Error(
            '다른 소스 폴더의 PINTO가 실행 중입니다. 그 창을 닫고 다시 실행해 주세요.',
          );
        return report;
      }
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    if (failure) throw failure;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('앱 화면의 준비 응답을 받지 못했습니다. .pinto/app.log를 확인하세요.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'scripts/launch.mjs')) {
  try {
    console.log(JSON.stringify(await launch(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: 'failed', message: error.message }));
    process.exitCode = 1;
  }
}
