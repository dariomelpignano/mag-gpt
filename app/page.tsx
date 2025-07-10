"use client"

import type React from "react"

import { useChat } from "@ai-sdk/react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Send, Bot, User, Trash2, Copy, Check, Paperclip, ChevronDown, ChevronUp, FileText, LogOut } from "lucide-react"
import { FileUpload, UploadedFile } from "@/components/file-upload"
import { ThemeToggle } from "@/components/theme-toggle"

export default function ChatApp() {
  const { messages, input, handleInputChange, setMessages } = useChat()
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [userEmail, setUserEmail] = useState<string>("")

  // Debug log for uploaded files
  useEffect(() => {
    console.log('[PAGE] Uploaded files updated:', uploadedFiles.length, uploadedFiles.map(f => f.name))
  }, [uploadedFiles])

  // Get user info on load
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (response.ok) {
          const data = await response.json()
          setUserEmail(data.user?.email || "")
        }
      } catch (error) {
        console.error('Failed to get user info:', error)
      }
    }
    fetchUserInfo()
  }, [])

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
    if (input.trim()) {
      const userMessage = input.trim()
      setOriginalInput(userMessage)
      
      // Clear the input first
      handleInputChange({ target: { value: "" } } as React.ChangeEvent<HTMLInputElement>)
      
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
            uploadedFiles: uploadedFiles
          }),
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
        }
      } catch (error) {
        console.error('Error getting AI response:', error)
        const errorMsg = {
          id: (Date.now() + 2).toString(),
          role: 'assistant' as const,
          content: 'Sorry, I encountered an error while processing your request. Please try again.'
        }
        setMessages(prev => [...prev, errorMsg])
      } finally {
        setIsStreaming(false)
      }
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
            {/* User Info */}
            <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-300">
              <User className="w-4 h-4" />
              <span>{userEmail}</span>
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
              className="flex items-center space-x-2 bg-transparent text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
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
                  {uploadedFiles.length} document{uploadedFiles.length !== 1 ? 's' : ''} loaded 
                  ({Math.round(uploadedFiles.reduce((sum, file) => sum + file.content.length, 0) / 1024)}KB)
                </span>
              </div>
              {showUploadedFiles ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            
            {showUploadedFiles && (
              <div className="pb-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-2 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                    >
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
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
                        onClick={() => {
                          const newFiles = uploadedFiles.filter(f => f.id !== file.id)
                          setUploadedFiles(newFiles)
                        }}
                        className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                        disabled={isStreaming}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
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
                  files={uploadedFiles} 
                  onFilesChange={updateUploadedFiles} 
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
              onClick={() => setShowFileUpload(!showFileUpload)}
              disabled={isStreaming}
              className="px-3 py-3"
            >
              <Paperclip className="w-4 h-4" />
            </Button>
            <Button type="submit" disabled={isStreaming || !input.trim()} className="px-6 py-3">
              <Send className="w-4 h-4" />
            </Button>
          </form>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              gemma-3-27b is running locally on LM Studio on a monster server provided by Neosurance.
          </p>
          </div>
        </div>
      </div>
    </div>
  )
}
