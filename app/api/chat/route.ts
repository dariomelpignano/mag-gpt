import { NextRequest } from 'next/server'
import { ChatOpenAI } from '@langchain/openai'
import { PromptTemplate } from '@langchain/core/prompts'

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

// Funzione per calcolare similarità semantica semplice (basata su parole chiave)
function calculateSimilarity(query: string, chunk: string): number {
  const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 3)
  const chunkWords = chunk.toLowerCase().split(/\s+/).filter(word => word.length > 3)
  
  let matches = 0
  for (const queryWord of queryWords) {
    if (chunkWords.some(chunkWord => chunkWord.includes(queryWord) || queryWord.includes(chunkWord))) {
      matches++
    }
  }
  
  return matches / Math.max(queryWords.length, 1)
}

// Funzione per recuperare i chunk più rilevanti
function retrieveRelevantChunks(query: string, fileChunks: { fileName: string, chunks: string[] }[], topK: number = 3): string[] {
  const allChunks: { chunk: string, fileName: string, similarity: number }[] = []
  
  for (const file of fileChunks) {
    for (const chunk of file.chunks) {
      const similarity = calculateSimilarity(query, chunk)
      allChunks.push({ chunk, fileName: file.fileName, similarity })
    }
  }
  
  // Ordina per similarità e prendi i top K
  return allChunks
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .map(item => `[${item.fileName}]\n${item.chunk}`)
}

export async function POST(request: NextRequest) {
  try {
    const { messages, uploadedFiles } = await request.json()
    
    if (!messages || messages.length === 0) {
      return new Response('No messages provided', { status: 400 })
    }

    const lastMessage = messages[messages.length - 1]
    const userQuery = lastMessage.content

    // Sistema RAG: chunking e retrieval
    let context = ''
    if (uploadedFiles && uploadedFiles.length > 0) {
      console.log('[RAG] Processing', uploadedFiles.length, 'files for retrieval')
      
      // Dividi ogni file in chunk
      const fileChunks = uploadedFiles.map((file: any) => ({
        fileName: file.name,
        chunks: chunkText(file.content, 800, 150) // Chunk più piccoli per precisione
      }))
      
      // Recupera i chunk più rilevanti
      const relevantChunks = retrieveRelevantChunks(userQuery, fileChunks, 4)
      
      if (relevantChunks.length > 0) {
        context = `\n\nRelevant context from uploaded files:\n${relevantChunks.join('\n\n---\n\n')}`
        console.log('[RAG] Retrieved', relevantChunks.length, 'relevant chunks')
      } else {
        console.log('[RAG] No relevant chunks found')
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
    const model = new ChatOpenAI({
      openAIApiKey: 'not-needed', // LM Studio doesn't require a real API key
      configuration: {
        baseURL: 'http://localhost:1234/v1',
      },
      modelName: 'google/gemma-3-27b', // Your downloaded Gemma 3 27B model
      temperature: 0.1, // Più deterministico per risposte precise
    })

    const chain = prompt.pipe(model)

    const formattedPrompt = await prompt.format({
      context: context || 'No specific context provided.',
      question: userQuery
    })

    // Streaming response
    const stream = await model.stream(formattedPrompt)
    
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
