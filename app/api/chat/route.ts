import { NextRequest } from 'next/server'
import { ChatOpenAI } from '@langchain/openai'
import { PromptTemplate } from '@langchain/core/prompts'
import { generateChunkEmbeddings, findRelevantChunks } from '@/lib/embeddings'

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
  
  return chunks.filter(chunk => chunk.length > 50) // Rimuovi chunk troppo piccoli
}

// Cache per gli embeddings per evitare ricalcoli
const embeddingsCache = new Map<string, { 
  embeddings: any, 
  timestamp: number,
  contentHash: string 
}>()

// Cache validity: 1 hour
const CACHE_VALIDITY_MS = 60 * 60 * 1000

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

function getCacheKey(fileChunks: { fileName: string, chunks: string[] }[]): { key: string, contentHash: string } {
  // Create content hash based on actual chunk content
  const contentForHashing = fileChunks
    .map(file => `${file.fileName}:${file.chunks.join('')}`)
    .sort()
    .join('|')
  
  const contentHash = simpleHash(contentForHashing)
  
  // Create cache key based on file names and chunk count
  const key = fileChunks
    .map(file => `${file.fileName}:${file.chunks.length}`)
    .sort()
    .join('|')
    
  return { key, contentHash }
}

function isCacheValid(cacheEntry: { embeddings: any, timestamp: number, contentHash: string }, contentHash: string): boolean {
  const now = Date.now()
  const isTimeValid = (now - cacheEntry.timestamp) < CACHE_VALIDITY_MS
  const isContentValid = cacheEntry.contentHash === contentHash
  
  return isTimeValid && isContentValid
}

// Cleanup expired cache entries periodically
function cleanupCache() {
  const now = Date.now()
  let removedCount = 0
  
  for (const [key, entry] of embeddingsCache.entries()) {
    if ((now - entry.timestamp) >= CACHE_VALIDITY_MS) {
      embeddingsCache.delete(key)
      removedCount++
    }
  }
  
  if (removedCount > 0) {
    console.log(`[EMBEDDINGS] Cleaned up ${removedCount} expired cache entries`)
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupCache, 30 * 60 * 1000)

export async function POST(request: NextRequest) {
  try {
    const { messages, uploadedFiles, model } = await request.json()
    
    if (!messages || messages.length === 0) {
      return new Response('No messages provided', { status: 400 })
    }

    // Use provided model or default to gemma-3-27b
    const selectedModel = model || 'google/gemma-3-27b'

    const lastMessage = messages[messages.length - 1]
    const userQuery = lastMessage.content

    // Sistema RAG: chunking e retrieval con embeddings
    let context = ''
    if (uploadedFiles && uploadedFiles.length > 0) {
      console.log('[RAG] Processing', uploadedFiles.length, 'files for retrieval with embeddings')
      
      // Dividi ogni file in chunk
      const fileChunks = uploadedFiles.map((file: any) => ({
        fileName: file.name,
        chunks: chunkText(file.content, 800, 150) // Chunk più piccoli per precisione
      }))
      
      try {
        // Check cache for embeddings
        const { key: cacheKey, contentHash } = getCacheKey(fileChunks)
        const cacheEntry = embeddingsCache.get(cacheKey)
        let chunksWithEmbeddings
        
        if (cacheEntry && isCacheValid(cacheEntry, contentHash)) {
          console.log('[RAG] Using cached embeddings')
          chunksWithEmbeddings = cacheEntry.embeddings
        } else {
          console.log('[RAG] Generating new embeddings...')
          chunksWithEmbeddings = await generateChunkEmbeddings(fileChunks)
          
          // Update cache with new embeddings
          embeddingsCache.set(cacheKey, {
            embeddings: chunksWithEmbeddings,
            timestamp: Date.now(),
            contentHash: contentHash
          })
          console.log('[RAG] Embeddings cached for future use')
        }
        
        // Recupera i chunk più rilevanti usando similarità vettoriale
        const relevantChunks = await findRelevantChunks(userQuery, chunksWithEmbeddings, 4)
        
        if (relevantChunks.length > 0) {
          context = `\n\nRelevant context from uploaded files:\n${relevantChunks.join('\n\n---\n\n')}`
          console.log('[RAG] Retrieved', relevantChunks.length, 'relevant chunks using vector similarity')
        } else {
          console.log('[RAG] No relevant chunks found')
        }
      } catch (error) {
        console.error('[RAG] Error in embeddings processing:', error)
        console.log('[RAG] Falling back to simple text search')
        
        // Fallback to simple keyword matching if embeddings fail
        const allChunks: { chunk: string, fileName: string }[] = []
        for (const file of fileChunks) {
          for (const chunk of file.chunks) {
            allChunks.push({ chunk, fileName: file.fileName })
          }
        }
        
        // Simple fallback: take first few chunks
        const fallbackChunks = allChunks
          .slice(0, 4)
          .map(item => `[${item.fileName}]\n${item.chunk}`)
        
        if (fallbackChunks.length > 0) {
          context = `\n\nRelevant context from uploaded files:\n${fallbackChunks.join('\n\n---\n\n')}`
          console.log('[RAG] Using fallback chunks:', fallbackChunks.length)
        }
      }
    }

    // Crea il prompt con il contesto rilevante
    const prompt = PromptTemplate.fromTemplate(`
You are a helpful AI assistant. Answer the user's question based on the provided context and your knowledge.

IMPORTANT LANGUAGE INSTRUCTIONS:
- If the user writes in Italian, respond in Italian unless they specifically request English
- If the user writes in English, respond in English
- Match the language and tone of the user's question
- Be natural and conversational in the chosen language

{context}

User question: {question}

Please provide a clear, accurate, and helpful response. If the context doesn't contain enough information to answer the question, say so and provide what you can based on your general knowledge. Remember to respond in the same language as the user's question.
`)

    // LM Studio configuration
    const llmModel = new ChatOpenAI({
      openAIApiKey: 'not-needed', // LM Studio doesn't require a real API key
      configuration: {
        baseURL: 'http://192.168.97.3:5002/v1',
      },
      modelName: selectedModel,
      temperature: 0.1, // Più deterministico per risposte precise
    })

    const chain = prompt.pipe(llmModel)

    const formattedPrompt = await prompt.format({
      context: context || 'No specific context provided.',
      question: userQuery
    })

    // Streaming response
    const stream = await llmModel.stream(formattedPrompt)
    
    const encoder = new TextEncoder()
    
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.content
            if (text) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`))
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          console.error('[CHAT] Streaming error:', error)
          controller.error(error)
        }
      }
    })

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[CHAT] Error:', error)
    return new Response('Failed to process chat request', { status: 500 })
  }
}
