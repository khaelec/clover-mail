import { useEffect, useState, type ReactNode } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar, type SectionId } from './components/Sidebar'
import { MailView } from './components/MailView'
import { AppsView } from './components/AppsView'
import { CalendarView } from './components/CalendarView'
import { CopilotView } from './components/CopilotView'
import { WallpaperView } from './components/WallpaperView'
import { WallpaperLayer } from './components/WallpaperLayer'
import { UpdateBanner } from './components/UpdateBanner'
import { SettingsView } from './components/SettingsView'
import { PlaceholderView } from './components/PlaceholderView'
import { IconCalendar, IconGrid, IconSparkles, IconWallpaper } from './components/icons'
import { useMail } from './state/mail'
import { useWallpaper } from './state/wallpaper'
import { useUpdate } from './state/update'

/**
 * Placeholder background layer. In Phase 3 this becomes the real live-wallpaper
 * surface (video / HTML / Wallpaper Engine). Kept deliberately subtle for now.
 */
function BackgroundLayer(): ReactNode {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-24 -top-40 h-[440px] w-[440px] rounded-full bg-accent/10 blur-3xl" />
      <div className="absolute -bottom-40 right-0 h-[400px] w-[400px] rounded-full bg-accent/[0.06] blur-3xl" />
    </div>
  )
}

function renderSection(section: SectionId): ReactNode {
  switch (section) {
    case 'mail':
      return <MailView />
    case 'settings':
      return <SettingsView />
    case 'calendar':
      return <CalendarView />
    case 'apps':
      return <AppsView />
    case 'wallpaper':
      return <WallpaperView />
    case 'copilot':
      return <CopilotView />
    default:
      return null
  }
}

export function App(): ReactNode {
  const [section, setSection] = useState<SectionId>('mail')

  useEffect(() => {
    void useMail.getState().init()
    void useWallpaper.getState().load()
    useUpdate.getState().init()
  }, [])

  useEffect(() => {
    const handler = (): void => setSection('copilot')
    window.addEventListener('clover:open-copilot', handler)
    return () => window.removeEventListener('clover:open-copilot', handler)
  }, [])

  useEffect(() => {
    const handler = (): void => setSection('calendar')
    window.addEventListener('clover:open-calendar', handler)
    return () => window.removeEventListener('clover:open-calendar', handler)
  }, [])

  useEffect(() => {
    return window.clover.onNavigate((target) => {
      if (target === 'calendar' || target === 'mail' || target === 'copilot' || target === 'apps') {
        setSection(target)
      }
    })
  }, [])

  return (
    <div className="flex h-full flex-col bg-canvas text-ink">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar active={section} onSelect={setSection} />
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <WallpaperLayer />
          <BackgroundLayer />
          <div className="relative h-full">{renderSection(section)}</div>
        </main>
      </div>
      <UpdateBanner />
    </div>
  )
}
