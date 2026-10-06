// Extract plain text from an uploaded resume file (PDF, Word .docx, or plain
// text), so it can be fed to the AI for match / ATS analysis. PDF parsing runs
// in a bundled web worker via pdf.js — the side panel is an extension page, so
// workers are allowed here. .docx is just a zip of XML, unpacked with fflate.
import * as pdfjs from 'pdfjs-dist';
// Vite bundles this as a Worker constructor; crxjs ships it inside the extension.
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
import { strFromU8, unzipSync } from 'fflate';

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

const MAX_CHARS = 18000;
const NBSP = / /g;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Read a resume File and return its text. Throws with a friendly message on failure. */
export async function extractResumeText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  let raw: string;
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
    raw = await extractPdf(file);
  } else if (file.type === DOCX_MIME || name.endsWith('.docx')) {
    raw = await extractDocx(file);
  } else if (name.endsWith('.doc')) {
    throw new Error('Legacy .doc files aren’t supported — save it as .docx or .pdf, or paste the text.');
  } else {
    raw = await file.text();
  }
  const cleaned = raw
    .replace(/\r/g, '')
    .replace(NBSP, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!cleaned) throw new Error('No selectable text found — this may be a scanned/image file. Paste the text instead.');
  return cleaned.slice(0, MAX_CHARS);
}

async function extractPdf(file: File): Promise<string> {
  try {
    const data = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data }).promise;
    let out = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      out += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
    }
    return out;
  } catch {
    throw new Error("Couldn't read that PDF. Try a .txt file or paste the resume text.");
  }
}

async function extractDocx(file: File): Promise<string> {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const unzipped = unzipSync(buf, { filter: (f) => f.name === 'word/document.xml' });
    const xmlBytes = unzipped['word/document.xml'];
    if (!xmlBytes) throw new Error('no document.xml');
    const xml = strFromU8(xmlBytes);
    return xml
      .replace(/<w:tab\b[^>]*\/>/g, '\t')
      .replace(/<w:br\b[^>]*\/?>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '') // strip remaining XML tags, keeping the text runs
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'");
  } catch {
    throw new Error("Couldn't read that .docx. Try a PDF/.txt file or paste the resume text.");
  }
}
