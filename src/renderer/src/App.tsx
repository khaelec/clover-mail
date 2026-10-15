import { useEffect, useState, type ReactNode } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar, type SectionId } from './components/Sidebar'
import { MailView } from './components/MailView'
import { AppsView } from './components/AppsView'
import { CalendarView } from './components/CalendarView'
import { CopilotView } from './components/CopilotView'
import { WallpaperView } from './components/WallpaperView'
import { WallpaperLayer } from './components/WallpaperLayer'
import { AppHost } from './components/AppHost'
import { UpdateBanner } from './components/UpdateBanner'
import { Toaster } from './components/Toaster'
import { SettingsView } from './components/SettingsView'
import { PlaceholderView } from './components/PlaceholderView'
import { IconCalendar, IconGrid, IconSparkles, IconWallpaper } from './components/icons'
import { useMail } from './state/mail'
import { useApps } from './state/apps'
import { useWallpaper } from './state/wallpaper'
import { useUpdate } from './state/update'
import { applyUnreadBadge } from './lib/badge'

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
  const mailUnread = useMail((s) => s.unreadTotal)
  const appUnread = useApps((s) => s.appUnreadTotal)

  useEffect(() => {
    void useMail.getState().init()
    void useWallpaper.getState().load()
    useUpdate.getState().init()
  }, [])

  // Combined unread (mail + embedded apps) drives the tray tooltip and taskbar badge.
  useEffect(() => {
    applyUnreadBadge(mailUnread + appUnread)
  }, [mailUnread, appUnread])

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
    const handler = (): void => setSection('settings')
    window.addEventListener('clover:open-settings', handler)
    return () => window.removeEventListener('clover:open-settings', handler)
  }, [])

  // Bell items (reminders, update notices, …) carry a section to open.
  useEffect(() => {
    const handler = (event: Event): void => {
      const target = (event as CustomEvent<{ section?: SectionId }>).detail?.section
      if (
        target === 'mail' ||
        target === 'calendar' ||
        target === 'settings' ||
        target === 'apps' ||
        target === 'copilot' ||
        target === 'wallpaper'
      ) {
        setSection(target)
      }
    }
    window.addEventListener('clover:navigate', handler)
    return () => window.removeEventListener('clover:navigate', handler)
  }, [])

  // Opening a notification from an app jumps to the Apps view and selects it.
  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (event as CustomEvent<{ appId?: string }>).detail
      if (detail?.appId) {
        useApps.getState().select(detail.appId)
        setSection('apps')
      }
    }
    window.addEventListener('clover:open-app', handler)
    return () => window.removeEventListener('clover:open-app', handler)
  }, [])

  // Opening a notification jumps to Mail and focuses the message it refers to.
  useEffect(() => {
    const handler = (event: Event): void => {
      const detail = (
        event as CustomEvent<{ accountId?: string; messageId?: string; reply?: boolean }>
      ).detail
      if (!detail?.messageId) return
      setSection('mail')
      void (async () => {
        const mail = useMail.getState()
        if (detail.accountId && mail.activeAccountId !== detail.accountId) {
          await mail.selectAccount(detail.accountId)
        }
        await mail.selectMessage(detail.messageId as string)
        // The bell's Reply action opens the message and then starts a reply.
        if (detail.reply) window.dispatchEvent(new Event('clover:reply-now'))
      })()
    }
    window.addEventListener('clover:open-message', handler)
    return () => window.removeEventListener('clover:open-message', handler)
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
      <Toaster />
      <AppHost />
    </div>
  )
}
