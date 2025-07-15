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

const execAsync = promisify(exec)

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
        
        resolve(text.trim())
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
    const command = `pdftoppm -jpeg -r 300 -jpegopt quality=95 "${pdfPath}" "${path.join(outputDir, 'page')}"`
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
    
    console.log(`[UPLOAD] Generati ${imageFiles.length} file immagine a 300 DPI`)
    return imageFiles
    
  } catch (error) {
    console.error('[UPLOAD] Errore conversione PDF:', error)
    throw new Error(`Errore conversione PDF in immagini: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`)
  }
}

// Funzione per estrarre testo da PDF scansionati usando OCR
async function extractTextFromScannedPDF(buffer: Buffer, progressCallback?: (progress: { currentPage: number, totalPages: number, status: string }) => void): Promise<string> {
  let tempDir: string | null = null
  
  try {
    console.log('[UPLOAD] Avvio OCR per PDF scansionato...')
    progressCallback?.({ currentPage: 0, totalPages: 0, status: 'Preparing PDF for OCR...' })
    
    // Crea una directory temporanea
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'pdf-ocr-'))
    const pdfPath = path.join(tempDir, 'input.pdf')
    
    // Salva il PDF in un file temporaneo
    await fs.writeFile(pdfPath, buffer)
    
    // Converti PDF in immagini usando pdftoppm direttamente
    console.log('[UPLOAD] Conversione PDF in immagini...')
    progressCallback?.({ currentPage: 0, totalPages: 0, status: 'Converting PDF to images...' })
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
    
    let fullText = ''
    
    // Processa ogni immagine con OCR
    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i]
      const currentPage = i + 1
      console.log(`[UPLOAD] OCR pagina ${currentPage}/${totalPages}...`)
      progressCallback?.({ currentPage, totalPages, status: `Processing page ${currentPage} of ${totalPages}...` })
      
      try {
        const pageText = await tesseract.recognize(imagePath, tesseractConfig)
        fullText += pageText.trim() + '\n\n'
        console.log(`[UPLOAD] Pagina ${currentPage}: estratti ${pageText.trim().length} caratteri`)
      } catch (pageError) {
        console.warn(`[UPLOAD] Errore OCR pagina ${currentPage}:`, pageError)
        fullText += `[Errore nell'elaborazione della pagina ${currentPage}]\n\n`
      }
    }
    
    console.log(`[UPLOAD] OCR completato. Testo totale estratto: ${fullText.trim().length} caratteri`)
    progressCallback?.({ currentPage: totalPages, totalPages, status: 'OCR completed successfully!' })
    
    return fullText.trim()
    
  } catch (error) {
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
  }
}

// Funzione principale per estrarre testo da PDF con fallback OCR
async function extractTextFromPDFWithOCR(buffer: Buffer, progressCallback?: (progress: { currentPage: number, totalPages: number, status: string }) => void): Promise<string> {
  try {
    // Prima prova con pdf2json
    console.log('[UPLOAD] Tentativo estrazione testo con pdf2json...')
    progressCallback?.({ currentPage: 0, totalPages: 0, status: 'Trying text extraction...' })
    const text = await extractTextFromPDF(buffer)
    console.log(`[UPLOAD] Successo pdf2json: ${text.length} caratteri estratti`)
    progressCallback?.({ currentPage: 1, totalPages: 1, status: 'Text extraction completed!' })
    return text
  } catch (error) {
    if (error instanceof Error && error.message === 'SCANNED_PDF') {
      console.log('[UPLOAD] Rilevato PDF scansionato, avvio OCR...')
      // Se è un PDF scansionato, usa OCR
      return await extractTextFromScannedPDF(buffer, progressCallback)
    } else {
      console.log('[UPLOAD] pdf2json fallito, tentativo OCR come fallback...')
      // Se pdf2json fallisce per altri motivi, prova comunque OCR
      return await extractTextFromScannedPDF(buffer, progressCallback)
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
          const progressCallback = (progress: { currentPage: number, totalPages: number, status: string }) => {
            const data = `data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`
            controller.enqueue(encoder.encode(data))
          }

          // Process the PDF with progress updates
          extractTextFromPDFWithOCR(buffer, progressCallback)
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
              const finalData = `data: ${JSON.stringify({ type: 'complete', result })}\n\n`
              controller.enqueue(encoder.encode(finalData))
              controller.close()
            })
            .catch((error) => {
              console.error('[UPLOAD] Error during streaming processing:', error)
              const errorData = `data: ${JSON.stringify({ 
                type: 'error', 
                error: `Errore nell'analisi del PDF: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`
              })}\n\n`
              controller.enqueue(encoder.encode(errorData))
              controller.close()
            })
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
          extractedText = await extractTextFromPDFWithOCR(buffer)
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
    // Chunking and vectorization placeholder (replace with your actual logic)
    const chunked = [extractedText] // TODO: replace with real chunking
    const vectors: any[] = [] // TODO: replace with real vectorization
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
        uploadedAt: new Date().toISOString()
      }, null, 2), 'utf-8')
      return NextResponse.json({
        success: true,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        characterCount: extractedText.length,
        contextSaved: true,
        contextPath: outPath,
        extractedText: extractedText // Return full text for context files too
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
      extractedText: extractedText // Return full text for session files
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