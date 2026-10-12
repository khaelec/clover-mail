import { useEffect, useState, type ReactNode } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar, type SectionId } from './components/Sidebar'
import { MailView } from './components/MailView'
import { AppsView } from './components/AppsView'
import { CalendarView } from './components/CalendarView'
import { SettingsView } from './components/SettingsView'
import { PlaceholderView } from './components/PlaceholderView'
import { IconCalendar, IconGrid, IconSparkles, IconWallpaper } from './components/icons'
import { useMail } from './state/mail'

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
      return (
        <PlaceholderView
          title="Live Wallpapers"
          blurb="Set a video, GIF, HTML, or Wallpaper Engine wallpaper as your app background."
          icon={<IconWallpaper className="h-6 w-6" />}
          upcoming={[
            'Video (mp4/webm) and animated GIF wallpapers',
            'HTML / web wallpapers',
            'Wallpaper Engine integration (best-effort)',
            'Opacity, blur, dim, and pause-when-hidden controls'
          ]}
        />
      )
    case 'copilot':
      return (
        <PlaceholderView
          title="AI Copilot"
          blurb="Connect Claude and opencode to summarize, draft, and act on your mail — through MCP."
          icon={<IconSparkles className="h-6 w-6" />}
          upcoming={[
            'Claude chat panel with per-message actions',
            'Embedded opencode agent sessions',
            'Clover Mail MCP server (read tools by default)',
            'Consume external MCP servers'
          ]}
        />
      )
    default:
      return null
  }
}

export function App(): ReactNode {
  const [section, setSection] = useState<SectionId>('mail')

  useEffect(() => {
    void useMail.getState().init()
  }, [])

  return (
    <div className="flex h-full flex-col bg-canvas text-ink">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar active={section} onSelect={setSection} />
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <BackgroundLayer />
          <div className="relative h-full">{renderSection(section)}</div>
        </main>
      </div>
    </div>
  )
}
