import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { PintoAPI } from '../core/api';
const invoke = (name: string, ...args: unknown[]) => ipcRenderer.invoke(`pinto:${name}`, ...args);
const api: PintoAPI = {
  bootstrap: () => invoke('bootstrap'),
  info: () => invoke('info'),
  setLanguage: (locale) => invoke('set-language', locale),
  pickImage: () => invoke('pick-image'),
  importFile: (file) => invoke('import-file', webUtils.getPathForFile(file)),
  clipboardImage: () => invoke('clipboard-image'),
  example: () => invoke('example'),
  createDocument: (input) => invoke('create-document', input),
  saveDocument: (doc) => invoke('save', doc),
  closeDocument: () => invoke('close-document'),
  openRecent: (id) => invoke('open-recent', id),
  recent: () => invoke('recent'),
  copyInstructions: (doc) => invoke('copy', doc),
  exportInstructions: (doc) => invoke('export', doc),
  copyModificationGuide: () => invoke('copy-modification'),
  chooseWorkspace: (id) => invoke('workspace', id),
  revealSource: () => invoke('reveal-source'),
  revealReference: (id) => invoke('reveal-reference', id),
  ready: () => invoke('ready'),
  closeReady: () => invoke('close-ready'),
  onImage: (callback) => {
    const listener = (_: unknown, value: Parameters<typeof callback>[0]) => callback(value);
    ipcRenderer.on('pinto:image', listener);
    return () => ipcRenderer.removeListener('pinto:image', listener);
  },
  onBeforeClose: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('pinto:before-close', listener);
    return () => ipcRenderer.removeListener('pinto:before-close', listener);
  },
  onEdit: (callback) => {
    const listener = (_: unknown, command: 'undo' | 'redo') => callback(command);
    ipcRenderer.on('pinto:edit', listener);
    return () => ipcRenderer.removeListener('pinto:edit', listener);
  },
};
contextBridge.exposeInMainWorld('pinto', api);
