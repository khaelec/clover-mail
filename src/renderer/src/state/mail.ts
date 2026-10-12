import { create } from 'zustand'
import { JUNK_FOLDER_ID } from '@shared/mail'
import type {
  AccountSummary,
  ComposeInput,
  CreateAccountInput,
  FolderSummary,
  MessageDetail,
  MessageSummary
} from '@shared/mail'

interface MailState {
  accounts: AccountSummary[]
  activeAccountId: string | null
  folders: FolderSummary[]
  activeFolderId: string | null
  messages: MessageSummary[]
  searchQuery: string
  searchResults: MessageSummary[] | null
  selectedMessageId: string | null
  detail: MessageDetail | null
  loadingMessages: boolean
  syncing: boolean
  status: string | null
  error: string | null
  spamCount: number

  init: () => Promise<void>
  refreshAccounts: () => Promise<void>
  selectAccount: (id: string) => Promise<void>
  selectFolder: (id: string) => Promise<void>
  selectMessage: (id: string) => Promise<void>
  sync: () => Promise<void>
  search: (query: string) => Promise<void>
  clearSearch: () => void
  toggleRead: (message: MessageSummary) => Promise<void>
  toggleFlag: (message: MessageSummary) => Promise<void>
  move: (messageId: string, targetFolderId: string) => Promise<void>
  remove: (messageId: string) => Promise<void>
  send: (input: ComposeInput) => Promise<void>
  createAccount: (input: CreateAccountInput) => Promise<AccountSummary>
  deleteAccount: (id: string) => Promise<void>
  markSpam: (messageId: string) => Promise<void>
  markNotSpam: (messageId: string) => Promise<void>
  blockSender: (email: string) => Promise<void>
  allowSender: (email: string) => Promise<void>
}

function patchMessage(list: MessageSummary[], id: string, patch: Partial<MessageSummary>): MessageSummary[] {
  return list.map((m) => (m.id === id ? { ...m, ...patch } : m))
}

export const useMail = create<MailState>((set, get) => {
  async function reloadFolder(): Promise<void> {
    const folderId = get().activeFolderId
    const accountId = get().activeAccountId
    if (!folderId || !accountId) return
    set({ loadingMessages: true })
    const messages =
      folderId === JUNK_FOLDER_ID
        ? await window.clover.mail.listJunk(accountId)
        : await window.clover.mail.listMessages(folderId)
    set({ messages, loadingMessages: false })
  }

  async function reloadFolders(): Promise<void> {
    const accountId = get().activeAccountId
    if (!accountId) return
    const [folders, spamCount] = await Promise.all([
      window.clover.mail.listFolders(accountId),
      window.clover.mail.spamCount(accountId)
    ])
    set({ folders, spamCount })
  }

  return {
    accounts: [],
    activeAccountId: null,
    folders: [],
    activeFolderId: null,
    messages: [],
    searchQuery: '',
    searchResults: null,
    selectedMessageId: null,
    detail: null,
    loadingMessages: false,
    syncing: false,
    status: null,
    error: null,
    spamCount: 0,

    init: async () => {
      window.clover.mail.onEvent((event) => {
        if (event.type === 'sync:folder') {
          set({ status: `Scanning ${event.folderName ?? ''}…` })
        } else if (event.type === 'sync:progress') {
          set({
            status: `${event.folderName ?? ''}: +${event.fetched ?? 0}`
          })
        } else if (event.type === 'sync:error') {
          set({ status: `Sync error: ${event.error}` })
        } else if (event.type === 'sync:done') {
          set({ syncing: false, status: null })
          void reloadFolders()
          void reloadFolder()
        }
      })

      await get().refreshAccounts()
      const first = get().accounts[0]
      if (first) await get().selectAccount(first.id)
    },

    refreshAccounts: async () => {
      const accounts = await window.clover.mail.listAccounts()
      set({ accounts })
    },

    selectAccount: async (id) => {
      set({ activeAccountId: id, searchResults: null, searchQuery: '' })
      const folders = await window.clover.mail.listFolders(id)
      set({ folders })
      const inbox = folders.find((f) => f.specialUse === 'inbox') ?? folders[0]
      if (inbox) await get().selectFolder(inbox.id)
      else set({ activeFolderId: null, messages: [] })
    },

    selectFolder: async (id) => {
      set({ activeFolderId: id, selectedMessageId: null, detail: null, searchResults: null, searchQuery: '' })
      await reloadFolder()
    },

    selectMessage: async (id) => {
      set({ selectedMessageId: id, detail: null })
      const detail = await window.clover.mail.getMessage(id)
      set({ detail })
      if (detail && !detail.isRead) {
        set({ messages: patchMessage(get().messages, id, { isRead: true }) })
      }
    },

    sync: async () => {
      const accountId = get().activeAccountId
      if (!accountId) return
      set({ syncing: true, status: 'Connecting…', error: null })
      try {
        await window.clover.mail.syncAccount(accountId)
      } catch (error) {
        set({ syncing: false, error: (error as Error).message, status: null })
      }
    },

    search: async (query) => {
      const trimmed = query.trim()
      if (!trimmed) {
        get().clearSearch()
        return
      }
      set({ searchQuery: query })
      const accountId = get().activeAccountId ?? undefined
      const searchResults = await window.clover.mail.search(trimmed, accountId)
      set({ searchResults })
    },

    clearSearch: () => set({ searchQuery: '', searchResults: null }),

    toggleRead: async (message) => {
      await window.clover.mail.setFlags(message.id, { seen: !message.isRead })
      const patch = { isRead: !message.isRead }
      set({
        messages: patchMessage(get().messages, message.id, patch),
        searchResults: get().searchResults
          ? patchMessage(get().searchResults as MessageSummary[], message.id, patch)
          : null,
        detail:
          get().detail?.id === message.id ? { ...(get().detail as MessageDetail), ...patch } : get().detail
      })
    },

    toggleFlag: async (message) => {
      await window.clover.mail.setFlags(message.id, { flagged: !message.isFlagged })
      const patch = { isFlagged: !message.isFlagged }
      set({
        messages: patchMessage(get().messages, message.id, patch),
        searchResults: get().searchResults
          ? patchMessage(get().searchResults as MessageSummary[], message.id, patch)
          : null
      })
    },

    move: async (messageId, targetFolderId) => {
      await window.clover.mail.moveMessage(messageId, targetFolderId)
      set({
        messages: get().messages.filter((m) => m.id !== messageId),
        searchResults: get().searchResults?.filter((m) => m.id !== messageId) ?? null,
        selectedMessageId: get().selectedMessageId === messageId ? null : get().selectedMessageId,
        detail: get().detail?.id === messageId ? null : get().detail
      })
      void reloadFolders()
    },

    remove: async (messageId) => {
      await window.clover.mail.deleteMessage(messageId)
      set({
        messages: get().messages.filter((m) => m.id !== messageId),
        searchResults: get().searchResults?.filter((m) => m.id !== messageId) ?? null,
        selectedMessageId: get().selectedMessageId === messageId ? null : get().selectedMessageId,
        detail: get().detail?.id === messageId ? null : get().detail
      })
      void reloadFolders()
    },

    send: async (input) => {
      await window.clover.mail.sendMessage(input)
    },

    createAccount: async (input) => {
      const account = await window.clover.mail.createAccount(input)
      await get().refreshAccounts()
      await get().selectAccount(account.id)
      return account
    },

    markSpam: async (messageId) => {
      await window.clover.mail.markSpam(messageId)
      await reloadFolders()
      await reloadFolder()
      if (get().detail?.id === messageId) set({ detail: null, selectedMessageId: null })
    },

    markNotSpam: async (messageId) => {
      await window.clover.mail.markNotSpam(messageId)
      await reloadFolders()
      await reloadFolder()
      if (get().detail?.id === messageId) set({ detail: null, selectedMessageId: null })
    },

    blockSender: async (email) => {
      const accountId = get().activeAccountId
      if (!accountId || !email) return
      await window.clover.mail.blockSender(accountId, email)
      await reloadFolders()
      await reloadFolder()
    },

    allowSender: async (email) => {
      const accountId = get().activeAccountId
      if (!accountId || !email) return
      await window.clover.mail.allowSender(accountId, email)
      await reloadFolders()
      await reloadFolder()
    },

    deleteAccount: async (id) => {
      await window.clover.mail.deleteAccount(id)
      await get().refreshAccounts()
      const next = get().accounts[0]
      if (next) await get().selectAccount(next.id)
      else set({ activeAccountId: null, folders: [], messages: [], detail: null })
    }
  }
})
