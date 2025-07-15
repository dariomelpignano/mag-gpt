import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Terminal, Download, Play } from "lucide-react"

export function SetupInstructions() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Setup Instructions</h1>
        <p className="text-gray-600 dark:text-gray-400">Get your MAG-GPT running in minutes</p>
      </div>

      <div className="grid gap-6 md:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Download className="w-5 h-5" />
              <span>1. Install Ollama</span>
            </CardTitle>
            <CardDescription>Download and install Ollama on your system</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
              <p className="text-sm mb-2">Visit the official website:</p>
              <Badge variant="secondary">https://ollama.ai</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Terminal className="w-5 h-5" />
              <span>2. Install a Model</span>
            </CardTitle>
            <CardDescription>Download a language model to use with the chat</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg font-mono text-sm">
              <p className="mb-2"># Install Llama 3.2 (recommended)</p>
              <p className="text-blue-600 dark:text-blue-400">ollama pull llama3.2</p>

              <p className="mt-4 mb-2"># Or install other models:</p>
              <p className="text-blue-600 dark:text-blue-400">ollama pull llama3.2:1b # Smaller, faster</p>
              <p className="text-blue-600 dark:text-blue-400">ollama pull codellama # For coding</p>
              <p className="text-blue-600 dark:text-blue-400">ollama pull mistral # Alternative model</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Play className="w-5 h-5" />
              <span>3. Start Ollama Server</span>
            </CardTitle>
            <CardDescription>Make sure Ollama is running before using the chat</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg font-mono text-sm">
              <p className="mb-2"># Start the Ollama server</p>
              <p className="text-blue-600 dark:text-blue-400">ollama serve</p>

              <p className="mt-4 mb-2"># Verify it's working</p>
              <p className="text-blue-600 dark:text-blue-400">curl http://localhost:11434</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Install Dependencies</CardTitle>
            <CardDescription>Install the required npm packages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg font-mono text-sm">
              <p className="text-blue-600 dark:text-blue-400">npm install ai @ai-sdk/react ollama-ai-provider</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Once everything is set up, you can start chatting with MAG-GPT!
        </p>
      </div>
    </div>
  )
}
