import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
declare const __PDF_ASSET_DIR__: string;
GlobalWorkerOptions.workerSrc = workerUrl;
export async function extractKnowledgePdf(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('无法读取 PDF');
  const data = new Uint8Array(await response.arrayBuffer());
  const base = new URL(
    import.meta.env.DEV ? '/@fs/' + __PDF_ASSET_DIR__ + '/' : './pdfjs/',
    document.baseURI,
  ).href;
  const task = getDocument({
    data,
    cMapUrl: base + 'cmaps/',
    cMapPacked: true,
    standardFontDataUrl: base + 'standard_fonts/',
    wasmUrl: base + 'wasm/',
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 300) throw new Error('首版每份 PDF 最多提取 300 页，请选择章节文件');
    const pages: string[] = [];
    let characters = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number),
        content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          'str' in item ? item.str + ('hasEOL' in item && item.hasEOL ? '\n' : '') : '',
        )
        .join('');
      characters += text.length;
      if (text.length > 100000 || characters > 2000000)
        throw new Error('PDF 正文过长，请选择章节文件');
      pages.push(text);
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}
