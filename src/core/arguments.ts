export const launchKeys = ['--workspace', '--image', '--data-dir', '--ready-file'] as const;
export type LaunchKey = (typeof launchKeys)[number];
export type LaunchOptions = Partial<Record<LaunchKey, string>>;

export function parseLaunchOptions(args: string[]): LaunchOptions {
  const result: LaunchOptions = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i] as LaunchKey;
    if (!launchKeys.includes(key)) continue;
    const value = args[++i];
    if (!value || value.startsWith('--'))
      throw new Error(`${key} 뒤에 파일 또는 폴더 경로가 필요합니다.`);
    result[key] = value;
  }
  return result;
}

export function readLaunchOptions(value: unknown): LaunchOptions {
  if (!value || typeof value !== 'object') throw new Error('실행 정보가 올바르지 않습니다.');
  const record = value as Record<string, unknown>,
    args: string[] = [];
  for (const key of launchKeys) {
    if (record[key] === undefined) continue;
    if (typeof record[key] !== 'string') throw new Error('실행 경로가 올바르지 않습니다.');
    args.push(key, record[key]);
  }
  return parseLaunchOptions(args);
}
