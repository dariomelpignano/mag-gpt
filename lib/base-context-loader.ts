// Utility for loading base context files that are shared across all users
import fs from 'fs/promises'
import path from 'path'

export interface BaseContextFile {
  fileName: string
  fileType: string
  fileSize: number
  characterCount: number
  uploadedAt: string
  contextPath: string
  isBaseContext: boolean
}

/**
 * Loads all base context files from the mag-base-context directory
 * These files are automatically available to all users
 */
export async function loadBaseContextFiles(): Promise<BaseContextFile[]> {
  const baseContextFiles: BaseContextFile[] = []
  
  try {
    const baseContextDir = path.join(process.cwd(), 'context', 'mag-base-context')
    
    // Check if base context directory exists
    try {
      await fs.access(baseContextDir)
    } catch {
      console.log('[BASE-CONTEXT] Base context directory does not exist, creating it...')
      await fs.mkdir(baseContextDir, { recursive: true })
      return baseContextFiles
    }
    
    const files = await fs.readdir(baseContextDir)
    console.log(`[BASE-CONTEXT] Found ${files.length} files in base context directory`)
    
    for (const file of files) {
      if (file.endsWith('.json') && !file.startsWith('.')) {
        try {
          const filePath = path.join(baseContextDir, file)
          const content = await fs.readFile(filePath, 'utf-8')
          const parsed = JSON.parse(content)
          
          // Calculate character count from chunks
          const characterCount = Array.isArray(parsed.chunked) 
            ? parsed.chunked.reduce((acc: number, chunk: string) => acc + chunk.length, 0)
            : (typeof parsed.chunked === 'string' ? parsed.chunked.length : 0)
          
          baseContextFiles.push({
            fileName: `[BASE] ${parsed.fileName || file}`, // Prefix to indicate base context
            fileType: parsed.fileType || 'unknown',
            fileSize: parsed.fileSize || 0,
            characterCount,
            uploadedAt: parsed.uploadedAt || new Date().toISOString(),
            contextPath: filePath,
            isBaseContext: true
          })
          
          console.log(`[BASE-CONTEXT] Loaded base context file: ${parsed.fileName}`)
        } catch (error) {
          console.warn(`[BASE-CONTEXT] Failed to load base context file ${file}:`, error)
        }
      }
    }
    
    console.log(`[BASE-CONTEXT] Successfully loaded ${baseContextFiles.length} base context files`)
  } catch (error) {
    console.error('[BASE-CONTEXT] Error loading base context files:', error)
  }
  
  return baseContextFiles
}

/**
 * Creates a sample base context file for demonstration
 * This can be called to create initial base context content
 */
export async function createSampleBaseContext(): Promise<void> {
  const baseContextDir = path.join(process.cwd(), 'context', 'mag-base-context')
  
  try {
    await fs.mkdir(baseContextDir, { recursive: true })
    
    const sampleContent = {
      fileName: "MAG Company Info.txt",
      fileType: "text/plain",
      fileSize: 1500,
      chunked: [
        "MAG (Consulenza Assicurativa e Finanziaria) è una società di consulenza specializzata nei settori assicurativo e finanziario. Fondata con l'obiettivo di fornire soluzioni innovative e personalizzate, MAG si distingue per l'approccio professionale e la competenza tecnica.",
        "I nostri servizi includono: consulenza assicurativa per privati e aziende, gestione di polizze vita e danni, consulenza finanziaria e investimenti, assistenza nella gestione dei sinistri, formazione e aggiornamento professionale nel settore assicurativo.",
        "MAG opera con le principali compagnie assicurative italiane e internazionali, garantendo ai clienti accesso a un'ampia gamma di prodotti e soluzioni. Il nostro team di esperti è costantemente aggiornato sulle normative e le innovazioni del settore."
      ],
      vectors: [], // Empty vectors array - will be generated when first used
      uploadedAt: new Date().toISOString(),
      embeddingsGenerated: false
    }
    
    const sampleFilePath = path.join(baseContextDir, `${Date.now()}_MAG_Company_Info.txt.json`)
    await fs.writeFile(sampleFilePath, JSON.stringify(sampleContent, null, 2), 'utf-8')
    
    console.log(`[BASE-CONTEXT] Created sample base context file: ${sampleFilePath}`)
  } catch (error) {
    console.error('[BASE-CONTEXT] Error creating sample base context:', error)
  }
} 