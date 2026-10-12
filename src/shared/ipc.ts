import { z } from 'zod'

export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  electron: z.string(),
  chrome: z.string(),
  node: z.string(),
  platform: z.string(),
  userDataPath: z.string()
})
export type AppInfo = z.infer<typeof AppInfoSchema>

export const SettingsRecordSchema = z.record(z.string(), z.unknown())
export type SettingsRecord = z.infer<typeof SettingsRecordSchema>

export interface CloverApi {
  appInfo: () => Promise<AppInfo>
  settings: {
    getAll: () => Promise<SettingsRecord>
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    delete: (key: string) => Promise<void>
  }
  window: {
    minimize: () => void
    toggleMaximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onMaximizedChanged: (cb: (maximized: boolean) => void) => () => void
  }
}
