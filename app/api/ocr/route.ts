// If you see a type error for 'formidable', run: npm i --save-dev @types/formidable
import { NextRequest, NextResponse } from 'next/server'
import * as Tesseract from 'tesseract.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

// pdf-lib does not provide a direct way to extract images from a page in Node.js
// For now, fallback to treating the PDF buffer as an image for OCR
async function extractImagesFromPDF(_pdfBuffer: Buffer): Promise<Buffer[]> {
  // TODO: For advanced use, use a library like pdf-poppler or pdf-image to rasterize each page to an image buffer
  // For now, fallback to treating the buffer as a single image
  return []
}

async function ocrBuffer(buffer: Buffer): Promise<string> {
  const worker = await Tesseract.createWorker('ita+eng');
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