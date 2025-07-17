// Evaluation framework for chunking strategies
import { ChunkingConfig, CHUNKING_CONFIGS } from './chunking-config'
import { chunkWithStrategy } from './optimized-chunking'
import { generateEmbeddings, cosineSimilarity } from './embeddings'

export interface ChunkingEvaluation {
  strategy: string
  config: ChunkingConfig
  metrics: {
    avgChunkSize: number
    chunkCount: number
    chunkSizeVariance: number
    semanticCoherence: number
    retrievalPrecision: number
    contextCoverage: number
  }
  performance: {
    chunkingTime: number
    embeddingTime: number
    retrievalTime: number
  }
}

export interface EvaluationQuery {
  query: string
  expectedChunks?: string[]
  complexity: 'simple' | 'medium' | 'complex'
}

// Sample evaluation queries for testing
export const EVALUATION_QUERIES: EvaluationQuery[] = [
  {
    query: "Quanti punti di invalidità per la rottura del femore?",
    complexity: 'simple'
  },
  {
    query: "Spiegami dettagliatamente il processo di richiesta risarcimento per lesioni gravi",
    complexity: 'complex'
  },
  {
    query: "Cosa copre la polizza per i dipendenti?",
    complexity: 'medium'
  },
  {
    query: "Come funziona il sistema di autenticazione?",
    complexity: 'medium'
  },
  {
    query: "Dammi tutti i dettagli sui servizi offerti da MAG per le università",
    complexity: 'complex'
  }
]

export async function evaluateChunkingStrategy(
  text: string,
  fileName: string,
  strategy: string,
  config: ChunkingConfig,
  queries: EvaluationQuery[]
): Promise<ChunkingEvaluation> {
  
  console.log(`[EVAL] Evaluating ${strategy} strategy for ${fileName}`)
  
  // Measure chunking performance
  const chunkingStart = Date.now()
  const chunks = chunkWithStrategy(text, config, fileName)
  const chunkingTime = Date.now() - chunkingStart
  
  // Calculate basic metrics
  const avgChunkSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length
  const chunkSizes = chunks.map(chunk => chunk.length)
  const chunkSizeVariance = calculateVariance(chunkSizes)
  
  // Measure embedding generation performance
  const embeddingStart = Date.now()
  let embeddings: number[][] = []
  try {
    embeddings = await generateEmbeddings(chunks)
  } catch (error) {
    console.error('[EVAL] Error generating embeddings:', error)
    embeddings = chunks.map(() => new Array(768).fill(0)) // Fallback empty embeddings
  }
  const embeddingTime = Date.now() - embeddingStart
  
  // Evaluate semantic coherence (average similarity between adjacent chunks)
  let semanticCoherence = 0
  if (embeddings.length > 1) {
    const similarities: number[] = []
    for (let i = 0; i < embeddings.length - 1; i++) {
      const similarity = cosineSimilarity(embeddings[i], embeddings[i + 1])
      similarities.push(similarity)
    }
    semanticCoherence = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length
  }
  
  // Evaluate retrieval performance with test queries
  const retrievalStart = Date.now()
  let retrievalPrecision = 0
  let contextCoverage = 0
  
  for (const testQuery of queries) {
    try {
      const queryEmbedding = await generateEmbeddings([testQuery.query])
      const similarities = embeddings.map((embedding, index) => ({
        index,
        chunk: chunks[index],
        similarity: cosineSimilarity(queryEmbedding[0], embedding)
      })).sort((a, b) => b.similarity - a.similarity)
      
      // Top-k precision (using top 3 chunks)
      const topChunks = similarities.slice(0, 3)
      const avgTopSimilarity = topChunks.reduce((sum, item) => sum + item.similarity, 0) / topChunks.length
      retrievalPrecision += avgTopSimilarity
      
      // Context coverage (how much of the total relevant information is captured)
      const totalRelevantSimilarity = similarities.slice(0, 5).reduce((sum, item) => sum + item.similarity, 0)
      const topSimilarity = topChunks.reduce((sum, item) => sum + item.similarity, 0)
      contextCoverage += totalRelevantSimilarity > 0 ? topSimilarity / totalRelevantSimilarity : 0
      
    } catch (error) {
      console.error('[EVAL] Error in retrieval evaluation:', error)
    }
  }
  
  retrievalPrecision /= queries.length
  contextCoverage /= queries.length
  const retrievalTime = Date.now() - retrievalStart
  
  return {
    strategy,
    config,
    metrics: {
      avgChunkSize,
      chunkCount: chunks.length,
      chunkSizeVariance,
      semanticCoherence,
      retrievalPrecision,
      contextCoverage
    },
    performance: {
      chunkingTime,
      embeddingTime,
      retrievalTime
    }
  }
}

export async function compareChunkingStrategies(
  text: string,
  fileName: string,
  queries: EvaluationQuery[] = EVALUATION_QUERIES
): Promise<ChunkingEvaluation[]> {
  
  console.log(`[EVAL] Comparing chunking strategies for ${fileName}`)
  
  const results: ChunkingEvaluation[] = []
  
  // Test all available strategies
  for (const [strategyName, config] of Object.entries(CHUNKING_CONFIGS)) {
    try {
      const evaluation = await evaluateChunkingStrategy(text, fileName, strategyName, config, queries)
      results.push(evaluation)
    } catch (error) {
      console.error(`[EVAL] Error evaluating ${strategyName}:`, error)
    }
  }
  
  // Sort by overall score (composite metric)
  results.sort((a, b) => {
    const scoreA = calculateOverallScore(a)
    const scoreB = calculateOverallScore(b)
    return scoreB - scoreA
  })
  
  return results
}

function calculateVariance(numbers: number[]): number {
  const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length
  const squaredDiffs = numbers.map(num => Math.pow(num - mean, 2))
  return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length
}

function calculateOverallScore(evaluation: ChunkingEvaluation): number {
  const { metrics } = evaluation
  
  // Weighted composite score
  const weights = {
    semanticCoherence: 0.3,
    retrievalPrecision: 0.4,
    contextCoverage: 0.2,
    chunkSizeConsistency: 0.1
  }
  
  // Normalize chunk size consistency (lower variance is better)
  const maxVariance = 500000 // Reasonable upper bound for variance
  const chunkSizeConsistency = Math.max(0, 1 - (metrics.chunkSizeVariance / maxVariance))
  
  return (
    weights.semanticCoherence * metrics.semanticCoherence +
    weights.retrievalPrecision * metrics.retrievalPrecision +
    weights.contextCoverage * metrics.contextCoverage +
    weights.chunkSizeConsistency * chunkSizeConsistency
  )
}

export function logEvaluationResults(results: ChunkingEvaluation[]): void {
  console.log('\n=== CHUNKING STRATEGY EVALUATION RESULTS ===\n')
  
  results.forEach((result, index) => {
    const score = calculateOverallScore(result)
    console.log(`${index + 1}. ${result.strategy.toUpperCase()} (Score: ${score.toFixed(3)})`)
    console.log(`   Chunks: ${result.metrics.chunkCount}, Avg Size: ${result.metrics.avgChunkSize.toFixed(0)} chars`)
    console.log(`   Coherence: ${result.metrics.semanticCoherence.toFixed(3)}, Precision: ${result.metrics.retrievalPrecision.toFixed(3)}`)
    console.log(`   Coverage: ${result.metrics.contextCoverage.toFixed(3)}, Variance: ${result.metrics.chunkSizeVariance.toFixed(0)}`)
    console.log(`   Performance: ${result.performance.chunkingTime}ms chunk, ${result.performance.embeddingTime}ms embed`)
    console.log('')
  })
} 