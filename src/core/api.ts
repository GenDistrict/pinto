import type { AppInfo, Bootstrap, Document, ImageSource, OpenDocument, Recent } from './model';
import type { CollectionView, SharedInstruction } from './collection';
import type { Surface, LiveAction } from './surfaces';
export interface PintoAPI {
  bootstrap(): Promise<Bootstrap>;
  info(): Promise<AppInfo>;
  setLanguage(locale: string): Promise<AppInfo>;
  pickImage(): Promise<ImageSource | null>;
  pickImages(): Promise<{ token: string; name: string }[]>;
  readPickedImage(token: string): Promise<ImageSource>;
  openWebApp(url: string): Promise<OpenDocument>;
  interactDocument(id: string, action?: LiveAction): Promise<OpenDocument>;
  openWebWindow(id: string): Promise<void>;
  openOriginal(id: string): Promise<void>;
  collection(): Promise<CollectionView | null>;
  activateImage(id: string): Promise<OpenDocument>;
  removeImage(id: string): Promise<OpenDocument>;
  saveSharedInstructions(id: string, instructions: SharedInstruction[]): Promise<void>;
  importFile(file: File): Promise<ImageSource>;
  clipboardImage(): Promise<ImageSource | null>;
  example(): Promise<ImageSource>;
  createDocument(input: {
    token: string;
    dataUrl: string;
    append?: boolean;
    surface?: Surface;
    width?: number;
    height?: number;
    name?: string;
    keepToken?: boolean;
  }): Promise<OpenDocument>;
  saveDocument(doc: Document): Promise<void>;
  closeDocument(): Promise<void>;
  openRecent(id: string): Promise<OpenDocument>;
  recent(): Promise<Recent[]>;
  copyInstructions(doc: Document): Promise<number>;
  exportInstructions(doc: Document): Promise<boolean>;
  copyModificationGuide(): Promise<void>;
  chooseWorkspace(id?: string): Promise<{ info: AppInfo; opened?: OpenDocument } | null>;
  revealSource(): Promise<void>;
  revealReference(id: string): Promise<void>;
  ready(): Promise<void>;
  closeReady(): Promise<void>;
  onImage(callback: (source: ImageSource) => void): () => void;
  onOpenImages(callback: () => void): () => void;
  onBeforeClose(callback: () => void): () => void;
  onEdit(callback: (command: 'undo' | 'redo') => void): () => void;
}
declare global {
  interface Window {
    pinto: PintoAPI;
  }
}
