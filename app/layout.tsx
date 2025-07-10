"use client"

import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { useState, useEffect } from "react"
import { LoginForm } from "@/components/login-form"

const inter = Inter({ subsets: ["latin"] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [userEmail, setUserEmail] = useState<string>("")

  // Check authentication status on load
  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me')
      if (response.ok) {
        const data = await response.json()
        setIsAuthenticated(data.authenticated)
        if (data.user?.email) {
          setUserEmail(data.user.email)
        }
      } else {
        setIsAuthenticated(false)
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      setIsAuthenticated(false)
    }
  }

  const handleLogin = (email: string) => {
    setIsAuthenticated(true)
    setUserEmail(email)
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      setIsAuthenticated(false)
      setUserEmail("")
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  // Show loading state while checking authentication
  if (isAuthenticated === null) {
    return (
      <html lang="en" className="h-full">
        <head>
          <title>MAG-GPT - Powered by LM Studio</title>
          <meta name="description" content="A ChatGPT-like interface running locally with LM Studio" />
          <meta name="generator" content="v0.dev" />
        </head>
        <body className={`${inter.className} h-full`}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <div className="flex items-center justify-center min-h-screen">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400">Loading...</p>
              </div>
            </div>
            <Toaster />
          </ThemeProvider>
        </body>
      </html>
    )
  }

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <html lang="en" className="h-full">
        <head>
          <title>MAG-GPT - Login</title>
          <meta name="description" content="Login to MAG-GPT" />
        </head>
        <body className={`${inter.className} h-full`}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <LoginForm onLogin={handleLogin} />
            <Toaster />
          </ThemeProvider>
        </body>
      </html>
    )
  }

  // Show main app if authenticated
  return (
    <html lang="en" className="h-full">
      <head>
        <title>MAG-GPT - Powered by LM Studio</title>
        <meta name="description" content="A ChatGPT-like interface running locally with LM Studio" />
        <meta name="generator" content="v0.dev" />
      </head>
      <body className={`${inter.className} h-full`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="h-full">
            {/* Pass logout function and user info to children */}
            {children}
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
