import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import PDFParser from 'pdf2json'
import tesseract from 'node-tesseract-ocr'
import fs from 'fs/promises'
import { tmpdir } from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'
import { logInteraction } from '@/lib/logger'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { generateChunkEmbeddings } from '@/lib/embeddings'
import { getOptimalChunkingConfig } from '@/lib/chunking-config'
import { chunkWithStrategy } from '@/lib/optimized-chunking'

const execAsync = promisify(exec)

// Global map to track active upload cancellations
const activeUploads = new Map<string, { cancelled: boolean, controller: AbortController }>()

// Funzione per dividere il testo in chunk
function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = []
  let start = 0
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    let chunk = text.substring(start, end)
    
    // Se non è l'ultimo chunk, cerca di tagliare su un punto o spazio
    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf('.')
      const lastSpace = chunk.lastIndexOf(' ')
      
      if (lastPeriod > chunk.length * 0.7) {
        chunk = chunk.substring(0, lastPeriod + 1)
        start = start + lastPeriod + 1
      } else if (lastSpace > chunk.length * 0.7) {
        chunk = chunk.substring(0, lastSpace + 1)
        start = start + lastSpace + 1
      } else {
        start = end
      }
    } else {
      start = end
    }
    
    chunks.push(chunk.trim())
    
    // Overlap
    if (start < text.length) {
      start = Math.max(0, start - overlap)
    }
  }
  
  return chunks.filter(chunk => chunk.length > 0)
}

// Funzione per estrarre testo da PDF usando pdf2json
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser()
    
    pdfParser.on('pdfParser_dataReady', (pdfData) => {
      try {
        console.log(`[UPLOAD] PDF analizzato: ${pdfData.Pages?.length || 0} pagine`)
        
        if (!pdfData.Pages || pdfData.Pages.length === 0) {
          reject(new Error('PDF non ha pagine leggibili'))
          return
        }

        let text = ''
        let totalTextElements = 0
        
        for (const page of pdfData.Pages) {
          if (page.Texts && page.Texts.length > 0) {
            for (const textItem of page.Texts) {
              for (const textPiece of textItem.R) {
                text += decodeURIComponent(textPiece.T) + ' '
                totalTextElements++
              }
            }
            text += '\n'
          }
        }
        
        console.log(`[UPLOAD] Elementi di testo trovati: ${totalTextElements}`)
        
        // Se il PDF ha poche pagine ma zero elementi di testo, è probabilmente scansionato
        if (totalTextElements === 0) {
          reject(new Error('SCANNED_PDF'))
          return
        }
        
        // Se il rapporto testo/pagine è molto basso, potrebbe essere un PDF misto o di bassa qualità
        const textPerPage = totalTextElements / pdfData.Pages.length
        console.log(`[UPLOAD] Elementi di testo per pagina: ${textPerPage.toFixed(2)}`)
        
        if (textPerPage < 5 && pdfData.Pages.length > 1) {
          console.log('[UPLOAD] Avviso: PDF potrebbe contenere molte immagini o essere parzialmente scansionato')
        }
        
        // Check if extracted text is corrupted/gibberish before applying fixes
        const cleanText = text.trim();
        const totalChars = cleanText.replace(/\s/g, '').length;
        const alphabeticChars = (cleanText.match(/[a-zA-Zàèéìíîòóùúäöüß]/g) || []).length;
        const alphaRatio = totalChars > 0 ? alphabeticChars / totalChars : 0;
        
        // If text appears corrupted (very low alphabetic ratio), suggest OCR
        if (alphaRatio < 0.3 && totalChars > 100) {
          console.log(`[UPLOAD] Extracted text appears corrupted (${(alphaRatio * 100).toFixed(1)}% alphabetic chars). PDF may need OCR.`);
          reject(new Error('CORRUPTED_PDF_TEXT'))
          return;
        }
        
        // Apply character spacing fix to pdf2json text
        const fixedText = fixCharacterSpacing(cleanText)
        resolve(fixedText)
      } catch (error) {
        reject(error)
      }
    })
    
    pdfParser.on('pdfParser_dataError', (error) => {
      reject(error)
    })
    
    pdfParser.parseBuffer(buffer)
  })
}

// Funzione per convertire PDF in immagini usando pdftoppm direttamente
async function convertPDFToImages(pdfPath: string, outputDir: string): Promise<string[]> {
  try {
    // Usa pdftoppm con parametri ottimizzati per OCR LSTM
    // 300 DPI è ottimale per Tesseract LSTM (migliore di 200 per testi piccoli)
    // Aggiungiamo opzioni per migliorare la qualità dell'immagine
    const command = `pdftoppm -jpeg -r 300 -jpegopt quality=95 -aa yes -aaVector yes "${pdfPath}" "${path.join(outputDir, 'page')}"`
    console.log(`[UPLOAD] Eseguendo comando: ${command}`)
    
    const { stdout, stderr } = await execAsync(command)
    
    if (stderr) {
      console.warn('[UPLOAD] Warning pdftoppm:', stderr)
    }
    
    // Lista i file generati
    const files = await fs.readdir(outputDir)
    const imageFiles = files
      .filter(file => file.startsWith('page') && file.endsWith('.jpg'))
      .sort()
      .map(file => path.join(outputDir, file))
    
    console.log(`[UPLOAD] Generati ${imageFiles.length} file immagine a 300 DPI con anti-aliasing`)
    
    // Log delle dimensioni dei primi file per diagnostica
    if (imageFiles.length > 0) {
      try {
        const firstImageStats = await fs.stat(imageFiles[0])
        console.log(`[UPLOAD] Prima immagine: ${imageFiles[0]}, dimensione: ${(firstImageStats.size / 1024).toFixed(1)} KB`)
      } catch (statError) {
        console.warn('[UPLOAD] Impossibile leggere stats prima immagine:', statError)
      }
    }
    
    return imageFiles
    
  } catch (error) {
    console.error('[UPLOAD] Errore conversione PDF:', error)
    throw new Error(`Errore conversione PDF in immagini: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`)
  }
}

// Funzione per correggere il problema dei caratteri spaziati nell'OCR
function fixCharacterSpacing(text: string): string {
  // First, check if text is completely corrupted/gibberish
  const totalChars = text.replace(/\s/g, '').length;
  const alphabeticChars = (text.match(/[a-zA-Zàèéìíîòóùúäöüß]/g) || []).length;
  const alphaRatio = totalChars > 0 ? alphabeticChars / totalChars : 0;
  
  // If less than 50% alphabetic characters, probably corrupted - don't try to fix
  if (alphaRatio < 0.5 && totalChars > 100) {
    console.log(`[UPLOAD] Text appears corrupted (${(alphaRatio * 100).toFixed(1)}% alphabetic), skipping character spacing fix`);
    return text.trim();
  }
  
  // Check if this text has character-level spacing (like "c a r a t t e r i")
  const singleCharSpacePattern = /([a-zA-Zàèéìíîòóùúäöüß])\s+([a-zA-Zàèéìíîòóùúäöüß])\s+([a-zA-Zàèéìíîòóùúäöüß])/;
  const hasCharacterSpacing = singleCharSpacePattern.test(text);
  
  if (!hasCharacterSpacing) {
    // If no character spacing detected, just clean up basic issues
    return text
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,;:!?()[\]{}])/g, '$1')
      .replace(/([([{])\s+/g, '$1')
      .trim();
  }
  
  console.log('[UPLOAD] Character spacing detected, applying advanced fix...');
  
  // Strategy: Split on multiple spaces (word boundaries), fix character spacing within each segment
  
  // Step 1: Preserve word boundaries by splitting on 2+ spaces
  const segments = text.split(/\s{2,}/);
  
  // Step 2: Fix character spacing within each segment
  const fixedSegments = segments.map(segment => {
    if (!segment.trim()) return segment;
    
    let fixed = segment;
    
    // Apply character spacing fixes within this segment
    let previousLength;
    let iterations = 0;
    const maxIterations = 10;
    
    do {
      previousLength = fixed.length;
      
      // Fix single character spacing: "c a r a t t e r i" -> "caratteri"
      fixed = fixed.replace(/([a-zA-Zàèéìíîòóùúäöüß])\s([a-zA-Zàèéìíîòóùúäöüß])/g, '$1$2');
      
      // Fix spaced numbers: "2 0 2 5" -> "2025" 
      fixed = fixed.replace(/(\d)\s(\d)/g, '$1$2');
      
      // Fix mixed alphanumeric: "v 0" -> "v0"
      fixed = fixed.replace(/([a-zA-Zàèéìíîòóùúäöüß])\s(\d)/g, '$1$2');
      fixed = fixed.replace(/(\d)\s([a-zA-Zàèéìíîòóùúäöüß])/g, '$1$2');
      
      iterations++;
    } while (fixed.length !== previousLength && iterations < maxIterations);
    
    // Handle punctuation within segment
    fixed = fixed
      .replace(/([a-zA-Zàèéìíîòóùúäöüß0-9])\s+([.,;:!?()[\]{}])/g, '$1$2')
      .replace(/([([{])\s+/g, '$1')
      .replace(/\s+([.,;:!?()[\]{}])/g, '$1');
    
    return fixed.trim();
  });
  
  // Step 3: Join segments back with single spaces
  let result = fixedSegments.filter(segment => segment.length > 0).join(' ');
  
  // Step 4: Final cleanup for specific patterns - APOSTROPHES FIRST!
  result = result
    // Fix Italian contractions FIRST (before other patterns interfere)
    .replace(/\b([lL])\s+(['''])\s*([aeiouAEIOU][a-zA-Zàèéìíîòóùúäöüß]*)/g, '$1$2$3')
    .replace(/\b([dD]ell?|[aA]ll?|[nN]ell?|[sS]ull?)\s+(['''])\s*([aeiouAEIOU][a-zA-Zàèéìíîòóùúäöüß]*)/g, '$1$2$3')
    .replace(/\b([uU]n)\s+(['''])\s*([aeiouAEIOU][a-zA-Zàèéìíîòóùúäöüß]*)/g, '$1$2$3')
    .replace(/\b([cC])\s+(['''])\s*(è)/g, '$1$2$3')
    // General apostrophe fix for any remaining cases
    .replace(/([a-zA-Zàèéìíîòóùúäöüß])\s+(['''])\s*([a-zA-Zàèéìíîòóùúäöüß])/g, '$1$2$3')
    // Fix single letter spacing at word start: "C RM" -> "CRM", "G estione" -> "Gestione"  
    .replace(/\b([A-Z])\s+([a-zA-Zàèéìíîòóùúäöüß]{2,})/g, '$1$2')
    // Fix acronym spacing: "C RM" -> "CRM", "E RP" -> "ERP"
    .replace(/\b([A-Z])\s+([A-Z])(?:\s+([A-Z]))?/g, '$1$2$3')
    // Fix hyphenated words: "E - C ommerce" -> "E-Commerce", "E - mail" -> "E-mail"
    .replace(/([A-Za-z])\s*-\s*([A-Z])\s*([a-zA-Zàèéìíîòóùúäöüß]*)/g, '$1-$2$3')
    // Fix specific patterns like ". C" -> ". C" (preserve sentence spacing but fix letter spacing)
    .replace(/(\.\s+)([A-Z])\s+([a-zA-Zàèéìíîòóùúäöüß]+)/g, '$1$2$3')
    // Ensure space between number and letter when it makes sense: "25caratteri" -> "25 caratteri"
    .replace(/(\d+)([a-zA-Zàèéìíîòóùúäöüß]{3,})/g, '$1 $2')
    // Ensure space between ) and letter: ")Per" -> ") Per"
    .replace(/([)])([A-Z][a-zA-Zàèéìíîòóùúäöüß]+)/g, '$1 $2')
    // Fix spacing after colon: ": L" -> ": L" but ":L" -> ": L"
    .replace(/(:)([A-Z][a-zA-Zàèéìíîòóùúäöüß]+)/g, '$1 $2')
    // Clean up any remaining multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
  
  console.log(`[UPLOAD] Character spacing fix: ${text.length} -> ${result.length} characters`);
  return result;
}

// Funzione per estrarre testo da PDF scannionati usando OCR
async function extractTextFromScannedPDF(
  buffer: Buffer, 
  progressCallback?: (progress: { currentPage: number, totalPages: number, status: string }) => void,
  uploadId?: string
): Promise<string> {
  let tempDir: string | null = null
  
  try {
    console.log('[UPLOAD] Avvio OCR per PDF scannionato...')
    progressCallback?.({ currentPage: 0, totalPages: 0, status: 'Preparing PDF for OCR...' })
    
    // Check if upload was cancelled
    if (uploadId && activeUploads.get(uploadId)?.cancelled) {
      throw new Error('Request cancelled')
    }
    
    // Crea una directory temporanea
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'pdf-ocr-'))
    const pdfPath = path.join(tempDir, 'input.pdf')
    
    // Salva il PDF in un file temporaneo
    await fs.writeFile(pdfPath, buffer)
    
    // Converti PDF in immagini usando pdftoppm direttamente
    console.log('[UPLOAD] Conversione PDF in immagini...')
    progressCallback?.({ currentPage: 0, totalPages: 0, status: 'Converting PDF to images...' })
    
    // Check cancellation again before expensive operation
    if (uploadId && activeUploads.get(uploadId)?.cancelled) {
      throw new Error('Request cancelled')
    }
    
    const imagePaths = await convertPDFToImages(pdfPath, tempDir)
    
    const totalPages = imagePaths.length
    progressCallback?.({ currentPage: 0, totalPages, status: `Starting OCR on ${totalPages} pages...` })
    
    // Configura Tesseract con ottimizzazioni per LSTM
    // Tesseract 5.x con LSTM offre il miglior equilibrio tra accuratezza, velocità e elaborazione locale
    // Ottimizzazioni implementate:
    // - OEM 1: Solo LSTM (neural network), nessun engine legacy
    // - PSM 6: Blocco uniforme di testo (ottimale per documenti)
    // - 300 DPI: Risoluzione ottimale per LSTM (migliore di 200 per testi piccoli)
    // - Multi-lingua: IT+EN+FR+DE+ES per documenti europei
    // - Dictionary correction: Correzioni intelligenti post-OCR
    const tesseractConfig = {
      // Ottimizzazione linguaggi: priorità italiana/inglese + supporto europeo
      lang: 'ita+eng+fra+deu+spa', // Italian, English, French, German, Spanish
      oem: 1, // LSTM OCR Engine Mode (Tesseract 5.x) - Best for accuracy
      psm: 6, // Uniform block of text (better for documents than psm 3)
      
      // LSTM-specific optimizations
      tessedit_char_whitelist: undefined, // No restrictions for LSTM
      tessedit_pageseg_mode: 6, // Explicit PSM setting
      
      // Performance optimizations
      tessedit_ocr_engine_mode: 1, // Force LSTM only
      preserve_interword_spaces: 1, // Better spacing
      
      // Quality improvements
      tessedit_create_hocr: 0, // Disable HOCR for speed
      tessedit_create_tsv: 0,  // Disable TSV for speed
      textord_really_old_xheight: 1, // Better line detection
      
      // Language model confidence (optimized for LSTM)
      language_model_penalty_non_freq_dict_word: 0.1,
      language_model_penalty_non_dict_word: 0.15,
      
      // LSTM neural network confidence
      classify_bln_numeric_mode: 0, // Let LSTM handle numbers
      tessedit_enable_dict_correction: 1, // Dictionary correction
    }
    
    // Alternative config for problematic documents
    const fallbackTesseractConfig = {
      lang: 'ita+eng', // Simplified language set
      oem: 1, // LSTM only
      psm: 3, // Fully automatic page segmentation, but no OSD
      
      // Additional settings to help with character spacing issues
      tessedit_char_whitelist: undefined,
      preserve_interword_spaces: 1,
      textord_really_old_xheight: 0, // Different line detection for problematic PDFs
      textord_min_linesize: 1.25, // Minimum line size
      
      // Disable some features that might cause spacing issues
      tessedit_enable_dict_correction: 0, // No dictionary correction in fallback
      classify_bln_numeric_mode: 1, // Different number handling
    }
    
    let fullText = ''
    let consecutiveFailures = 0
    const maxConsecutiveFailures = 3
    
    // Processa ogni immagine con OCR
    for (let i = 0; i < imagePaths.length; i++) {
      // Check for cancellation before processing each page (but less frequently for performance)
      if (uploadId && i % 3 === 0 && activeUploads.get(uploadId)?.cancelled) {
        console.log(`[UPLOAD:${uploadId}] Request cancelled, stopping OCR at page ${i + 1}/${totalPages}`)
        throw new Error('Request cancelled')
      }
      
      const imagePath = imagePaths[i]
      const currentPage = i + 1
      console.log(`[UPLOAD:${uploadId}] OCR pagina ${currentPage}/${totalPages}...`)
      progressCallback?.({ currentPage, totalPages, status: `Processing page ${currentPage} of ${totalPages}...` })
      
      try {
        // Check cancellation before each OCR operation
        if (uploadId && activeUploads.get(uploadId)?.cancelled) {
          console.log(`[UPLOAD] Request cancelled during OCR of page ${currentPage}`)
          throw new Error('Request cancelled')
        }
        
        // Try primary config first
        let pageText = ''
        let usedFallback = false
        
        try {
          pageText = await tesseract.recognize(imagePath, tesseractConfig)
          
          // Check for character spacing issue (spaces between every character)
          const hasCharSpacing = /([a-zA-Zàèéìíîòóùúäöüß]\s+){5,}/.test(pageText)
          
          // Check if result looks garbled (too many non-alphabetic characters)
          const alphaCount = (pageText.match(/[a-zA-Zàèéìíîòóùúäöüß]/g) || []).length
          const totalCount = pageText.replace(/\s/g, '').length
          const alphaRatio = totalCount > 0 ? alphaCount / totalCount : 0
          
          console.log(`[UPLOAD:${uploadId}] Pagina ${currentPage}: ratio alfabetico ${(alphaRatio * 100).toFixed(1)}%${hasCharSpacing ? ', rilevato spacing caratteri' : ''}`)
          
          // If less than 30% alphabetic characters OR character spacing detected, try fallback config
          if ((alphaRatio < 0.3 && totalCount > 50) || hasCharSpacing) {
            const reason = hasCharSpacing ? 'caratteri spaziati' : 'testo illeggibile'
            console.log(`[UPLOAD:${uploadId}] Pagina ${currentPage}: ${reason}, provo configurazione fallback`)
            pageText = await tesseract.recognize(imagePath, fallbackTesseractConfig)
            usedFallback = true
            
            // Re-check quality
            const newAlphaCount = (pageText.match(/[a-zA-Zàèéìíîòóùúäöüß]/g) || []).length
            const newTotalCount = pageText.replace(/\s/g, '').length
            const newAlphaRatio = newTotalCount > 0 ? newAlphaCount / newTotalCount : 0
            const newHasCharSpacing = /([a-zA-Zàèéìíîòóùúäöüß]\s+){5,}/.test(pageText)
            console.log(`[UPLOAD:${uploadId}] Pagina ${currentPage}: fallback ratio alfabetico ${(newAlphaRatio * 100).toFixed(1)}%${newHasCharSpacing ? ', ancora caratteri spaziati' : ''}`)
            
            // If still has character spacing after fallback, apply post-processing fix
            if (newHasCharSpacing) {
              console.log(`[UPLOAD:${uploadId}] Pagina ${currentPage}: applico correzione spacing caratteri`)
              pageText = fixCharacterSpacing(pageText)
            }
          }
          
          consecutiveFailures = 0 // Reset failure counter on success
        } catch (ocrError) {
          console.warn(`[UPLOAD] Errore OCR principale pagina ${currentPage}:`, ocrError)
          // Try fallback config
          pageText = await tesseract.recognize(imagePath, fallbackTesseractConfig)
          usedFallback = true
        }
        
        // Single cancellation check after OCR completes - sufficient for responsiveness
        if (uploadId && activeUploads.get(uploadId)?.cancelled) {
          console.log(`[UPLOAD:${uploadId}] Request cancelled after page ${currentPage}`)
          throw new Error('Request cancelled')
        }
        
        fullText += pageText.trim() + '\n\n'
        console.log(`[UPLOAD:${uploadId}] Pagina ${currentPage}: estratti ${pageText.trim().length} caratteri${usedFallback ? ' (fallback)' : ''}`)
        
      } catch (pageError) {
        if (pageError instanceof Error && pageError.message === 'Request cancelled') {
          throw pageError
        }
        console.warn(`[UPLOAD] Errore OCR pagina ${currentPage}:`, pageError)
        fullText += `[Errore nell'elaborazione della pagina ${currentPage}]\n\n`
        consecutiveFailures++
        
        // If too many consecutive failures, the PDF might be problematic
        if (consecutiveFailures >= maxConsecutiveFailures) {
          console.warn(`[UPLOAD] Troppe pagine consecutive fallite (${consecutiveFailures}), PDF potrebbe essere di qualità molto bassa`)
          progressCallback?.({ currentPage, totalPages, status: `Warning: Poor quality PDF detected. Results may be unreliable.` })
        }
      }
    }
    
    console.log(`[UPLOAD] OCR completato. Testo totale estratto: ${fullText.trim().length} caratteri`)
    progressCallback?.({ currentPage: totalPages, totalPages, status: 'OCR completed successfully!' })
    
    return fullText.trim()
    
  } catch (error) {
    if (error instanceof Error && error.message === 'Request cancelled') {
      console.log('[UPLOAD] OCR process cancelled by client')
      progressCallback?.({ currentPage: 0, totalPages: 0, status: 'OCR cancelled' })
      throw error
    }
    console.error('[UPLOAD] Errore OCR:', error)
    progressCallback?.({ currentPage: 0, totalPages: 0, status: 'OCR failed' })
    throw new Error(`OCR fallito: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`)
  } finally {
    // Pulizia file temporanei
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true })
        console.log('[UPLOAD] File temporanei puliti')
      } catch (cleanupError) {
        console.warn('[UPLOAD] Errore pulizia file temporanei:', cleanupError)
      }
    }
    
    // Clean up tracking for this upload (but only if not cancelled - cancelled uploads clean up later)
    if (uploadId) {
      const uploadInfo = activeUploads.get(uploadId)
      if (!uploadInfo?.cancelled) {
        activeUploads.delete(uploadId)
      }
    }
  }
}

// Funzione principale per estrarre testo da PDF con fallback OCR
async function extractTextFromPDFWithOCR(
  buffer: Buffer, 
  progressCallback?: (progress: { currentPage: number, totalPages: number, status: string }) => void,
  uploadId?: string
): Promise<string> {
  try {
    // Prima prova con pdf2json
    console.log('[UPLOAD] Tentativo estrazione testo con pdf2json...')
    progressCallback?.({ currentPage: 0, totalPages: 0, status: 'Trying text extraction...' })
    
    // Check cancellation before starting
    if (uploadId && activeUploads.get(uploadId)?.cancelled) {
      throw new Error('Request cancelled')
    }
    
    const text = await extractTextFromPDF(buffer)
    console.log(`[UPLOAD] Successo pdf2json: ${text.length} caratteri estratti`)
    progressCallback?.({ currentPage: 1, totalPages: 1, status: 'Text extraction completed!' })
    return text
  } catch (error) {
    // Check cancellation before fallback
    if (uploadId && activeUploads.get(uploadId)?.cancelled) {
      throw new Error('Request cancelled')
    }
    
    if (error instanceof Error && (error.message === 'SCANNED_PDF' || error.message.includes('PDF non ha pagine leggibili'))) {
      console.log('[UPLOAD] PDF è scansionato, uso OCR')
      progressCallback?.({ currentPage: 0, totalPages: 0, status: 'PDF appears to be scanned, using OCR...' })
      return await extractTextFromScannedPDF(buffer, progressCallback, uploadId)
    } else {
      console.warn('[UPLOAD] Errore pdf2json:', error)
      console.log('[UPLOAD] Fallback a OCR')
      progressCallback?.({ currentPage: 0, totalPages: 0, status: 'Text extraction failed, trying OCR...' })
      return await extractTextFromScannedPDF(buffer, progressCallback, uploadId)
    }
  }
}

// Funzione per generare messaggio di errore user-friendly per PDF scansionati
function getScannedPDFMessage(): string {
  return `Il PDF caricato sembra essere un documento scansionato (immagine) che non contiene testo estraibile.

Per utilizzare documenti scansionati, puoi:

1. **Riconvertire il documento**: Se hai accesso al documento originale, salvalo di nuovo come PDF con testo selezionabile
2. **Usare software OCR**: Utilizza software come Adobe Acrobat Pro, Google Drive, o servizi online per convertire il PDF scansionato in testo
3. **Copiare manualmente**: Per documenti brevi, copia il testo manualmente e incollalo come file di testo
4. **Utilizzare app OCR mobile**: Scansiona nuovamente il documento con app come CamScanner o Adobe Scan che creano PDF con testo ricercabile

Il sistema funziona meglio con PDF che contengono testo selezionabile (non scansionati).`
}

export const config = {
  api: {
    bodyParser: false, // Required for file uploads
    // Note: Next.js does not support a direct size limit here for formData, so we check manually below
  },
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const contextMode = formData.get('contextMode') as string | null
    const streamProgress = formData.get('streamProgress') as string | null // New parameter for progress streaming
    
    if (!file) {
      return NextResponse.json({ error: 'Nessun file caricato' }, { status: 400 })
    }
    
    // Generate unique upload ID for this request
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // Register this upload in our tracking system
    activeUploads.set(uploadId, { cancelled: false, controller: new AbortController() })
    // File size check (200MB limit)
    const MAX_SIZE = 200 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Il file è troppo grande. Limite massimo: 200MB.' }, { status: 413 })
    }
    // Get user from cookie if available
    let user = 'unknown'
    try {
      const cookie = request.headers.get('cookie') || ''
      const match = cookie.match(/mag-gpt-auth=([^;]+)/)
      if (match) user = decodeURIComponent(match[1])
    } catch {}
    // Log the upload attempt
    logInteraction({
      user,
      action: 'file_upload',
      data: {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        contextMode: contextMode || 'session'
      }
    })
    console.log(`[UPLOAD] Processando file: ${file.name} (${file.type}, ${file.size} bytes) [mode: ${contextMode}] [stream: ${streamProgress}]`)
    const buffer = Buffer.from(await file.arrayBuffer())
    let extractedText = ''

    // For large PDFs with streaming enabled, use SSE
    if (streamProgress === 'true' && file.type === 'application/pdf' && file.size > 10 * 1024 * 1024) {
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          let controllerClosed = false
          
          const progressCallback = (progress: { currentPage: number, totalPages: number, status: string }) => {
            if (controllerClosed) return // Don't try to write to closed controller
            
            try {
              const data = `data: ${JSON.stringify({ type: 'progress', ...progress, uploadId })}\n\n`
              controller.enqueue(encoder.encode(data))
            } catch (error) {
              console.warn('[UPLOAD] Failed to send progress update (controller likely closed):', error)
              controllerClosed = true
            }
          }

          // Process the PDF with progress updates
          extractTextFromPDFWithOCR(buffer, progressCallback, uploadId)
            .then(async (text) => {
              extractedText = text
              
              // Chunking and vectorization placeholder
              const chunked = [extractedText]
              const vectors: any[] = []

              // Save file if context mode
              let result: any = {
                success: true,
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                characterCount: extractedText.length,
                contextSaved: false,
                extractedText: extractedText
              }

              if (contextMode === 'context' && user !== 'unknown') {
                const username = user.split('@')[0]
                const contextDir = path.join(process.cwd(), 'context', username)
                if (!existsSync(contextDir)) {
                  mkdirSync(contextDir, { recursive: true })
                }
                const timestamp = Date.now()
                const baseName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
                const outPath = path.join(contextDir, `${timestamp}_${baseName}.json`)
                writeFileSync(outPath, JSON.stringify({
                  fileName: file.name,
                  fileType: file.type,
                  fileSize: file.size,
                  chunked,
                  vectors,
                  uploadedAt: new Date().toISOString()
                }, null, 2), 'utf-8')
                
                result.contextSaved = true
                result.contextPath = outPath
              }

              // Send final result
              if (!controllerClosed) {
                try {
                  const finalData = `data: ${JSON.stringify({ type: 'complete', result })}\n\n`
                  controller.enqueue(encoder.encode(finalData))
                  controller.close()
                  controllerClosed = true
                } catch (error) {
                  console.warn('[UPLOAD] Failed to send completion message (controller likely closed):', error)
                  controllerClosed = true
                }
              }
            })
            .catch((error) => {
              console.error('[UPLOAD] Error during streaming processing:', error)
              
              if (!controllerClosed) {
                try {
                  // Check if it's a cancellation
                  if (error instanceof Error && error.message === 'Request cancelled') {
                    const cancelData = `data: ${JSON.stringify({ 
                      type: 'cancelled', 
                      message: 'Upload cancelled'
                    })}\n\n`
                    controller.enqueue(encoder.encode(cancelData))
                  } else {
                    const errorData = `data: ${JSON.stringify({ 
                      type: 'error', 
                      error: `Errore nell'analisi del PDF: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`
                    })}\n\n`
                    controller.enqueue(encoder.encode(errorData))
                  }
                  controller.close()
                  controllerClosed = true
                } catch (controllerError) {
                  console.warn('[UPLOAD] Failed to send error message (controller likely closed):', controllerError)
                  controllerClosed = true
                }
              }
            })
        },
        cancel() {
          // When the client disconnects/cancels the stream
          console.log(`[UPLOAD] Client disconnected, marking upload ${uploadId} as cancelled`)
          const uploadInfo = activeUploads.get(uploadId)
          if (uploadInfo) {
            uploadInfo.cancelled = true
          }
        }
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    // Normal processing for non-streaming uploads
    // Estrai testo in base al tipo di file
    switch (file.type) {
              case 'application/pdf':
          try {
            extractedText = await extractTextFromPDFWithOCR(buffer, undefined, uploadId)
          console.log(`[UPLOAD] Successo! Testo estratto: ${extractedText.length} caratteri`)
        } catch (error) {
          console.error('[UPLOAD] Errore estrazione PDF:', error)
          return NextResponse.json(
            { 
              error: `Errore nell'analisi del PDF: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`,
              errorType: 'PDF_ERROR'
            },
            { status: 500 }
          )
        }
        break
      case 'text/plain':
        extractedText = buffer.toString('utf-8')
        console.log(`[UPLOAD] File di testo processato: ${extractedText.length} caratteri`)
        break
      default:
        return NextResponse.json(
          { 
            error: `Tipo di file non supportato: ${file.type}. Supportati: PDF e file di testo (.txt)`,
            errorType: 'UNSUPPORTED_TYPE'
          },
          { status: 400 }
        )
    }
    if (!extractedText.trim()) {
      return NextResponse.json(
        { 
          error: 'Nessun testo estratto dal file. Il file potrebbe essere vuoto o corrotto.',
          errorType: 'NO_TEXT'
        },
        { status: 400 }
      )
    }
    // Chunking and vectorization - generate embeddings at upload time for better performance
    console.log('[UPLOAD] Chunking text for embedding generation...')
    
    // Use optimized chunking based on content type
    const chunkingConfig = getOptimalChunkingConfig(extractedText, file.name)
    const chunked = chunkWithStrategy(extractedText, chunkingConfig, file.name)
    
    let vectors: any[] = []
    
    try {
      console.log(`[UPLOAD] Generating embeddings for ${chunked.length} chunks...`)
      
      // Generate embeddings for the chunks
      const fileChunks = [{ fileName: file.name, chunks: chunked }]
      const chunksWithEmbeddings = await generateChunkEmbeddings(fileChunks)
      
      // Extract just the embedding vectors for storage
      vectors = chunksWithEmbeddings.map(item => ({
        chunk: item.chunk,
        embedding: item.embedding,
        index: item.index
      }))
      
      console.log(`[UPLOAD] Successfully generated ${vectors.length} embeddings`)
    } catch (error) {
      console.error('[UPLOAD] Failed to generate embeddings:', error)
      console.log('[UPLOAD] Continuing without embeddings - they can be generated on-demand during chat')
      // Continue without embeddings - fallback to on-demand generation
    }
    // If contextMode is 'context', save to disk
    if (contextMode === 'context' && user !== 'unknown') {
      const username = user.split('@')[0]
      const contextDir = path.join(process.cwd(), 'context', username)
      if (!existsSync(contextDir)) {
        mkdirSync(contextDir, { recursive: true })
      }
      const timestamp = Date.now()
      const baseName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const outPath = path.join(contextDir, `${timestamp}_${baseName}.json`)
      writeFileSync(outPath, JSON.stringify({
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        chunked,
        vectors,
        uploadedAt: new Date().toISOString(),
        embeddingsGenerated: vectors.length > 0
      }, null, 2), 'utf-8')
      return NextResponse.json({
        success: true,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        characterCount: extractedText.length,
        contextSaved: true,
        contextPath: outPath,
        extractedText: extractedText, // Return full text for context files too
        chunksCount: chunked.length,
        embeddingsCount: vectors.length,
        embeddingsGenerated: vectors.length > 0
      })
    }
    // For session, return full text (not just preview)
    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      characterCount: extractedText.length,
      contextSaved: false,
      extractedText: extractedText, // Return full text for session files
      chunksCount: chunked.length,
      embeddingsCount: vectors.length,
      embeddingsGenerated: vectors.length > 0
    })
  } catch (error) {
    // Improved error handling: always return JSON
    console.error('[UPLOAD] Errore generale:', error)
    return NextResponse.json(
      { 
        error: 'Errore durante il caricamento del file',
        errorType: 'GENERAL_ERROR',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
} 

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const uploadId = searchParams.get('uploadId')
    
    if (!uploadId) {
      return NextResponse.json({ error: 'Upload ID is required' }, { status: 400 })
    }
    
    console.log(`[UPLOAD] Cancelling upload: ${uploadId}`)
    console.log(`[UPLOAD] Active uploads before cancellation:`, Array.from(activeUploads.keys()))
    
    // Mark the upload as cancelled
    const uploadInfo = activeUploads.get(uploadId)
    if (uploadInfo) {
      uploadInfo.cancelled = true
      uploadInfo.controller.abort()
      console.log(`[UPLOAD] Upload ${uploadId} marked as cancelled`)
      
      // Clean up after a delay to allow for proper error handling
      setTimeout(() => {
        activeUploads.delete(uploadId)
        console.log(`[UPLOAD] Upload ${uploadId} cleaned up from tracking`)
        console.log(`[UPLOAD] Remaining active uploads:`, Array.from(activeUploads.keys()))
      }, 10000) // Increased delay to ensure all operations see the cancellation
    } else {
      console.log(`[UPLOAD] Upload ${uploadId} not found in active uploads`)
      console.log(`[UPLOAD] Current active uploads:`, Array.from(activeUploads.keys()))
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Upload cancellation requested',
      uploadId 
    })
  } catch (error) {
    console.error('[UPLOAD] Error cancelling upload:', error)
    return NextResponse.json(
      { error: 'Failed to cancel upload' },
      { status: 500 }
    )
  }
} 