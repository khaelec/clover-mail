import { createContext, useContext } from 'react'
import type { SettingsScope } from './useSettingsState'

export const SettingsContext = createContext<SettingsScope | null>(null)

export function useSettings(): SettingsScope {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings must be used within SettingsView')
  return value
}
