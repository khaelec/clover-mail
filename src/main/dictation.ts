import { spawn, type ChildProcess } from 'node:child_process'

export interface DictationEvent {
  type: 'ready' | 'partial' | 'result' | 'error'
  text?: string
}

// Uses the Windows offline speech engine (System.Speech) via PowerShell — no model
// to download and no audio leaves the machine.
const SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
try {
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  $engine.SetInputToDefaultAudioDevice()
  $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $engine.add_SpeechHypothesized({ param($sender, $args) [Console]::WriteLine("PARTIAL|" + $args.Result.Text); [Console]::Out.Flush() })
  $engine.add_SpeechRecognized({ param($sender, $args) [Console]::WriteLine("RESULT|" + $args.Result.Text); [Console]::Out.Flush() })
  $engine.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple)
  [Console]::WriteLine("READY")
  [Console]::Out.Flush()
  while ($true) { Start-Sleep -Milliseconds 200 }
} catch {
  [Console]::WriteLine("ERROR|" + $_.Exception.Message)
  [Console]::Out.Flush()
  exit 1
}
`

let child: ChildProcess | null = null
let emit: (event: DictationEvent) => void = () => {}

export function setDictationEmitter(fn: (event: DictationEvent) => void): void {
  emit = fn
}

export function dictationSupported(): boolean {
  return process.platform === 'win32'
}

function handleLine(line: string): void {
  if (!line) return
  const separator = line.indexOf('|')
  const tag = separator >= 0 ? line.slice(0, separator) : line
  const text = separator >= 0 ? line.slice(separator + 1) : ''
  if (tag === 'READY') emit({ type: 'ready' })
  else if (tag === 'PARTIAL') emit({ type: 'partial', text })
  else if (tag === 'RESULT') emit({ type: 'result', text })
  else if (tag === 'ERROR') emit({ type: 'error', text })
}

export function startDictation(): { ok: boolean; error?: string } {
  if (!dictationSupported()) {
    return { ok: false, error: 'Dictation uses the Windows speech engine and is only available on Windows.' }
  }
  stopDictation()
  try {
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64')
    const proc = spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    )
    child = proc
    let buffer = ''
    proc.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString()
      let index: number
      while ((index = buffer.indexOf('\n')) >= 0) {
        handleLine(buffer.slice(0, index).replace(/\r$/, ''))
        buffer = buffer.slice(index + 1)
      }
    })
    proc.on('error', (error) => {
      if (child === proc) child = null
      emit({ type: 'error', text: error.message })
    })
    proc.on('close', () => {
      if (child === proc) child = null
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

export function stopDictation(): void {
  if (child) {
    try {
      child.kill()
    } catch {
      // ignore
    }
    child = null
  }
}
