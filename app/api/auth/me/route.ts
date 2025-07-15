import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import fs from 'fs/promises'
import path from 'path'

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
    let contextFiles: any[] = []
    try {
      const files = await fs.readdir(contextDir)
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(contextDir, file)
          const content = await fs.readFile(filePath, 'utf-8')
          const parsed = JSON.parse(content)
          contextFiles.push({
            fileName: parsed.fileName,
            fileType: parsed.fileType,
            fileSize: parsed.fileSize,
            characterCount: parsed.chunked?.reduce((acc: number, chunk: string) => acc + chunk.length, 0) || 0,
            uploadedAt: parsed.uploadedAt,
            contextPath: filePath
          })
        }
      }
    } catch (err) {
      // No context dir or files, ignore
    }

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