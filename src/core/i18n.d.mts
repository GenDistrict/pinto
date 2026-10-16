export type Locale = 'ko' | 'en' | 'es';
export const catalogs: Record<Locale, Record<string, string>>;
export const locales: readonly Locale[];
export function normalizeLocale(value: unknown): Locale;
export function setLocale(value: unknown): void;
export function getLocale(): Locale;
export function tr(key: string, values?: Record<string, unknown>, locale?: Locale): string;
