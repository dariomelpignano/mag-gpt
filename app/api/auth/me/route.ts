import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import fs from 'fs/promises'
import path from 'path'
import { loadBaseContextFiles } from '@/lib/base-context-loader'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const authCookie = cookieStore.get('mag-gpt-auth')

    if (!authCookie?.value) {
      return NextResponse.json(
        { authenticated: false },
        { status: 401 }
      )
    }

    // Load context files for the user
    const user = authCookie.value
    const username = user.split('@')[0]
    const contextDir = path.join(process.cwd(), 'context', username)
    let userContextFiles: any[] = []
    
    // Load user-specific context files
    try {
      const files = await fs.readdir(contextDir)
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(contextDir, file)
          const content = await fs.readFile(filePath, 'utf-8')
          const parsed = JSON.parse(content)
          userContextFiles.push({
            fileName: parsed.fileName,
            fileType: parsed.fileType,
            fileSize: parsed.fileSize,
            characterCount: parsed.chunked?.reduce((acc: number, chunk: string) => acc + chunk.length, 0) || 0,
            uploadedAt: parsed.uploadedAt,
            contextPath: filePath,
            isBaseContext: false
          })
        }
      }
    } catch (err) {
      // No context dir or files, ignore
    }
    
    // Load base context files (available to all users)
    const baseContextFiles = await loadBaseContextFiles()
    
    // Combine base context files with user-specific files
    // Base context files appear first, then user files
    const contextFiles = [...baseContextFiles, ...userContextFiles]
    
    console.log(`[AUTH-ME] Loaded ${baseContextFiles.length} base context files and ${userContextFiles.length} user files for ${username}`)

    return NextResponse.json({
      authenticated: true,
      user: { email: user },
      contextFiles
    })

  } catch (error) {
    console.error('Auth check error:', error)
    return NextResponse.json(
      { authenticated: false },
      { status: 500 }
    )
  }
} 