// If you see a type error for 'formidable', run: npm i --save-dev @types/formidable
import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { PDFDocument } from 'pdf-lib'
import * as Tesseract from 'tesseract.js'
import path from 'path'

export const config = {
  api: {
    bodyParser: false,
  },
}

async function bufferFromRequest(req: Request): Promise<Buffer> {
  const form = formidable({ multiples: false })
  return new Promise((resolve, reject) => {
    form.parse(req as any, (err: any, fields: Fields, files: Files) => {
      if (err) return reject(err)
      const fileField = files.file
      if (!fileField) return reject(new Error('No file uploaded'))
      const fileObj = Array.isArray(fileField) ? fileField[0] : fileField
      // formidable's File type has a 'filepath' property
      if (!('filepath' in fileObj)) return reject(new Error('Invalid file object'))
      readFile((fileObj as { filepath: string }).filepath).then(resolve).catch(reject)
    })
  })
}

// pdf-lib does not provide a direct way to extract images from a page in Node.js
// For now, fallback to treating the PDF buffer as an image for OCR
async function extractImagesFromPDF(_pdfBuffer: Buffer): Promise<Buffer[]> {
  // TODO: For advanced use, use a library like pdf-poppler or pdf-image to rasterize each page to an image buffer
  // For now, fallback to treating the buffer as a single image
  return []
}

async function ocrBuffer(buffer: Buffer): Promise<string> {
  const worker = Tesseract.createWorker({
    logger: () => {},
  });
  await worker.load();
  await worker.loadLanguage('ita+eng');
  await worker.initialize('ita+eng');
  const { data } = await worker.recognize(buffer);
  await worker.terminate();
  return data.text;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const keys = Array.from(formData.keys());
    console.log('OCR /api/ocr form keys:', keys);
    const file = formData.get('file');
    console.log('OCR /api/ocr file:', file);
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded', debug: keys }, { status: 400 });
    }
    // file is a Blob
    const arrayBuffer = await (file as Blob).arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = await ocrBuffer(buffer);
    return NextResponse.json({ text: text.trim() });
  } catch (err) {
    console.error('OCR /api/ocr error:', err);
    return NextResponse.json({ error: 'OCR error', details: String(err) }, { status: 500 });
  }
} 