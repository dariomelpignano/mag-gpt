import { NextRequest } from 'next/server'
import { generateEmbeddings } from '@/lib/embeddings'

export async function GET(request: NextRequest) {
  try {
    console.log('[EMBEDDINGS-TEST] Testing embeddings model...')
    
    // Test with a simple text
    const testTexts = [
      'This is a test sentence for embeddings.',
      'Another test sentence with different content.'
    ]
    
    const embeddings = await generateEmbeddings(testTexts)
    
    return new Response(JSON.stringify({
      success: true,
      model: 'text-embedding-nomic-embed-text-v2-moe',
      testTexts: testTexts,
      embeddingDimension: embeddings[0]?.length || 0,
      embeddingsCount: embeddings.length,
      sampleEmbedding: embeddings[0]?.slice(0, 5) // First 5 dimensions as sample
    }), {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error('[EMBEDDINGS-TEST] Error:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      model: 'text-embedding-nomic-embed-text-v2-moe'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
} 