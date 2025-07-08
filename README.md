# MAG-GPT - Local AI Chat with File Upload

A ChatGPT-like interface powered by Ollama that runs completely locally on your machine, with advanced file upload capabilities for document analysis.

## Features

### 🤖 AI Chat
- Real-time conversations with local AI models
- Powered by Ollama (privacy-focused, offline operation)
- Stream-based responses for smooth interaction
- Copy AI responses with one click
- Clear chat history

### 📁 File Upload & Analysis
- **PDF Files**: Extract and analyze text content from PDFs
- **DOC/DOCX Files**: Read and analyze Microsoft Word documents
- **XLS/XLSX Files**: Analyze spreadsheet data and identify patterns
- **TXT Files**: Process plain text files
- **MD Files**: Analyze Markdown documents with formatting
- **Code Files**: JavaScript, TypeScript, Python, HTML, CSS, etc.
- **Data Files**: JSON, XML, CSV, LOG files
- **Multiple Files**: Upload and analyze multiple files simultaneously

### 🎨 Modern UI
- Clean, responsive design
- Dark/light mode support
- File type icons and metadata display
- File content preview and management
- Mobile-friendly interface

## Setup

### Prerequisites
- Node.js 18+ and npm
- Ollama installed and running

### Installation

1. **Install Ollama**
   ```bash
   # macOS
   brew install ollama
   
   # Linux
   curl -fsSL https://ollama.ai/install.sh | sh
   ```

2. **Start Ollama Service**
   ```bash
   brew services start ollama  # macOS
   # or
   ollama serve  # Linux
   ```

3. **Download AI Model**
   ```bash
   ollama pull llama3.2
   ```

4. **Install Dependencies**
   ```bash
   npm install --legacy-peer-deps
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

6. **Open Application**
   Navigate to `http://localhost:3000`

## File Upload Guide

### Supported File Types
- **Documents**: PDF, DOC, DOCX
- **Spreadsheets**: XLS, XLSX
- **Text Files**: TXT, MD, JSON, XML, CSV, LOG
- **Code Files**: JS, TS, JSX, TSX, PY, HTML, CSS
- **Maximum Size**: 10MB per file

### How to Use File Upload

1. **Click the Paperclip Icon** in the chat input area
2. **Select Files** from your computer
3. **Review Uploaded Files** - see file info and content length
4. **Ask Questions** about the uploaded files
5. **Remove Files** by clicking the X button if needed

### Example Questions
- "What is this document about?"
- "Analyze the data in this spreadsheet"
- "Explain the code structure in this file"
- "What are the main points in this PDF?"
- "Compare the content of these two files"

## Technical Details

### Architecture
- **Frontend**: Next.js 15, React 19, TypeScript
- **UI Components**: Radix UI + Tailwind CSS (shadcn/ui)
- **AI Integration**: Vercel AI SDK + Ollama AI Provider
- **File Processing**: pdf-parse, mammoth, xlsx libraries

### File Processing
- **PDF**: Text extraction using pdf-parse
- **DOC/DOCX**: Text extraction using mammoth
- **XLS/XLSX**: Data extraction using xlsx library
- **Text Files**: Direct text reading
- **Content Analysis**: AI analyzes extracted content

### Privacy
- All processing happens locally on your machine
- No data sent to external servers
- File content stays on your device
- Ollama runs completely offline

## Development

### Project Structure
```
mag-gpt/
├── app/
│   ├── api/chat/route.ts    # AI chat API
│   ├── page.tsx             # Main chat interface
│   └── layout.tsx           # App layout
├── components/
│   ├── file-upload.tsx      # File upload component
│   └── ui/                  # UI components
├── types/
│   └── global.d.ts          # TypeScript declarations
└── sample files/            # Test files for demonstration
```

### Available Scripts
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Troubleshooting

### Common Issues

1. **Ollama Not Running**
   ```bash
   brew services restart ollama
   # or
   ollama serve
   ```

2. **Model Not Found**
   ```bash
   ollama pull llama3.2
   ```

3. **File Upload Errors**
   - Check file size (max 10MB)
   - Ensure file type is supported
   - Try smaller files first

4. **Dependency Issues**
   ```bash
   npm install --legacy-peer-deps
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Check the troubleshooting section
- Review Ollama documentation
- Open an issue on GitHub

---

**MAG-GPT** - Your local AI assistant with powerful file analysis capabilities! 🚀 