import { NextRequest } from 'next/server'

// Function to normalize model names by removing version suffixes and deduplicate
function deduplicateModels(modelNames: string[]): string[] {
  const modelMap = new Map<string, string[]>()
  
  // Group models by their base name (before any colon)
  for (const modelName of modelNames) {
    const baseName = modelName.split(':')[0]
    if (!modelMap.has(baseName)) {
      modelMap.set(baseName, [])
    }
    modelMap.get(baseName)!.push(modelName)
  }
  
  const deduplicatedModels: string[] = []
  
  // For each group, pick the best version
  for (const [baseName, versions] of modelMap) {
    if (versions.length === 1) {
      // Only one version, keep it
      deduplicatedModels.push(versions[0])
    } else {
      // Multiple versions, prefer the one without version suffix, or highest version
      const withoutSuffix = versions.find(v => !v.includes(':'))
      if (withoutSuffix) {
        deduplicatedModels.push(withoutSuffix)
        console.log(`[MODELS] Deduplicated ${baseName}: kept "${withoutSuffix}" from versions [${versions.join(', ')}]`)
      } else {
        // All have suffixes, keep the one with highest version number
        const sorted = versions.sort((a, b) => {
          const aVersion = parseInt(a.split(':')[1] || '0')
          const bVersion = parseInt(b.split(':')[1] || '0')
          return bVersion - aVersion // Descending order
        })
        deduplicatedModels.push(sorted[0])
        console.log(`[MODELS] Deduplicated ${baseName}: kept "${sorted[0]}" from versions [${versions.join(', ')}]`)
      }
    }
  }
  
  return deduplicatedModels.sort()
}

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
    
    // Extract model names
    const models = data.data || []
    const modelNames = models.map((model: any) => model.id)
    
    console.log('[MODELS] Raw models from LM Studio:', modelNames)
    
    // Smart deduplication that handles version suffixes
    const deduplicatedModels = deduplicateModels(modelNames)
    
    console.log('[MODELS] Unique models after smart deduplication:', deduplicatedModels)

    return new Response(JSON.stringify({ 
      models: deduplicatedModels,
      defaultModel: deduplicatedModels[0] || null 
    }), {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  } catch (error) {
    console.error('[MODELS] Error fetching models:', error)
    
    // Updated fallback models to match what LM Studio actually returns
    const fallbackModels = [
      'google/gemma-3-27b',
      'qwen/qwen3-235b-a22b'  // Removed the :2 suffix to match LM Studio
    ].sort()
    
    console.log('[MODELS] Using fallback models:', fallbackModels)
    
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