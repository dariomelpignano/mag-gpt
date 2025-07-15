import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const baseUrl = process.env.LM_STUDIO_BASE_URL || 'http://192.168.97.3:5002'
    
    // Query LM Studio for available models
    const response = await fetch(`${baseUrl}/v1/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`LM Studio API responded with status: ${response.status}`)
    }

    const data = await response.json()
    
    // Extract model names and sort alphabetically
    const models = data.data || []
    const modelNames = models.map((model: any) => model.id).sort()

    return new Response(JSON.stringify({ 
      models: modelNames,
      defaultModel: modelNames[0] || null 
    }), {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error('[MODELS] Error fetching models:', error)
    
    // Fallback to the known models if LM Studio is not reachable
    const fallbackModels = [
      'google/gemma-3-27b',
      'qwen/qwen3-235b-a22b:2'
    ].sort()
    
    return new Response(JSON.stringify({ 
      models: fallbackModels,
      defaultModel: fallbackModels[0],
      fallback: true,
      error: 'Could not reach LM Studio. Using fallback models.'
    }), {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
} 