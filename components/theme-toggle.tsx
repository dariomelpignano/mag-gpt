"use client"

import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const [mounted, setMounted] = React.useState(false)
  const { theme, setTheme, systemTheme } = useTheme()

  React.useEffect(() => {
    setMounted(true)
  }, [])

  // Don't render anything until component is mounted to prevent hydration mismatch
  if (!mounted) {
    return (
      <Button variant="outline" size="sm" className="w-9 h-9" disabled>
        <Sun className="h-4 w-4" />
        <span className="sr-only">Loading theme toggle...</span>
      </Button>
    )
  }

  // Determine current theme (handle system theme)
  const currentTheme = theme === 'system' ? systemTheme : theme
  const isDark = currentTheme === 'dark'

  const toggleTheme = () => {
    try {
      setTheme(isDark ? 'light' : 'dark')
    } catch (error) {
      console.error('Failed to toggle theme:', error)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      className="w-9 h-9"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      {isDark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
} 