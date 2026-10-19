// Clover's new-mail chime: two soft bell tones, synthesized (no audio file).

let ctx: AudioContext | null = null
let lastPlayed = 0

export function playChime(): void {
  // A burst of new mail plays one chime, not a drumroll.
  if (Date.now() - lastPlayed < 2000) return
  lastPlayed = Date.now()
  try {
    ctx = ctx ?? new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const start = ctx.currentTime + 0.02
    for (const [freq, at] of [
      [880, 0],
      [1318.5, 0.13]
    ] as const) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, start + at)
      gain.gain.linearRampToValueAtTime(0.18, start + at + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.9)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start + at)
      osc.stop(start + at + 0.95)
    }
  } catch {
    // No audio device: stay silent.
  }
}
