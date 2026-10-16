import ko from './locales/ko.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };
import es from './locales/es.json' with { type: 'json' };

export const catalogs = { ko, en, es };
export const locales = ['ko', 'en', 'es'];
let current = 'ko';
export function normalizeLocale(value) {
  const language = String(value || '')
    .toLowerCase()
    .split(/[-_]/)[0];
  return locales.includes(language) ? language : 'en';
}
export function setLocale(value) {
  current = normalizeLocale(value);
}
export function getLocale() {
  return current;
}
export function tr(key, values = {}, locale = current) {
  const message = catalogs[normalizeLocale(locale)][key] ?? en[key];
  if (message === undefined) throw new Error(`Missing translation: ${key}`);
  return message.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(values, name) ? String(values[name]) : match,
  );
}
