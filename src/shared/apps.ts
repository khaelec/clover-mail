export interface CustomApp {
  id: string
  name: string
  url: string
  iconDataUrl: string | null
  windowMode: 'inline' | 'window'
  isPinned: boolean
  sortOrder: number
}

export interface CreateAppInput {
  url: string
  name?: string
}
