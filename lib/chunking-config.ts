// Optimized chunking configuration based on content type and language
export interface ChunkingConfig {
  chunkSize: number
  overlap: number
  strategy: 'character' | 'token' | 'semantic'
  minChunkSize: number
  maxChunkSize: number
  preferredSeparators: string[]
  retrievalCount: {
    min: number
    max: number
    default: number
  }
}

export const CHUNKING_CONFIGS: Record<string, ChunkingConfig> = {
  // For legal/medical documents - need larger context
  legal: {
    chunkSize: 1500,
    overlap: 300,
    strategy: 'character',
    minChunkSize: 800,
    maxChunkSize: 2000,
    preferredSeparators: ['\n\n', '. ', '? ', '! ', '; ', '\n'],
    retrievalCount: { min: 3, max: 6, default: 5 }
  },
  
  // For technical documentation - medium chunks
  technical: {
    chunkSize: 1200,
    overlap: 240,
    strategy: 'character',
    minChunkSize: 600,
    maxChunkSize: 1800,
    preferredSeparators: ['\n\n', '\n', '. ', '? ', '! ', ' '],
    retrievalCount: { min: 3, max: 5, default: 4 }
  },
  
  // For general content - balanced approach
  general: {
    chunkSize: 1000,
    overlap: 200,
    strategy: 'character',
    minChunkSize: 500,
    maxChunkSize: 1500,
    preferredSeparators: ['\n\n', '\n', '. ', '? ', '! ', ' '],
    retrievalCount: { min: 3, max: 5, default: 4 }
  },
  
  // For conversational/FAQ content - smaller chunks
  conversational: {
    chunkSize: 800,
    overlap: 160,
    strategy: 'character',
    minChunkSize: 300,
    maxChunkSize: 1200,
    preferredSeparators: ['\n\n', '\n', '. ', '? ', '! ', ' '],
    retrievalCount: { min: 2, max: 4, default: 3 }
  },
  
  // Token-based configuration for better LLM compatibility
  tokenBased: {
    chunkSize: 512, // tokens
    overlap: 100,   // tokens
    strategy: 'token',
    minChunkSize: 200,
    maxChunkSize: 800,
    preferredSeparators: ['\n\n', '\n', '. ', '? ', '! ', ' '],
    retrievalCount: { min: 3, max: 6, default: 4 }
  }
}

export function detectContentType(content: string, fileName: string): string {
  const lowerFileName = fileName.toLowerCase()
  
  // Legal document detection
  if (lowerFileName.includes('contratto') || 
      lowerFileName.includes('polizza') ||
      lowerFileName.includes('legal') ||
      content.includes('articolo') && content.includes('comma')) {
    return 'legal'
  }
  
  // Technical documentation detection
  if (lowerFileName.includes('manual') ||
      lowerFileName.includes('doc') ||
      lowerFileName.includes('guide') ||
      content.includes('API') || 
      content.includes('configurazione')) {
    return 'technical'
  }
  
  // Conversational content detection
  if (content.includes('Domanda:') || 
      content.includes('FAQ') ||
      content.includes('Q:') ||
      content.includes('A:')) {
    return 'conversational'
  }
  
  return 'general'
}

export function getOptimalChunkingConfig(content: string, fileName: string): ChunkingConfig {
  const contentType = detectContentType(content, fileName)
  return CHUNKING_CONFIGS[contentType]
}

// Utility to estimate optimal retrieval count based on query complexity
export function getOptimalRetrievalCount(query: string, config: ChunkingConfig): number {
  const queryLength = query.length
  const complexityIndicators = [
    'spiegami', 'dettagli', 'completo', 'tutto', 'tutti', 'come funziona',
    'explain', 'details', 'complete', 'how does', 'what are all'
  ]
  
  const isComplex = complexityIndicators.some(indicator => 
    query.toLowerCase().includes(indicator)
  )
  
  if (isComplex || queryLength > 100) {
    return config.retrievalCount.max
  } else if (queryLength < 30) {
    return config.retrievalCount.min
  } else {
    return config.retrievalCount.default
  }
} 