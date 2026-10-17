import { tr } from '../core/i18n.mjs';
import type { ImageSource } from '../core/model';
import type { Surface, ContextBox } from '../core/surfaces';
export type PreparedPage = {
  dataUrl: string;
  name?: string;
  surface?: Surface;
  width?: number;
  height?: number;
  keepToken?: boolean;
};
export async function* preparePdf(source: ImageSource): AsyncGenerator<PreparedPage> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', location.href).href;
  const data = Uint8Array.from(atob(source.dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
  const task = pdfjs.getDocument({
    data,
    cMapUrl: new URL('pdfjs/cmaps/', location.href).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('pdfjs/standard_fonts/', location.href).href,
    isEvalSupported: false,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 20) throw new Error(tr('docPdfLimit'));
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i),
        base = page.getViewport({ scale: 1 }),
        view = page.getViewport({ scale: Math.min(2400 / Math.max(base.width, base.height), 3) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(view.width);
      canvas.height = Math.ceil(view.height);
      const context = canvas.getContext('2d')!;
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport: view }).promise;
      const text = await page.getTextContent();
      const boxes: ContextBox[] = [];
      for (const item of text.items) {
        if (!('str' in item) || !item.str) continue;
        const [a, b, c, d, x, y] = pdfjs.Util.transform(base.transform, item.transform);
        const baseline = Math.hypot(a, b) || 1,
          advance = item.width || baseline * item.str.length * 0.5;
        const style = text.styles[item.fontName];
        const ascent = style?.ascent ?? 0.85,
          descent = style?.descent ?? -0.15;
        const corners = [
          { x: x + c * ascent, y: y + d * ascent },
          { x: x + c * descent, y: y + d * descent },
          {
            x: x + (a / baseline) * advance + c * ascent,
            y: y + (b / baseline) * advance + d * ascent,
          },
          {
            x: x + (a / baseline) * advance + c * descent,
            y: y + (b / baseline) * advance + d * descent,
          },
        ];
        const minX = Math.min(...corners.map((p) => p.x)),
          minY = Math.min(...corners.map((p) => p.y));
        boxes.push({
          x: minX,
          y: minY,
          width: Math.max(1, Math.max(...corners.map((p) => p.x)) - minX),
          height: Math.max(1, Math.max(...corners.map((p) => p.y)) - minY),
          text: item.str.slice(0, 2000),
        });
      }
      if (boxes.length > 5000) boxes.length = 5000;
      yield {
        dataUrl: canvas.toDataURL('image/png'),
        name: `${source.name} · ${i}/${pdf.numPages}`,
        width: Math.ceil(base.width),
        height: Math.ceil(base.height),
        surface: {
          kind: 'pdf',
          path: source.surface!.path,
          page: i,
          pageCount: pdf.numPages,
          boxes,
        },
        keepToken: i < pdf.numPages,
      };
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
  } catch (error) {
    if (error instanceof Error && error.message === tr('docPdfLimit')) throw error;
    throw new Error(tr('docPdfFailed'));
  } finally {
    await task.destroy();
  }
}
