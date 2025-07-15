declare module 'mammoth' {
  interface ExtractResult {
    value: string
    messages: any[]
  }

  interface Options {
    arrayBuffer: ArrayBuffer
  }

  function extractRawText(options: Options): Promise<ExtractResult>
  
  export default {
    extractRawText
  }
}

declare module 'xlsx' {
  interface WorkSheet {
    [key: string]: any
  }

  interface WorkBook {
    SheetNames: string[]
    Sheets: { [key: string]: WorkSheet }
  }

  interface Options {
    type: 'array' | 'string' | 'buffer' | 'file'
  }

  function read(data: ArrayBuffer, options: Options): WorkBook
  
  const utils: {
    sheet_to_json: (worksheet: WorkSheet, options?: { header?: number }) => any[][]
  }

  const defaultExport: {
    read: typeof read
    utils: typeof utils
  }

  export default defaultExport
} 