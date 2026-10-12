import { useEffect, useRef, useState, type ReactNode } from 'react'
import { mediaUrl } from '@shared/wallpaper'
import { useWallpaper } from '../state/wallpaper'

export function WallpaperLayer(): ReactNode {
  const settings = useWallpaper((s) => s.settings)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [slideIndex, setSlideIndex] = useState(0)

  const sources = settings.kind === 'slideshow' ? settings.sources : []
  const currentSlide = sources.length > 0 ? sources[slideIndex % sources.length] : ''

  useEffect(() => {
    const update = (): void => {
      const video = videoRef.current
      if (!video) return
      if (settings.pauseWhenHidden && document.hidden) video.pause()
      else void video.play().catch(() => undefined)
    }
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [settings.pauseWhenHidden, settings.kind, settings.source])

  useEffect(() => {
    if (settings.kind !== 'slideshow' || sources.length < 2) return
    const id = setInterval(() => {
      if (settings.pauseWhenHidden && document.hidden) return
      setSlideIndex((i) => i + 1)
    }, settings.slideshowIntervalMs)
    return () => clearInterval(id)
  }, [settings.kind, sources.length, settings.slideshowIntervalMs, settings.pauseWhenHidden])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.innerHTML = ''
    if (settings.kind === 'html' || settings.kind === 'wallpaper-engine') {
      const src = settings.sourceUrl || (settings.source ? mediaUrl(settings.source) : '')
      if (src) {
        const webview = document.createElement('webview')
        webview.setAttribute('src', src)
        webview.setAttribute('partition', 'persist:wallpaper')
        webview.style.width = '100%'
        webview.style.height = '100%'
        host.appendChild(webview)
      }
    }
    return () => {
      host.innerHTML = ''
    }
  }, [settings.kind, settings.source, settings.sourceUrl])

  if (settings.kind === 'none') return null

  const objectFit = settings.fit === 'tile' ? 'none' : settings.fit
  const filter = `blur(${settings.blur}px)`

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {settings.kind === 'video' && settings.source && (
        <video
          ref={videoRef}
          src={mediaUrl(settings.source)}
          autoPlay
          loop
          muted={settings.muted}
          playsInline
          className="h-full w-full"
          style={{ objectFit, filter, opacity: settings.opacity }}
        />
      )}
      {(settings.kind === 'image' || settings.kind === 'gif') && settings.source && (
        <img
          src={mediaUrl(settings.source)}
          className="h-full w-full"
          style={{ objectFit, filter, opacity: settings.opacity }}
        />
      )}
      {settings.kind === 'slideshow' && currentSlide && (
        <img
          src={mediaUrl(currentSlide)}
          className="h-full w-full"
          style={{ objectFit, filter, opacity: settings.opacity }}
        />
      )}
      {(settings.kind === 'html' || settings.kind === 'wallpaper-engine') && (
        <div ref={hostRef} className="h-full w-full" style={{ filter, opacity: settings.opacity }} />
      )}
      <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${settings.dim})` }} />
    </div>
  )
}
