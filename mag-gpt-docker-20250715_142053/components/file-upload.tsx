import React, { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { X, FileText, File, Image, FileCode, FileArchive, FileSpreadsheet, FileType } from "lucide-react"

export interface UploadedFile {
  id: string
  name: string
  size: number
  type: string
  content: string
  uploadedAt: Date
}

interface FileUploadProps {
  files: UploadedFile[]
  onFilesChange: (files: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void
  disabled?: boolean
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

export function FileUpload({ files, onFilesChange, disabled = false }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Debug log for files prop
  useEffect(() => {
    console.log('[FILE-UPLOAD] Files prop updated:', files.length, files.map(f => f.name))
  }, [files])

  const acceptedFileTypes = [
    '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.py', 
    '.html', '.css', '.xml', '.csv', '.log', '.pdf', '.doc', '.docx', '.xls', '.xlsx'
  ]

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (!selectedFiles) return

    setIsUploading(true)
    setUploadError(null) // Clear previous errors

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          
          // Se ci sono suggerimenti, mostrali nel messaggio di errore
          let errorMessage = errorData.error || 'Upload failed'
          if (errorData.suggestions && Array.isArray(errorData.suggestions)) {
            errorMessage += '\n\nSuggerimenti:\n' + errorData.suggestions.map((s: string) => `• ${s}`).join('\n')
          }
          
          throw new Error(errorMessage)
        }

        const result = await response.json()
        
        if (result.success) {
          const newFile: UploadedFile = {
            id: `${Date.now()}-${Math.random()}-${i}`,
            name: result.fileName,
            size: result.fileSize,
            type: result.fileType,
            content: result.extractedText,
            uploadedAt: new Date()
          }
          console.log(`[UPLOAD] File caricato: ${newFile.name}, ID: ${newFile.id}`)
          console.log(`[UPLOAD] File esistenti: ${files.length}, Nuovi file: ${files.length + 1}`)
          
          // Usa una funzione di callback per assicurarsi che lo stato sia aggiornato
          onFilesChange((prevFiles: UploadedFile[]) => {
            console.log(`[UPLOAD] Callback - File precedenti: ${prevFiles.length}`)
            const updatedFiles = [...prevFiles, newFile]
            console.log(`[UPLOAD] Callback - File aggiornati: ${updatedFiles.length}`)
            return updatedFiles
          })
        }
      }
    } catch (error) {
      console.error('Error uploading files:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setUploadError(errorMessage)
    } finally {
      setIsUploading(false)
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removeFile = (fileId: string) => {
    onFilesChange(files.filter(file => file.id !== fileId))
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
      {/* Error Display */}
      {uploadError && (
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

      {/* Hidden context getter */}
      <div className="hidden">
        {getFileContext()}
      </div>
    </div>
  )
} 