import React, { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { X, FileText, File, Image, FileCode, FileArchive, FileSpreadsheet, FileType } from "lucide-react"
import { RadioGroup } from '@/components/ui/radio-group'

export interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  content: string
  uploadedAt: Date
  persistent?: boolean // true if saved as context
}

interface FileUploadProps {
  files: UploadedFile[]
  onFilesChange: (files: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void
  disabled?: boolean
  removeFile?: (fileId: string) => void
}

const getFileIcon = (type: string, fileName: string) => {
  if (type.startsWith('image/')) return <Image className="w-4 h-4" />
  if (type.includes('pdf') || fileName.endsWith('.pdf')) return <FileType className="w-4 h-4" />
  if (type.includes('spreadsheet') || type.includes('excel') || fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) return <FileSpreadsheet className="w-4 h-4" />
  if (type.includes('word') || type.includes('document') || fileName.endsWith('.doc') || fileName.endsWith('.docx')) return <FileText className="w-4 h-4" />
  if (type.includes('text') || type.includes('json') || type.includes('xml') || fileName.endsWith('.md') || fileName.endsWith('.txt')) return <FileText className="w-4 h-4" />
  if (type.includes('code') || type.includes('javascript') || type.includes('python')) return <FileCode className="w-4 h-4" />
  if (type.includes('zip') || type.includes('tar') || type.includes('rar')) return <FileArchive className="w-4 h-4" />
  return <File className="w-4 h-4" />
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function FileUpload({ files, onFilesChange, disabled = false, removeFile }: FileUploadProps) {
  console.log('[FILE UPLOAD] Render', files)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [contextMode, setContextMode] = useState<'session' | 'context'>('session')
  const [uploadProgress, setUploadProgress] = useState<{
    fileName: string
    currentPage: number
    totalPages: number
    status: string
  } | null>(null)

  // Debug log for files prop
  useEffect(() => {
    console.log('[FILE-UPLOAD] Files prop updated:', files.length, files.map(f => f.name))
  }, [files])

  useEffect(() => {
    if (uploadError) {
      const timer = setTimeout(() => setUploadError(null), 6000) // Increased to 6 seconds
      return () => clearTimeout(timer)
    }
  }, [uploadError])

  const acceptedFileTypes = [
    '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.py', 
    '.html', '.css', '.xml', '.csv', '.log', '.pdf', '.doc', '.docx', '.xls', '.xlsx'
  ]

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (!selectedFiles) return

    setIsUploading(true)
    setUploadError(null) // Clear previous errors
    setUploadProgress(null) // Clear previous progress

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        const formData = new FormData()
        formData.append('file', file)
        formData.append('contextMode', contextMode)

        // Set initial progress for large PDFs
        if (file.type === 'application/pdf' && file.size > 10 * 1024 * 1024) { // 10MB+
          setUploadProgress({
            fileName: file.name,
            currentPage: 0,
            totalPages: 0,
            status: 'Uploading large PDF...'
          })
        }

        let response: Response
        try {
          response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          })
        } catch (fetchError) {
          console.error('Network error during upload:', fetchError)
          throw new Error(`Network error: ${fetchError instanceof Error ? fetchError.message : 'Connection failed'}`)
        }

        let result: any
        try {
          // Check if response is JSON
          const contentType = response.headers.get('content-type')
          if (!contentType || !contentType.includes('application/json')) {
            // Response is not JSON, likely an HTML error page
            const textResponse = await response.text()
            console.error('Non-JSON response received:', textResponse.substring(0, 500))
            throw new Error('Server returned an HTML error page instead of JSON. This usually indicates a timeout or server error during processing.')
          }
          
          result = await response.json()
        } catch (parseError) {
          console.error('Error parsing JSON response:', parseError)
          if (parseError instanceof Error && parseError.message.includes('Unexpected token')) {
            throw new Error('Server response was not valid JSON. The file processing may have timed out. Try uploading a smaller file or contact support.')
          }
          throw new Error(`Failed to parse server response: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`)
        }

        if (!response.ok) {
          // Server returned an error
          let errorMessage = result.error || 'Upload failed'
          if (result.suggestions && Array.isArray(result.suggestions)) {
            errorMessage += '\n\nSuggerimenti:\n' + result.suggestions.map((s: string) => `• ${s}`).join('\n')
          }
          
          throw new Error(errorMessage)
        }
        
        if (result.success) {
          // Clear progress when done
          setUploadProgress(null)
          
          if (contextMode === 'context' && result.contextSaved) {
            // For context files, trigger a page refresh to reload context files
            // Don't add to session state as it will be loaded via context refresh
            console.log(`[UPLOAD] Context file saved: ${result.fileName}`)
            // Trigger a window event to notify the parent to refresh context
            window.dispatchEvent(new CustomEvent('contextFileUploaded', { 
              detail: { fileName: result.fileName } 
            }))
          } else {
            // For session files, add directly to the file list
            const newFile: UploadedFile = {
              id: `${Date.now()}-${Math.random()}-${i}`,
              name: result.fileName,
              size: result.fileSize,
              type: result.fileType,
              content: result.extractedText || '',
              uploadedAt: new Date(),
              persistent: false
            }
            console.log(`[UPLOAD] Session file uploaded: ${newFile.name}, ID: ${newFile.id}`)
            
            // Use callback to add to existing files
            onFilesChange((prevFiles: UploadedFile[]) => {
              console.log(`[UPLOAD] Adding session file to ${prevFiles.length} existing files`)
              const updatedFiles = [...prevFiles, newFile]
              console.log(`[UPLOAD] Updated files count: ${updatedFiles.length}`)
              return updatedFiles
            })
          }
        }
      }
    } catch (error) {
      console.error('Error uploading files:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setUploadError(errorMessage)
      setUploadProgress(null) // Clear progress on error
    } finally {
      setIsUploading(false)
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleRemove = (fileId: string) => {
    if (typeof removeFile === 'function') {
      removeFile(fileId)
    } else {
      onFilesChange(files.filter(file => file.id !== fileId))
    }
  }

  const getFileContext = () => {
    if (files.length === 0) return ""
    
    const contextParts = files.map(file => {
      return `File: ${file.name}\nType: ${file.type}\nSize: ${formatFileSize(file.size)}\nContent:\n${file.content}\n---`
    })
    
    return `\n\nContext from uploaded files:\n${contextParts.join('\n')}`
  }

  return (
    <div className="space-y-3">
      {/* Context Mode Selector */}
      <div className="flex items-center space-x-4 mb-2">
        <label className="text-xs font-medium">Upload mode:</label>
        <RadioGroup value={contextMode} onValueChange={(value) => setContextMode(value as 'session' | 'context')} className="flex flex-row space-x-2">
          <label className="flex items-center space-x-1 text-xs">
            <input type="radio" value="session" checked={contextMode === 'session'} onChange={() => setContextMode('session')} />
            <span>Session only</span>
          </label>
          <label className="flex items-center space-x-1 text-xs">
            <input type="radio" value="context" checked={contextMode === 'context'} onChange={() => setContextMode('context')} />
            <span>Save as context</span>
          </label>
        </RadioGroup>
      </div>
      {/* Error Display */}
      {uploadError && uploadError.trim() && (
        <Card className="p-3 border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <div className="flex items-start space-x-2">
            <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
                Errore durante il caricamento
              </h4>
              <pre className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap font-mono">
                {uploadError}
              </pre>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUploadError(null)}
              className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* Upload Progress Display */}
      {uploadProgress && (
        <Card className="p-3 border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
          <div className="flex items-start space-x-2">
            <div className="w-4 h-4 mt-0.5 flex-shrink-0">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
                Elaborazione: {uploadProgress.fileName}
              </h4>
              <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                {uploadProgress.status}
              </p>
              {uploadProgress.totalPages > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-blue-600 dark:text-blue-400">
                    <span>Pagina {uploadProgress.currentPage} di {uploadProgress.totalPages}</span>
                    <span>{Math.round((uploadProgress.currentPage / uploadProgress.totalPages) * 100)}%</span>
                  </div>
                  <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${Math.max(5, (uploadProgress.currentPage / uploadProgress.totalPages) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* File Upload Button */}
      <div className="flex items-center space-x-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          className="flex items-center space-x-2"
        >
          <FileText className="w-4 h-4" />
          <span>{isUploading ? 'Uploading...' : 'Upload Files'}</span>
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.json,.js,.ts,.jsx,.tsx,.py,.html,.css,.xml,.csv,.log,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={handleFileSelect}
          className="hidden"
        />
        {files.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {files.length} file{files.length !== 1 ? 's' : ''} uploaded
          </Badge>
        )}
      </div>

      {/* Supported File Types Info */}
      <div className="text-xs text-gray-500 dark:text-gray-400">
        <p>Supported formats: PDF, DOC/DOCX, XLS/XLSX, TXT, MD, JSON, JS, TS, HTML, CSS, XML, CSV, LOG</p>
        <p>Maximum file size: 50MB per file</p>
      </div>

      {/* Uploaded Files List (add icon color logic) */}
      {files.length > 0 && (
        <div className="mt-2">
          {files.map(file => (
            <div key={file.id} className="flex items-center space-x-2 mb-1">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded ${file.persistent ? 'bg-blue-500' : 'bg-gray-400'}`}>{getFileIcon(file.type, file.name)}</span>
              <span className="truncate text-xs font-medium" title={file.name}>{file.name}</span>
              <span className="text-xs text-gray-500">({formatFileSize(file.size)})</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { console.log('[REMOVE FILE] Clicked', file); handleRemove(file.id); }}
                className="h-5 w-5 p-0 text-gray-400 hover:text-red-500"
                title="Remove file"
              >
                <X className="w-4 h-4" />
              </Button>
              {file.persistent && <span className="text-xs text-blue-600 ml-1">context</span>}
            </div>
          ))}
        </div>
      )}

      {/* Hidden context getter */}
      <div className="hidden">
        {getFileContext()}
      </div>
    </div>
  )
} 