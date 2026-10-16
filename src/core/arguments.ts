import { tr } from './i18n.mjs';
export const launchKeys = [
  '--workspace',
  '--image',
  '--data-dir',
  '--ready-file',
  '--language',
] as const;
export type LaunchKey = (typeof launchKeys)[number];
export type LaunchOptions = Partial<Record<LaunchKey, string>>;

export function parseLaunchOptions(args: string[]): LaunchOptions {
  const result: LaunchOptions = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i] as LaunchKey;
    if (!launchKeys.includes(key)) continue;
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(tr('m201', { p0: key }));
    result[key] = value;
  }
  return result;
}

export function readLaunchOptions(value: unknown): LaunchOptions {
  if (!value || typeof value !== 'object') throw new Error(tr('m202'));
  const record = value as Record<string, unknown>,
    args: string[] = [];
  for (const key of launchKeys) {
    if (record[key] === undefined) continue;
    if (typeof record[key] !== 'string') throw new Error(tr('m203'));
    args.push(key, record[key]);
  }
  return parseLaunchOptions(args);
}
