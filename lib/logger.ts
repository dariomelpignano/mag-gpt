import { appendFile, mkdir } from 'fs/promises'
import { dirname } from 'path'

const LOG_PATH = 'logs/interactions.log'

export async function logInteraction({ user, action, data }: { user: string, action: string, data: any }) {
  const timestamp = new Date().toISOString()
  const logEntry = JSON.stringify({ timestamp, user, action, data }) + '\n'
  try {
    // Ensure log directory exists
    await mkdir(dirname(LOG_PATH), { recursive: true })
    await appendFile(LOG_PATH, logEntry, 'utf8')
  } catch (err) {
    // Fallback to console if file logging fails
    console.error('[LOGGER] Failed to write log:', err, logEntry)
  }
} 