import { ChunkingConfig } from './chunking-config'

// Enhanced chunking function with semantic boundary awareness
export function chunkTextOptimized(
  text: string, 
  config: ChunkingConfig,
  fileName: string = ''
): string[] {
  const chunks: string[] = []
  let start = 0
  
  console.log(`[CHUNKING] Using optimized chunking for ${fileName}: size=${config.chunkSize}, overlap=${config.overlap}, strategy=${config.strategy}`)
  
  while (start < text.length) {
    const end = Math.min(start + config.chunkSize, text.length)
    let chunk = text.substring(start, end)
    
    // If not the last chunk, try to find a good boundary
    if (end < text.length) {
      let bestCutPoint = end
      
      // Try separators in order of preference
      for (const separator of config.preferredSeparators) {
        const lastIndex = chunk.lastIndexOf(separator)
        
        // Use this separator if it's in the last 30% of the chunk
        if (lastIndex > chunk.length * 0.7) {
          bestCutPoint = start + lastIndex + separator.length
          chunk = text.substring(start, bestCutPoint)
          break
        }
      }
      
      start = bestCutPoint
    } else {
      start = end
    }
    
    // Clean up the chunk
    chunk = chunk.trim()
    
    // Only add chunk if it meets minimum size requirements
    if (chunk.length >= config.minChunkSize) {
      chunks.push(chunk)
    }
    
    // Apply overlap
    if (start < text.length && config.overlap > 0) {
      start = Math.max(0, start - config.overlap)
    }
  }
  
  console.log(`[CHUNKING] Created ${chunks.length} chunks from ${text.length} characters`)
  return chunks.filter(chunk => chunk.length > 50) // Remove very small chunks
}

// Token-based chunking for better LLM compatibility
export function chunkTextByTokens(
  text: string,
  config: ChunkingConfig,
  fileName: string = ''
): string[] {
  // Rough token estimation: 1 token ≈ 4 characters for Italian/English
  const CHARS_PER_TOKEN = 4
  
  const targetChunkSizeChars = config.chunkSize * CHARS_PER_TOKEN
  const targetOverlapChars = config.overlap * CHARS_PER_TOKEN
  
  console.log(`[CHUNKING] Using token-based chunking for ${fileName}: ~${config.chunkSize} tokens (${targetChunkSizeChars} chars)`)
  
  return chunkTextOptimized(text, {
    ...config,
    chunkSize: targetChunkSizeChars,
    overlap: targetOverlapChars,
    minChunkSize: config.minChunkSize * CHARS_PER_TOKEN,
    maxChunkSize: config.maxChunkSize * CHARS_PER_TOKEN
  }, fileName)
}

// Semantic chunking using sentence boundaries
export function chunkTextSemantic(
  text: string,
  config: ChunkingConfig,
  fileName: string = ''
): string[] {
  console.log(`[CHUNKING] Using semantic chunking for ${fileName}`)
  
  // Split by sentences first
  const sentences = text.split(/(?<=[.!?])\s+/)
  const chunks: string[] = []
  let currentChunk = ''
  
  for (const sentence of sentences) {
    const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence
    
    if (potentialChunk.length <= config.chunkSize) {
      currentChunk = potentialChunk
    } else {
      // Current chunk is ready
      if (currentChunk.length >= config.minChunkSize) {
        chunks.push(currentChunk.trim())
      }
      
      // Start new chunk with current sentence
      currentChunk = sentence
    }
  }
  
  // Add final chunk
  if (currentChunk.length >= config.minChunkSize) {
    chunks.push(currentChunk.trim())
  }
  
  // Apply overlapping by including last sentence of previous chunk
  if (config.overlap > 0) {
    for (let i = 1; i < chunks.length; i++) {
      const prevChunkSentences = chunks[i-1].split(/(?<=[.!?])\s+/)
      const overlapSentences = prevChunkSentences.slice(-1) // Take last sentence
      
      if (overlapSentences.length > 0 && overlapSentences[0].length < config.overlap) {
        chunks[i] = overlapSentences[0] + ' ' + chunks[i]
      }
    }
  }
  
  console.log(`[CHUNKING] Created ${chunks.length} semantic chunks`)
  return chunks.filter(chunk => chunk.length > 50)
}

// Main chunking function that routes to appropriate strategy
export function chunkWithStrategy(
  text: string,
  config: ChunkingConfig,
  fileName: string = ''
): string[] {
  switch (config.strategy) {
    case 'token':
      return chunkTextByTokens(text, config, fileName)
    case 'semantic':
      return chunkTextSemantic(text, config, fileName)
    case 'character':
    default:
      return chunkTextOptimized(text, config, fileName)
  }
} 