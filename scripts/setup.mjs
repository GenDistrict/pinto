import { tr, setLocale, getLocale } from '../src/core/i18n.mjs';
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
  if (status.status !== 'ok') throw new Error(tr('m208'));
  const launcher = await shortcuts();
  await initializeBaseline(ROOT);
  const extra = [];
  for (const name of ['--workspace', '--data-dir', '--image']) {
    const value = option(name);
    if (value) extra.push(name, path.resolve(value));
  }
  if (process.argv.includes('--isolated')) extra.push('--isolated');
  if (process.argv.includes('--background')) extra.push('--background');
  if (option('--language')) extra.push('--language', option('--language'));
  const ready = process.argv.includes('--no-launch')
    ? { status: 'installed', windowReady: false }
    : await launch(extra);
  if (ready.locale) setLocale(ready.locale);
  const report = {
    ...status,
    ...ready,
    locale: getLocale(),
    launcher,
    sourceEditable: true,
    modificationGuide: status.modificationGuide,
    modificationPrompt: ready.modificationGuide || '',
    assistantMessage: ready.windowReady ? tr('m209') : tr('m210'),
    requiredFinalResponse: [tr('m211'), tr('m212'), tr('m213'), tr('m214'), tr('m215')],
  };
  await writeJSON(path.join(ROOT, '.pinto/install-result.json'), report);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(JSON.stringify({ status: 'failed', message: error.message }));
  process.exitCode = 1;
}
