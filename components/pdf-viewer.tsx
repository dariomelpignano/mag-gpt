'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FileText, Download, Copy } from 'lucide-react'

interface PDFViewerProps {
  file: File
  onTextExtracted: (text: string) => void
}

// Dynamic import to avoid SSR issues
const PDFViewer = ({ file, onTextExtracted }: PDFViewerProps) => {
  const [isLoading, setIsLoading] = useState(false)
  const [extractedText, setExtractedText] = useState('')

  const handleExtractText = async () => {
    setIsLoading(true)
    try {
      // For now, we'll provide guidance instead of actual extraction
      const guidance = `PDF: ${file.name}\n\nTo extract text from this PDF:\n1. Open the PDF in your browser or PDF reader\n2. Select all text (Cmd/Ctrl + A)\n3. Copy the text (Cmd/Ctrl + C)\n4. Paste it into a .txt file and upload that instead\n\nThis ensures the AI can properly analyze the content.`
      
      setExtractedText(guidance)
      onTextExtracted(guidance)
    } catch (error) {
      console.error('Error extracting text:', error)
      setExtractedText('Error extracting text from PDF. Please copy and paste the content manually.')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(extractedText)
      alert('Text copied to clipboard!')
    } catch (error) {
      console.error('Error copying to clipboard:', error)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center space-x-2 mb-4">
        <FileText className="w-5 h-5 text-red-500" />
        <span className="font-medium">{file.name}</span>
      </div>
      
      <div className="space-y-3">
        <Button 
          onClick={handleExtractText} 
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? 'Processing...' : 'Get PDF Analysis Instructions'}
        </Button>
        
        {extractedText && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Instructions:</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={copyToClipboard}
                className="flex items-center space-x-1"
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </Button>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-sm whitespace-pre-wrap">
              {extractedText}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

export default PDFViewer 