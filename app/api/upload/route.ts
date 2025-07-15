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
    // Usa pdftoppm dal sistema (installato con Homebrew)
    const command = `pdftoppm -jpeg -r 200 "${pdfPath}" "${path.join(outputDir, 'page')}"`
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
    
    console.log(`[UPLOAD] Generati ${imageFiles.length} file immagine`)
    return imageFiles
    
  } catch (error) {
    console.error('[UPLOAD] Errore conversione PDF:', error)
    throw new Error(`Errore conversione PDF in immagini: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`)
  }
}

// Funzione per estrarre testo da PDF scansionati usando OCR
async function extractTextFromScannedPDF(buffer: Buffer): Promise<string> {
  let tempDir: string | null = null
  
  try {
    console.log('[UPLOAD] Avvio OCR per PDF scansionato...')
    
    // Crea una directory temporanea
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'pdf-ocr-'))
    const pdfPath = path.join(tempDir, 'input.pdf')
    
    // Salva il PDF in un file temporaneo
    await fs.writeFile(pdfPath, buffer)
    
    // Converti PDF in immagini usando pdftoppm direttamente
    console.log('[UPLOAD] Conversione PDF in immagini...')
    const imagePaths = await convertPDFToImages(pdfPath, tempDir)
    
    // Configura Tesseract
    const tesseractConfig = {
      lang: 'ita+eng', // Italiano e inglese
      oem: 1, // LSTM OCR Engine Mode
      psm: 3, // Automatic page segmentation
      tessedit_char_whitelist: undefined // Nessuna limitazione di caratteri
    }
    
    let fullText = ''
    
    // Processa ogni immagine con OCR
    for (let i = 0; i < imagePaths.length; i++) {
      const imagePath = imagePaths[i]
      console.log(`[UPLOAD] OCR pagina ${i + 1}/${imagePaths.length}...`)
      
      try {
        const pageText = await tesseract.recognize(imagePath, tesseractConfig)
        fullText += pageText.trim() + '\n\n'
        console.log(`[UPLOAD] Pagina ${i + 1}: estratti ${pageText.trim().length} caratteri`)
      } catch (pageError) {
        console.warn(`[UPLOAD] Errore OCR pagina ${i + 1}:`, pageError)
        fullText += `[Errore nell'elaborazione della pagina ${i + 1}]\n\n`
      }
    }
    
    console.log(`[UPLOAD] OCR completato. Testo totale estratto: ${fullText.trim().length} caratteri`)
    
    return fullText.trim()
    
  } catch (error) {
    console.error('[UPLOAD] Errore OCR:', error)
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
async function extractTextFromPDFWithOCR(buffer: Buffer): Promise<string> {
  try {
    // Prima prova con pdf2json
    console.log('[UPLOAD] Tentativo estrazione testo con pdf2json...')
    const text = await extractTextFromPDF(buffer)
    console.log(`[UPLOAD] Successo pdf2json: ${text.length} caratteri estratti`)
    return text
  } catch (error) {
    if (error instanceof Error && error.message === 'SCANNED_PDF') {
      console.log('[UPLOAD] Rilevato PDF scansionato, avvio OCR...')
      // Se è un PDF scansionato, usa OCR
      return await extractTextFromScannedPDF(buffer)
    } else {
      console.log('[UPLOAD] pdf2json fallito, tentativo OCR come fallback...')
      // Se pdf2json fallisce per altri motivi, prova comunque OCR
      return await extractTextFromScannedPDF(buffer)
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
    if (!file) {
      return NextResponse.json({ error: 'Nessun file caricato' }, { status: 400 })
    }
    // File size check (100MB limit)
    const MAX_SIZE = 100 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Il file è troppo grande. Limite massimo: 100MB.' }, { status: 413 })
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
    console.log(`[UPLOAD] Processando file: ${file.name} (${file.type}, ${file.size} bytes) [mode: ${contextMode}]`)
    const buffer = Buffer.from(await file.arrayBuffer())
    let extractedText = ''
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
            { status: 400 }
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