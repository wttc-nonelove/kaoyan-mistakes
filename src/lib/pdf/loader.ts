import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

export type PdfDoc = PDFDocumentProxy

export async function openPdf(data: ArrayBuffer): Promise<PdfDoc> {
  // pdf.js 会把 ArrayBuffer 转移给 worker，传副本避免调用方拿到 detached buffer
  const task = pdfjs.getDocument({
    data: new Uint8Array(data.slice(0)),
    // 扫描件不需要 cMap；关掉提高首次渲染速度
    isEvalSupported: false,
    disableFontFace: false,
  })
  return task.promise
}

export async function getPageSize(doc: PdfDoc, pageNo: number): Promise<{ w: number; h: number }> {
  const page = await doc.getPage(pageNo)
  const vp = page.getViewport({ scale: 1 })
  return { w: vp.width, h: vp.height }
}
