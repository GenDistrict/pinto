import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ROOT, option, run, writeJSON, shellQuote, electronPath } from './lib/runtime.mjs';
import { diagnose } from './doctor.mjs';
import { launch } from './launch.mjs';
import { initializeBaseline } from './lib/source.mjs';

function psString(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}
async function shortcuts() {
  const state = path.join(ROOT, '.pinto');
  await fs.mkdir(state, { recursive: true });
  if (process.platform === 'win32') {
    const launcher = path.join(ROOT, 'PINTO.lnk');
    const executable = await electronPath();
    const sourcePath = path.resolve(ROOT);
    const script = [
      `$ErrorActionPreference = 'Stop'`,
      `$pintoShell = New-Object -ComObject WScript.Shell`,
      `$pintoTargets = @(${psString(launcher)})`,
    ];
    if (!process.argv.includes('--no-shortcut')) {
      script.push(
        `$pintoDesktop = [Environment]::GetFolderPath('Desktop')`,
        `$pintoDesktopLink = Join-Path $pintoDesktop 'PINTO.lnk'`,
        `$pintoSuffix = 1`,
        `while (Test-Path -LiteralPath $pintoDesktopLink) {`,
        `  $pintoExistingLink = $pintoShell.CreateShortcut($pintoDesktopLink)`,
        `  if ($pintoExistingLink.TargetPath -eq ${psString(executable)} -and $pintoExistingLink.Arguments -eq ${psString('"' + sourcePath + '"')}) { break }`,
        `  $pintoDesktopLink = Join-Path $pintoDesktop ("PINTO-local-" + $pintoSuffix + '.lnk')`,
        `  $pintoSuffix++`,
        `}`,
        `$pintoTargets += $pintoDesktopLink`,
      );
    }
    script.push(
      `foreach ($pintoTarget in $pintoTargets) {`,
      `  $pintoLink = $pintoShell.CreateShortcut($pintoTarget)`,
      `  $pintoLink.TargetPath = ${psString(executable)}`,
      `  $pintoLink.Arguments = ${psString('"' + sourcePath + '"')}`,
      `  $pintoLink.WorkingDirectory = ${psString(ROOT)}`,
      `  $pintoLink.IconLocation = ${psString(path.join(ROOT, 'assets/icon.ico'))}`,
      `  $pintoLink.Save()`,
      `}`,
    );
    const file = path.join(state, 'create-shortcut.ps1');
    await fs.writeFile(file, '\ufeff' + script.join('\r\n'), 'utf8');
    await run(
      path.join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      ),
      ['-NoProfile', '-File', file],
    );
    return launcher;
  }
  if (process.platform === 'darwin') {
    const launcher = path.join(ROOT, 'PINTO.command');
    await fs.writeFile(
      launcher,
      `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(path.join(ROOT, 'scripts/launch.mjs'))}\n`,
      { mode: 0o755 },
    );
    if (!process.argv.includes('--no-shortcut')) {
      const destination = path.join(os.homedir(), 'Applications', 'PINTO.app');
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const command = `${shellQuote(process.execPath)} ${shellQuote(path.join(ROOT, 'scripts/launch.mjs'))} >/dev/null 2>&1 &`;
      const script =
        'do shell script "' + command.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
      await run('/usr/bin/osacompile', ['-o', destination, '-e', script]);
      return destination;
    }
    return launcher;
  }
  return path.join(ROOT, 'scripts/launch.mjs');
}
try {
  const status = await diagnose();
  if (status.status !== 'ok')
    throw new Error('실행 준비가 끝나지 않았습니다. 설치 스크립트를 먼저 실행하세요.');
  const launcher = await shortcuts();
  await initializeBaseline(ROOT);
  const extra = [];
  for (const name of ['--workspace', '--data-dir', '--image']) {
    const value = option(name);
    if (value) extra.push(name, path.resolve(value));
  }
  if (process.argv.includes('--isolated')) extra.push('--isolated');
  if (process.argv.includes('--background')) extra.push('--background');
  const ready = process.argv.includes('--no-launch')
    ? { status: 'installed', windowReady: false }
    : await launch(extra);
  const report = {
    ...status,
    ...ready,
    launcher,
    sourceEditable: true,
    modificationGuide: status.modificationGuide,
    modificationPrompt: ready.modificationGuide || '',
    assistantMessage: ready.windowReady
      ? '설치했고 앱 창을 열었습니다. PINTO는 로컬 소스를 직접 수정해서 사용할 수 있습니다. 원하는 동작을 말해 주시면 코드를 수정하고 확인한 뒤 다시 실행할 수 있습니다.'
      : '소스 설치가 완료되었습니다. 앱 실행은 생략했습니다. PINTO의 로컬 소스를 사용자 요청에 맞게 수정할 수 있습니다.',
    requiredFinalResponse: [
      '실행 확인 결과',
      '소스 위치',
      '실행 방법',
      '이 앱의 소스를 수정해서 쓸 수 있다는 설명',
      '글자 크기·단축키·지시문 형식 변경 예시',
    ],
  };
  await writeJSON(path.join(ROOT, '.pinto/install-result.json'), report);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', message: error.message }));
  process.exitCode = 1;
}
