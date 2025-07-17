// API endpoint to initialize base context with sample content
import { NextRequest, NextResponse } from 'next/server'
import { createSampleBaseContext } from '@/lib/base-context-loader'

export async function POST(request: NextRequest) {
  try {
    console.log('[BASE-CONTEXT-INIT] Creating sample base context...')
    
    await createSampleBaseContext()
    
    return NextResponse.json({
      success: true,
      message: 'Base context initialized successfully',
      info: 'Sample MAG company information has been added to base context'
    })
  } catch (error) {
    console.error('[BASE-CONTEXT-INIT] Error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to initialize base context',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
} 