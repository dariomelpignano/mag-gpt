"use client"

import type React from "react"

import { useChat } from "@ai-sdk/react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Send, Bot, User, Trash2, Copy, Check, Paperclip, ChevronDown, ChevronUp, FileText, LogOut, Settings, RefreshCw, Square } from "lucide-react"
import { FileUpload, UploadedFile } from "@/components/file-upload"
import { ThemeToggle } from "@/components/theme-toggle"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Extend UploadedFile type to allow 'persistent' property
interface UploadedFileWithPersistent extends UploadedFile {
  persistent?: boolean
}

// Helper function to merge persistent and session files without duplicates
function mergeFiles(contextFiles: UploadedFileWithPersistent[], sessionFiles: UploadedFile[]): UploadedFile[] {
  const merged = [...contextFiles]
  
  // Add session files that aren't already in context
  for (const sessionFile of sessionFiles) {
    const isDuplicate = contextFiles.some(contextFile => 
      contextFile.name === sessionFile.name && 
      Math.abs(contextFile.size - sessionFile.size) < 1000 // Allow small size differences
    )
    if (!isDuplicate) {
      merged.push(sessionFile)
    }
  }
  
  return merged
}



export default function ChatApp() {
  const { messages, input, handleInputChange, setMessages } = useChat()
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [userEmail, setUserEmail] = useState<string>("")
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string>("")
  const [modelsLoading, setModelsLoading] = useState(true)
  const [lastModelsRefresh, setLastModelsRefresh] = useState<Date | null>(null)
  const [contextFiles, setContextFiles] = useState<any[]>([])

  // Debug log for uploaded files
  useEffect(() => {
    console.log('[PAGE] Uploaded files updated:', uploadedFiles.length, uploadedFiles.map(f => f.name))
  }, [uploadedFiles])

  // Function to fetch available models
  const fetchModels = async () => {
    try {
      setModelsLoading(true)
      const response = await fetch('/api/models')
      if (response.ok) {
        const data = await response.json()
        // Additional client-side deduplication to prevent any duplicates
        const rawModels = (data.models || []) as string[]
        const uniqueModels = [...new Set(rawModels)]
        console.log('[PAGE] Models received from API:', data.models)
        console.log('[PAGE] Unique models after deduplication:', uniqueModels)
        setAvailableModels(uniqueModels)
        
        // Only set default model if no model is currently selected
        if (!selectedModel) {
          setSelectedModel(data.defaultModel || uniqueModels[0] || "")
        }
        
        if (data.fallback) {
          console.warn('Using fallback models:', data.error)
        }
        
        setLastModelsRefresh(new Date())
      }
    } catch (error) {
      console.error('Failed to get available models:', error)
      // Fallback models if fetch fails (updated to match LM Studio IDs)
      const fallbackModels = ['google/gemma-3-27b', 'qwen/qwen3-235b-a22b']
      setAvailableModels(fallbackModels)
      if (!selectedModel) {
        setSelectedModel(fallbackModels[0])
      }
      setLastModelsRefresh(new Date())
    } finally {
      setModelsLoading(false)
    }
  }

  // Get user info and models on load
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const data = await response.json()
          setUserEmail(data.user?.email || "")
          setContextFiles(data.contextFiles || [])
          // Refresh models when user is authenticated
          await fetchModels()
        }
      } catch (error) {
        console.error('Failed to get user info:', error)
        // Still try to fetch models even if user info fails
        await fetchModels()
      }
    }
    fetchUserInfo()
  }, [])

  // Listen for context file uploads and refresh context files
  useEffect(() => {
    const handleContextFileUploaded = async (event: any) => {
      const fileName = event.detail?.fileName || 'unknown'
      const isDelayed = event.detail?.delayed || false
      console.log(`[PAGE] Context file uploaded event received: ${fileName} (delayed: ${isDelayed})`)
      
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const data = await response.json()
          console.log(`[PAGE] Fetched ${data.contextFiles?.length || 0} context files from backend`)
          setContextFiles(data.contextFiles || [])
        } else {
          console.error('[PAGE] Failed to fetch context files:', response.status)
        }
      } catch (error) {
        console.error('[PAGE] Failed to refresh context files:', error)
      }
    }

    window.addEventListener('contextFileUploaded', handleContextFileUploaded)
    return () => window.removeEventListener('contextFileUploaded', handleContextFileUploaded)
  }, [])

  // Load persistent context files into uploadedFiles on login or contextFiles change
  useEffect(() => {
    console.log('[PAGE] Context files changed:', contextFiles.length, contextFiles.map(c => c.fileName))
    if (contextFiles.length > 0) {
      Promise.all(contextFiles.map(async (ctx) => {
        try {
          const res = await fetch(`/api/context-file?path=${encodeURIComponent(ctx.contextPath)}`)
          if (res.ok) {
            const data = await res.json()
            return {
              id: `context-${ctx.fileName}`,
              name: ctx.fileName,
              size: ctx.fileSize,
              type: ctx.fileType,
              content: data.content,
              uploadedAt: ctx.uploadedAt,
              persistent: true
            } as UploadedFileWithPersistent
          }
        } catch {}
        return null
      })).then((files) => {
        const validContextFiles = files.filter((f): f is UploadedFileWithPersistent => !!f)
        console.log('[PAGE] Loaded context files:', validContextFiles.length, validContextFiles.map(f => f.name))
        setUploadedFiles((prev) => {
          const sessionFiles = prev.filter(f => !f.persistent)
          console.log('[PAGE] Current session files:', sessionFiles.length, sessionFiles.map(f => f.name))
          const merged = mergeFiles(validContextFiles, sessionFiles)
          console.log('[PAGE] Merged files:', merged.length, merged.map(f => `${f.name}(${f.persistent ? 'context' : 'session'})`))
          return merged
        })
      })
    } else {
      // If no context files, preserve session files
      console.log('[PAGE] No context files, filtering out persistent files')
      setUploadedFiles((prev) => {
        const sessionOnly = prev.filter(f => !f.persistent)
        console.log('[PAGE] Session-only files:', sessionOnly.length, sessionOnly.map(f => f.name))
        return sessionOnly
      })
    }
  }, [contextFiles])

  // Refresh models when the window gains focus (user switches back to the app)
  useEffect(() => {
    const handleFocus = () => {
      // Only refresh if user is authenticated and not currently loading
      if (userEmail && !modelsLoading) {
        console.log('Window gained focus, refreshing models...')
        fetchModels()
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [userEmail, modelsLoading])

  // Refresh models when user email changes (after login/logout)
  useEffect(() => {
    if (userEmail) {
      console.log('User logged in, refreshing models...')
      fetchModels()
    }
  }, [userEmail])

  // Funzione per aggiornare i file che supporta sia array che callback
  const updateUploadedFiles = (newFiles: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => {
    if (typeof newFiles === 'function') {
      setUploadedFiles(newFiles)
    } else {
      setUploadedFiles(newFiles)
    }
  }
  const [showFileUpload, setShowFileUpload] = useState(false)
  const [showUploadedFiles, setShowUploadedFiles] = useState(true)
  const [showUploadPanel, setShowUploadPanel] = useState(true)
  const [originalInput, setOriginalInput] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  
  // Add AbortController for request cancellation
  const abortControllerRef = useRef<AbortController | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const clearChat = () => {
    setMessages([])
    setUploadedFiles([])
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      window.location.reload() // Reload to trigger auth check
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  // Function to stop streaming
  const stopStreaming = () => {
    if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
      console.log('[PAGE] Stopping stream...')
      try {
        abortControllerRef.current.abort()
      } catch (error) {
        console.log('[PAGE] Abort signal already sent')
      }
      abortControllerRef.current = null
      setIsStreaming(false)
    }
  }

  const copyToClipboard = async (text: string, messageId: string) => {
    try {
      // Check if clipboard API is available
      if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000)
      } else {
        // Fallback for older browsers or non-HTTPS contexts
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        
        try {
          document.execCommand('copy')
          setCopiedMessageId(messageId)
          setTimeout(() => setCopiedMessageId(null), 2000)
        } catch (fallbackErr) {
          console.error("Fallback copy failed: ", fallbackErr)
          // Could show a toast notification here
        } finally {
          document.body.removeChild(textArea)
        }
      }
    } catch (err) {
      console.error("Failed to copy text: ", err)
      // Could show a toast notification here
    }
  }

  const getFileContext = () => {
    if (uploadedFiles.length === 0) return ""
    
    const contextParts = uploadedFiles.map(file => {
      return `File: ${file.name}\nType: ${file.type}\nSize: ${(file.size / 1024).toFixed(2)} KB\nContent:\n${file.content}\n---`
    })
    
    return `\n\nContext from uploaded files:\n${contextParts.join('\n')}`
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (input.trim() && !isStreaming) {
      const userMessage = input.trim()
      setOriginalInput(userMessage)
      
      // Clear the input first
      handleInputChange({ target: { value: "" } } as React.ChangeEvent<HTMLInputElement>)
      
      // Create new AbortController for this request
      abortControllerRef.current = new AbortController()
      
      // Set streaming state immediately
      setIsStreaming(true)
      
      // Add user message to chat manually
      const userMsg = {
        id: Date.now().toString(),
        role: 'user' as const,
        content: userMessage
      }
      
      setMessages(prev => [...prev, userMsg])
      
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [{ role: 'user', content: userMessage }],
            uploadedFiles: uploadedFiles,
            model: selectedModel
          }),
          signal: abortControllerRef.current.signal
        })

        if (!response.ok) {
          throw new Error('Failed to get response')
        }

        // Handle streaming response
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        let assistantMessage = ''
        
        // Add initial empty assistant message manually
        const assistantId = (Date.now() + 1).toString()
        const assistantMsg = {
          id: assistantId,
          role: 'assistant' as const,
          content: ''
        }
        
        setMessages(prev => [...prev, assistantMsg])

        if (reader) {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value, { stream: true })
              const lines = chunk.split('\n')

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6)
                  if (data === '[DONE]') {
                    break
                  }
                  
                  try {
                    const parsed = JSON.parse(data)
                    if (parsed.content) {
                      assistantMessage += parsed.content
                      
                      // Update the last message (assistant message)
                      setMessages(prev => {
                        const newMessages = [...prev]
                        if (newMessages.length > 0 && newMessages[newMessages.length - 1].id === assistantId) {
                          newMessages[newMessages.length - 1] = {
                            ...newMessages[newMessages.length - 1],
                            content: assistantMessage
                          }
                        }
                        return newMessages
                      })
                    }
                  } catch (e) {
                    // Ignore parsing errors
                  }
                }
              }
            }
          } catch (readerError: any) {
            // Handle stream reading errors (including AbortError)
            if (readerError.name === 'AbortError') {
              console.log('[PAGE] Stream reading aborted by user')
            } else {
              console.error('[PAGE] Stream reading error:', readerError)
            }
          } finally {
            // Always try to cancel the reader and close the stream
            try {
              await reader.cancel()
            } catch (e) {
              // Ignore cleanup errors
            }
          }
        }
      } catch (error: any) {
        console.error('Error getting AI response:', error)
        
        // Check if it was aborted by user
        if (error.name === 'AbortError') {
          console.log('[PAGE] Request was aborted by user')
          // Add a message indicating the response was stopped
          const stopMsg = {
            id: (Date.now() + 2).toString(),
            role: 'assistant' as const,
            content: 'Response interrupted by user.'
          }
          setMessages(prev => [...prev, stopMsg])
        } else {
          const errorMsg = {
            id: (Date.now() + 2).toString(),
            role: 'assistant' as const,
            content: 'Sorry, I encountered an error while processing your request. Please try again.'
          }
          setMessages(prev => [...prev, errorMsg])
        }
      } finally {
        setIsStreaming(false)
        abortControllerRef.current = null
      }
    }
  }

  // Unified removeFile logic for both session and context files
  const removeFile = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId)
    console.log('[REMOVE FILE] Called for', fileId, file)
    if (file?.persistent) {
      // Call API to delete context file
      try {
        console.log('[REMOVE FILE] Sending DELETE for', { name: file.name, uploadedAt: file.uploadedAt })
        await fetch('/api/context-file', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, uploadedAt: typeof file.uploadedAt === 'string' ? file.uploadedAt : file.uploadedAt.toISOString() })
        })
        // Refresh context files after deletion
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const data = await response.json()
          // Remove the deleted file from UI state
          setUploadedFiles((prev) => prev.filter(f => f.id !== fileId))
        }
      } catch (err) {
        alert('Failed to delete context file on server.')
        return
      }
    } else {
      setUploadedFiles(uploadedFiles.filter(file => file.id !== fileId))
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="border-b bg-white dark:bg-gray-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">MAG-GPT</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Powered with love - v0.1.0</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {/* Model Selector */}
            <div className="flex items-center space-x-2">
              <Settings className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <Select 
                value={selectedModel} 
                onValueChange={setSelectedModel} 
                disabled={modelsLoading || isStreaming}
                onOpenChange={(open) => {
                  // Refresh models when dropdown is opened
                  if (open && !modelsLoading) {
                    console.log('Model selector opened, refreshing models...')
                    fetchModels()
                  }
                }}
              >
                <SelectTrigger className="w-48 h-8 text-xs">
                  <SelectValue placeholder={modelsLoading ? "Loading models..." : "Select model"} />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((model) => (
                    <SelectItem key={model} value={model} className="text-xs">
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchModels}
                disabled={modelsLoading || isStreaming}
                className="h-8 px-2"
                title="Refresh available models"
              >
                <RefreshCw className={`w-3 h-3 ${modelsLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {/* User Info */}
            <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
              <User className="w-4 h-4" />
              <span>{userEmail ? userEmail.split('@')[0] : 'User'}</span>
            </div>
            
            <ThemeToggle />
            
            <Button
              variant="outline"
              size="sm"
              onClick={clearChat}
              disabled={(messages.length === 0 && uploadedFiles.length === 0) || isStreaming}
              className="flex items-center space-x-2 bg-transparent"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Clear Chat</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="flex items-center space-x-2 bg-transparent"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Uploaded Files Panel - Collapsible */}
      {uploadedFiles.length > 0 && (
        <div className="border-b bg-gray-50 dark:bg-gray-800/50">
          <div className="max-w-4xl mx-auto px-4">
            <button
              onClick={() => setShowUploadedFiles(!showUploadedFiles)}
              className="w-full py-3 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4" />
                <span>
                  {(() => {
                    const userFiles = uploadedFiles.filter(file => !file.name?.startsWith('[BASE]'))
                    const baseFiles = uploadedFiles.filter(file => file.name?.startsWith('[BASE]'))
                    const userFilesSize = Math.round(userFiles.reduce((sum, file) => sum + file.content.length, 0) / 1024)
                    
                    return `${userFiles.length} document${userFiles.length !== 1 ? 's' : ''} loaded (${userFilesSize}KB)` +
                           (baseFiles.length > 0 ? ` + ${baseFiles.length} base` : '')
                  })()}
                </span>
              </div>
              {showUploadedFiles ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            
            {showUploadedFiles && uploadedFiles.filter(file => !file.name?.startsWith('[BASE]')).length > 0 && (
              <div className="pb-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {uploadedFiles
                    .filter(file => !file.name?.startsWith('[BASE]')) // Hide base context files from list
                    .map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-2 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        <span className={`inline-flex items-center justify-center w-5 h-5 rounded ${
                          file.persistent ? 'bg-blue-500' : 'bg-gray-400'
                        }`}>{/* icon */}<FileText className="w-4 h-4 text-white flex-shrink-0" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {(file.size / 1024).toFixed(1)}KB • {file.content.length.toLocaleString()} chars
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFile(file.id)}
                        className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                        disabled={isStreaming}
                        title="Remove file"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      {file.persistent && <span className="text-xs text-blue-600 ml-1">context</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="max-w-4xl mx-auto py-6">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <Bot className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">Welcome to MAG-GPT</h2>
              <p className="text-gray-500 dark:text-gray-400">Start a conversation with your local AI assistant</p>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex space-x-4 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <Avatar className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600">
                      <AvatarFallback>
                        <Bot className="w-4 h-4 text-white" />
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <Card
                    className={`max-w-3xl p-4 ${
                      message.role === "user" ? "bg-blue-500 text-white" : "bg-white dark:bg-gray-800"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="whitespace-pre-wrap break-words">
                          {message.role === "user" && uploadedFiles.length > 0 && message.content.includes("Context from uploaded files:")
                            ? originalInput || message.content.split("\n\nContext from uploaded files:")[0]
                            : message.content
                          }
                        </div>
                      </div>
                      {message.role === "assistant" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(message.content, message.id)}
                          className="ml-2 p-1 h-auto"
                        >
                          {copiedMessageId === message.id ? (
                            <Check className="w-4 h-4 text-green-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </Card>

                  {message.role === "user" && (
                    <Avatar className="w-8 h-8 bg-gray-500">
                      <AvatarFallback>
                        <User className="w-4 h-4 text-white" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}

              {isStreaming && (
                <div className="flex space-x-4 justify-start">
                  <Avatar className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600">
                    <AvatarFallback>
                      <Bot className="w-4 h-4 text-white" />
                    </AvatarFallback>
                  </Avatar>
                  <Card className="max-w-3xl p-4 bg-white dark:bg-gray-800">
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <div
                          className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
                          style={{ animationDelay: "0.2s" }}
                        ></div>
                        <div
                          className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
                          style={{ animationDelay: "0.4s" }}
                        ></div>
                      </div>
                      <span className="text-sm text-blue-500">Searching documents...</span>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* File Upload Section */}
      {showFileUpload && (
        <div className={`border-t bg-white dark:bg-gray-800 px-4 ${showUploadPanel ? 'py-4' : 'py-0'}`}>
          <div className="max-w-4xl mx-auto">
            {showUploadPanel ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Upload Files</h3>
                  <button
                    onClick={() => setShowUploadPanel(!showUploadPanel)}
                    className="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </div>
                <FileUpload 
                  files={uploadedFiles.filter(file => !file.name?.startsWith('[BASE]'))} 
                  onFilesChange={(updater) => {
                    // Only handle session files here, context files are handled via context refresh
                    setUploadedFiles((prev) => {
                      if (typeof updater === 'function') {
                        return updater(prev)
                      } else {
                        return updater
                      }
                    })
                  }}
                  removeFile={removeFile}
                  disabled={isStreaming}
                />
              </>
            ) : (
              <div className="flex items-center justify-center min-h-[16px] h-[16px] p-0 m-0">
                <button
                  onClick={() => setShowUploadPanel(!showUploadPanel)}
                  className="flex items-center text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors focus:outline-none"
                  aria-label="Expand upload panel"
                  style={{ height: 16 }}
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t bg-white dark:bg-gray-800 px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={onSubmit} className="flex space-x-4">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                placeholder="Type your message here..."
                disabled={isStreaming}
                className="pr-12 py-3 text-base"
                autoFocus
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const newShowFileUpload = !showFileUpload
                setShowFileUpload(newShowFileUpload)
                // When showing file upload, always expand the panel
                if (newShowFileUpload) {
                  setShowUploadPanel(true)
                }
              }}
              disabled={isStreaming}
              className="px-3 py-3"
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            {isStreaming ? (
              <Button 
                type="button" 
                onClick={stopStreaming}
                className="px-6 py-3"
                title="Stop generating response"
              >
                <Square className="w-4 h-4 fill-current" />
              </Button>
            ) : (
              <Button 
                type="submit" 
                disabled={!input.trim()} 
                className="px-6 py-3"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </Button>
            )}
          </form>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {selectedModel || "No model selected"} is running locally on LM Studio at 192.168.97.3:5002 on Dragoneos server.
              {lastModelsRefresh && (
                <span className="ml-2">
                  • Models refreshed at {lastModelsRefresh.toLocaleTimeString()}
                </span>
              )}
              <br />
              Vector embeddings with text-embedding-nomic-embed-text-v2-moe for semantic search
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
