interface EmbeddingResponse {
  object: string
  data: Array<{
    object: string
    embedding: number[]
    index: number
  }>
  model: string
  usage: {
    prompt_tokens: number
    total_tokens: number
  }
}

interface ChunkWithEmbedding {
  chunk: string
  fileName: string
  embedding: number[]
  index: number
}

/**
 * Generate embeddings for text using LM Studio's text-embedding-nomic-embed-text-v2-moe model
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const response = await fetch('http://192.168.97.3:5002/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: texts,
        model: 'text-embedding-nomic-embed-text-v2-moe',
        encoding_format: 'float'
      }),
    })

    if (!response.ok) {
      throw new Error(`Embeddings API responded with status: ${response.status}`)
    }

    const data: EmbeddingResponse = await response.json()
    
    // Extract embeddings in the correct order
    const embeddings = data.data
      .sort((a, b) => a.index - b.index)
      .map(item => item.embedding)

    console.log(`[EMBEDDINGS] Generated embeddings for ${texts.length} texts, dimension: ${embeddings[0]?.length || 0}`)
    
    return embeddings
  } catch (error) {
    console.error('[EMBEDDINGS] Error generating embeddings:', error)
    throw error
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  normA = Math.sqrt(normA)
  normB = Math.sqrt(normB)

  if (normA === 0 || normB === 0) {
    return 0
  }

  return dotProduct / (normA * normB)
}

/**
 * Generate embeddings for file chunks and store them with metadata
 */
export async function generateChunkEmbeddings(
  fileChunks: { fileName: string, chunks: string[] }[]
): Promise<ChunkWithEmbedding[]> {
  const allChunks: { chunk: string, fileName: string, index: number }[] = []
  
  // Flatten all chunks with metadata
  let globalIndex = 0
  for (const file of fileChunks) {
    for (const chunk of file.chunks) {
      allChunks.push({
        chunk,
        fileName: file.fileName,
        index: globalIndex++
      })
    }
  }

  if (allChunks.length === 0) {
    return []
  }

  console.log(`[EMBEDDINGS] Generating embeddings for ${allChunks.length} chunks...`)
  
  // Generate embeddings for all chunks
  const embeddings = await generateEmbeddings(allChunks.map(item => item.chunk))
  
  // Combine chunks with their embeddings
  const chunksWithEmbeddings: ChunkWithEmbedding[] = allChunks.map((item, index) => ({
    chunk: item.chunk,
    fileName: item.fileName,
    embedding: embeddings[index],
    index: item.index
  }))

  return chunksWithEmbeddings
}

/**
 * Find the most relevant chunks using vector similarity
 */
export async function findRelevantChunks(
  query: string,
  chunksWithEmbeddings: ChunkWithEmbedding[],
  topK: number = 4
): Promise<string[]> {
  if (chunksWithEmbeddings.length === 0) {
    return []
  }

  console.log(`[EMBEDDINGS] Finding relevant chunks for query: "${query.slice(0, 100)}..."`)
  
  // Generate embedding for the query
  const queryEmbeddings = await generateEmbeddings([query])
  const queryEmbedding = queryEmbeddings[0]

  // Calculate similarity scores
  const similarities = chunksWithEmbeddings.map(item => ({
    chunk: item.chunk,
    fileName: item.fileName,
    similarity: cosineSimilarity(queryEmbedding, item.embedding)
  }))

  // Sort by similarity and get top K
  const topChunks = similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK)
    .map(item => `[${item.fileName}] (similarity: ${item.similarity.toFixed(3)})\n${item.chunk}`)

  console.log(`[EMBEDDINGS] Found ${topChunks.length} relevant chunks, top similarity: ${similarities[0]?.similarity.toFixed(3) || 0}`)
  
  return topChunks
} 