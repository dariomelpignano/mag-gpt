import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const filePath = url.searchParams.get('path')
    if (!filePath || !filePath.startsWith(path.join(process.cwd(), 'context'))) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
    }
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(content)
    // Join all chunks into a single string for context
    const contextString = Array.isArray(parsed.chunked) ? parsed.chunked.join('\n') : ''
    return NextResponse.json({ content: contextString })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load context file', details: String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { name, uploadedAt } = await request.json()
    console.log('[CONTEXT DELETE] Requested:', { name, uploadedAt })
    if (!name || !uploadedAt) {
      console.log('[CONTEXT DELETE] Missing file name or uploadedAt')
      return NextResponse.json({ error: 'Missing file name or uploadedAt' }, { status: 400 })
    }
    // Get current user from cookie
    let user = null
    try {
      const cookieStore = await cookies()
      const authCookie = cookieStore.get('mag-gpt-auth')
      if (authCookie?.value) {
        user = authCookie.value.split('@')[0]
      }
    } catch (err) {
      console.log('[CONTEXT DELETE] Cookie error:', err)
    }
    if (!user) {
      console.log('[CONTEXT DELETE] Not authenticated')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    // Only search in this user's context folder
    const userDir = path.join(process.cwd(), 'context', user)
    let deleted = false
    try {
      const files = await fs.readdir(userDir)
      console.log(`[CONTEXT DELETE] Checking files in ${userDir}:`, files)
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(userDir, file)
          const content = await fs.readFile(filePath, 'utf-8')
          const parsed = JSON.parse(content)
          console.log('[CONTEXT DELETE] Candidate:', { file: file, fileName: parsed.fileName, uploadedAt: parsed.uploadedAt })
          // Compare uploadedAt as ISO string
          const parsedUploadedAt = new Date(parsed.uploadedAt).toISOString()
          const reqUploadedAt = new Date(uploadedAt).toISOString()
          if (parsed.fileName === name && parsedUploadedAt === reqUploadedAt) {
            await fs.unlink(filePath)
            deleted = true
            console.log('[CONTEXT DELETE] Deleted:', filePath)
            break
          }
        }
      }
    } catch (err) {
      console.log('[CONTEXT DELETE] Error reading/deleting files:', err)
    }
    if (deleted) {
      console.log('[CONTEXT DELETE] Success')
      return NextResponse.json({ success: true })
    } else {
      console.log('[CONTEXT DELETE] File not found')
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
  } catch (error) {
    console.log('[CONTEXT DELETE] Handler error:', error)
    return NextResponse.json({ error: 'Failed to delete context file', details: String(error) }, { status: 500 })
  }
} 