import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Function to convert email to env variable format
function emailToEnvKey(email: string): string {
  return `USER_${email.replace(/[@.]/g, '_')}`
}

// Function to get user password from environment
function getUserPassword(email: string): string | undefined {
  const envKey = emailToEnvKey(email)
  return process.env[envKey]
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Get expected password from environment
    const envKey = emailToEnvKey(email)
    const expectedPassword = getUserPassword(email)
    
    // Debug logging
    console.log('Login attempt:', { email, envKey, hasPassword: !!expectedPassword })
    
    if (!expectedPassword) {
      console.log('No password found for key:', envKey)
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Check if password matches
    if (password !== expectedPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Create session
    const cookieStore = await cookies()
    cookieStore.set('mag-gpt-auth', email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Login successful',
      user: { email }
    })

  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 