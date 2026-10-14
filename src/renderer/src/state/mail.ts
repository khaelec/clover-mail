import { create } from 'zustand'
import { IMPORTANT_FOLDER_ID, JUNK_FOLDER_ID, OUTBOX_FOLDER_ID, UNIFIED_FOLDER_ID } from '@shared/mail'
import { SETTINGS_KEYS } from '@shared/theme'
import { useNotifications } from './notifications'
import { useToasts } from './toasts'
import { benchInstallStore } from '../bench'
import type {
  AccountSummary,
  ApplyRulesResult,
  BulkActionResult,
  BulkActionType,
  ComposeInput,
  CreateAccountInput,
  FolderSummary,
  Label,
  MessageDetail,
  MessageSummary,
  OutboxItem,
  Rule,
  RuleInput,
  SavedSearch,
  ThreadSummary
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
  conversation: MessageDetail[]
  loadMessageBody: (id: string) => Promise<void>
  refreshDetail: () => Promise<void>
  loadingMessages: boolean
  syncing: boolean
  status: string | null
  error: string | null
  spamCount: number
  importantCount: number
  unreadTotal: number
  outbox: OutboxItem[]
  loadOutbox: () => Promise<void>
  retryOutbox: (id: string) => Promise<void>
  discardOutbox: (id: string) => Promise<void>
  rules: Rule[]
  selectedIds: string[]
  threaded: boolean
  threads: ThreadSummary[]
  expandedThreadIds: string[]

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
  toggleImportant: (message: MessageSummary) => Promise<void>
  toggleSelect: (messageId: string) => void
  selectAll: () => void
  clearSelection: () => void
  bulk: (action: BulkActionType, targetFolderId?: string) => Promise<void>
  bulkIds: (ids: string[], action: BulkActionType, targetFolderId?: string) => Promise<void>
  emptyFolder: (folderId: string) => Promise<void>
  markFolderRead: (folderId: string) => Promise<void>
  syncFolder: (folderId: string) => Promise<void>
  emptyJunk: () => Promise<void>
  snooze: (messageId: string, untilMs: number) => Promise<void>
  unsnooze: (messageId: string) => Promise<void>
  muteThread: (threadId: string, muted: boolean) => Promise<void>
  pinThread: (threadId: string, pinned: boolean) => Promise<void>
  labels: Label[]
  loadLabels: () => Promise<void>
  createLabel: (name: string, color?: string) => Promise<void>
  deleteLabel: (id: string) => Promise<void>
  toggleLabel: (messageId: string, labelId: string, on: boolean) => Promise<void>
  savedSearches: SavedSearch[]
  loadSavedSearches: () => Promise<void>
  createSavedSearch: (name: string, query: string) => Promise<void>
  deleteSavedSearch: (id: string) => Promise<void>
  importMbox: () => Promise<void>
  unreadOnly: boolean
  setUnreadOnly: (value: boolean) => void
  setThreaded: (value: boolean) => Promise<void>
  toggleThread: (threadId: string) => void
  move: (messageId: string, targetFolderId: string) => Promise<void>
  remove: (messageId: string) => Promise<void>
  send: (input: ComposeInput) => Promise<void>
  createAccount: (input: CreateAccountInput) => Promise<AccountSummary>
  deleteAccount: (id: string) => Promise<void>
  markSpam: (messageId: string) => Promise<void>
  markNotSpam: (messageId: string) => Promise<void>
  blockSender: (email: string) => Promise<void>
  allowSender: (email: string) => Promise<void>
  createFolder: (name: string) => Promise<void>
  renameFolder: (folderId: string, name: string) => Promise<void>
  deleteFolder: (folderId: string) => Promise<void>
  setFolderVisible: (folderId: string, visible: boolean) => Promise<void>
  exportMbox: (folderId: string) => Promise<void>
  showHidden: boolean
  setShowHidden: (value: boolean) => void
  loadRules: () => Promise<void>
  saveRule: (input: RuleInput, ruleId?: string) => Promise<void>
  removeRule: (ruleId: string) => Promise<void>
  applyRulesNow: () => Promise<ApplyRulesResult>
}

function patchMessage(list: MessageSummary[], id: string, patch: Partial<MessageSummary>): MessageSummary[] {
  return list.map((m) => (m.id === id ? { ...m, ...patch } : m))
}

// Signature of the whole object, used to reuse the previous item for rows whose
// contents didn't change so React.memo can skip them on the frequent reloads
// (sync:done, new mail) that rebuild the list from the DB. Serialising every
// field (not a hand-picked list) means a new field — uid, threadId, accountId, or
// anything added later — can never leave a stale object behind.
function messageSignature(m: MessageSummary): string {
  return JSON.stringify(m)
}

function threadSignature(t: ThreadSummary): string {
  return JSON.stringify(t)
}

let readTimer: ReturnType<typeof setTimeout> | null = null

// The last sync error we showed a toast for, so a folder that keeps failing
// doesn't pop one every few minutes.
let lastSyncError: string | null = null

function reportSyncError(message: string | undefined): void {
  if (!message || message === lastSyncError) return
  lastSyncError = message
  useToasts.getState().push({ message: `Sync error: ${message}`, kind: 'error' })
}

export const useMail = create<MailState>((set, get) => {
  // Reuse the previous object for any row whose signature is unchanged. Without
  // this, every reload creates new objects for all rows and React.memo can never
  // skip a re-render.
  function stableThreads(next: ThreadSummary[]): ThreadSummary[] {
    const prev = get().threads
    if (prev.length === 0) return next
    const bySig = new Map(prev.map((t) => [threadSignature(t), t]))
    return next.map((t) => bySig.get(threadSignature(t)) ?? t)
  }
  function stableMessages(next: MessageSummary[]): MessageSummary[] {
    const prev = get().messages
    if (prev.length === 0) return next
    const bySig = new Map(prev.map((m) => [messageSignature(m), m]))
    return next.map((m) => bySig.get(messageSignature(m)) ?? m)
  }

  async function reloadFolder(): Promise<void> {
    const folderId = get().activeFolderId
    if (!folderId) return
    const labelId = folderId.startsWith('label:') ? folderId.slice('label:'.length) : null
    const accountId = get().activeAccountId
    if (!accountId && !labelId) return
    set({ loadingMessages: true })

    const synthetic = folderId === JUNK_FOLDER_ID || folderId === IMPORTANT_FOLDER_ID
    if (folderId === OUTBOX_FOLDER_ID) {
      const outbox = await window.clover.mail.listOutbox()
      set({ outbox, messages: [], threads: [], loadingMessages: false })
    } else if (labelId) {
      const messages = await window.clover.mail.listLabelMessages(labelId)
      set({ messages: stableMessages(messages), threads: [], loadingMessages: false })
    } else if (folderId === UNIFIED_FOLDER_ID) {
      if (get().threaded) {
        const threads = await window.clover.mail.listUnifiedThreads()
        set({ threads: stableThreads(threads), messages: [], loadingMessages: false })
      } else {
        const messages = await window.clover.mail.listUnifiedMessages()
        set({ messages: stableMessages(messages), threads: [], loadingMessages: false })
      }
    } else if (synthetic && accountId) {
      const messages =
        folderId === JUNK_FOLDER_ID
          ? await window.clover.mail.listJunk(accountId)
          : await window.clover.mail.listImportant(accountId)
      set({ messages: stableMessages(messages), threads: [], loadingMessages: false })
    } else if (get().threaded && get().folders.find((f) => f.id === folderId)?.specialUse !== 'drafts') {
      const threads = await window.clover.mail.listThreads(folderId)
      set({ threads: stableThreads(threads), messages: [], loadingMessages: false })
    } else {
      const messages = await window.clover.mail.listMessages(folderId)
      set({ messages: stableMessages(messages), threads: [], loadingMessages: false })
    }
  }

  async function reloadFolders(): Promise<void> {
    const accountId = get().activeAccountId
    if (!accountId) return
    const [folders, spamCount, importantCount] = await Promise.all([
      window.clover.mail.listFolders(accountId),
      window.clover.mail.spamCount(accountId),
      window.clover.mail.importantCount(accountId)
    ])
    set({ folders, spamCount, importantCount })
    const totalUnread = folders.reduce((sum, folder) => sum + folder.unreadCount, 0)
    set({ unreadTotal: totalUnread })
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
    conversation: [],
    loadingMessages: false,
    syncing: false,
    status: null,
    error: null,
    spamCount: 0,
    importantCount: 0,
    unreadTotal: 0,
    outbox: [],
    rules: [],
    selectedIds: [],
    threaded: true,
    threads: [],
    expandedThreadIds: [],
    unreadOnly: false,
    showHidden: false,
    labels: [],
    savedSearches: [],

    init: async () => {
      window.clover.mail.onEvent((event) => {        if (event.type === 'sync:folder') {
          set({ status: `Scanning ${event.folderName ?? ''}…` })
        } else if (event.type === 'sync:progress') {
          set({
            status: `${event.folderName ?? ''}: +${event.fetched ?? 0}`
          })
        } else if (event.type === 'sync:error') {
          set({ status: `Sync error: ${event.error}` })
          reportSyncError(event.error)
        } else if (event.type === 'sync:done') {
          set({ syncing: false, status: null })
          lastSyncError = null
          void reloadFolders()
          void reloadFolder()
        } else if (event.type === 'mail:new') {
          set({ status: 'New mail received' })
          useNotifications.getState().add({
            kind: 'mail',
            title: event.title ? `New mail from ${event.title}` : 'New mail',
            body: event.body ?? '',
            accountId: event.accountId,
            messageId: event.messageId,
            threadId: event.threadId
          })
          void reloadFolders()
          void reloadFolder()
          setTimeout(() => {
            if (get().status === 'New mail received') set({ status: null })
          }, 4000)
        } else if (event.type === 'mail:refresh') {
          void reloadFolders()
          void reloadFolder()
          void get().loadOutbox()
        }
      })

      await get().refreshAccounts()
      await get().loadLabels()
      void get().loadSavedSearches()
      void get().loadOutbox()
      const settings = await window.clover.settings.getAll()
      set({
        threaded: settings[SETTINGS_KEYS.threadedView] !== false,
        showHidden: settings['mail.showHidden'] === true
      })
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
      if (readTimer) {
        clearTimeout(readTimer)
        readTimer = null
      }
      set({ selectedMessageId: id, detail: null, conversation: [] })
      const [detail, conversation] = await Promise.all([
        window.clover.mail.getMessage(id),
        window.clover.mail.getConversation(id)
      ])
      set({ detail, conversation: conversation.length ? conversation : detail ? [detail] : [] })

      // Opening a conversation clears its bell notification(s) right away.
      if (detail) {
        const notifications = useNotifications.getState()
        notifications.markMessageRead(detail.id)
        if (detail.threadId) notifications.markThreadRead(detail.threadId)
      }

      // Mark read shortly after opening (like most clients), if still viewing it.
      if (detail && !detail.isRead) {
        readTimer = setTimeout(() => {
          readTimer = null
          if (get().selectedMessageId !== id) return
          void (async () => {
            await window.clover.mail.setFlags(id, { seen: true })
            set({
              messages: patchMessage(get().messages, id, { isRead: true }),
              searchResults: get().searchResults
                ? patchMessage(get().searchResults as MessageSummary[], id, { isRead: true })
                : null,
              detail:
                get().detail?.id === id
                  ? { ...(get().detail as MessageDetail), isRead: true }
                  : get().detail
            })
            await reloadFolder()
            await reloadFolders()
          })()
        }, 1500)
      }
    },

    sync: async () => {
      const accountId = get().activeAccountId
      if (!accountId) return
      set({ syncing: true, status: 'Connecting…', error: null })
      try {
        await window.clover.mail.syncAccount(accountId)
      } catch (error) {
        const message = (error as Error).message
        set({ syncing: false, error: message, status: null })
        reportSyncError(message)
        return
      }
      // Clear on completion too: this call may have joined a sync that already
      // emitted its sync:done, which would otherwise leave the status stuck on
      // "Connecting…".
      set({ syncing: false, status: null })
    },

    search: async (query) => {
      const trimmed = query.trim()
      if (!trimmed) {
        get().clearSearch()
        return
      }
      set({ searchQuery: query })
      const accountId =
        get().activeFolderId === UNIFIED_FOLDER_ID
          ? undefined
          : (get().activeAccountId ?? undefined)
      const local = await window.clover.mail.search(trimmed, accountId)

      let merged = local
      if (accountId) {
        set({ status: 'Searching server…' })
        try {
          const server = await window.clover.mail.searchServer(accountId, trimmed)
          const byId = new Map<string, MessageSummary>()
          for (const m of [...server, ...local]) byId.set(m.id, m)
          merged = [...byId.values()].sort((a, b) => (b.dateUtc ?? 0) - (a.dateUtc ?? 0))
        } catch {
          // server search unavailable — keep local results
        } finally {
          set({ status: null })
        }
      }
      set({ searchResults: merged })
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
      void reloadFolders()
      void reloadFolder()
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

    toggleImportant: async (message) => {
      await window.clover.mail.setFlags(message.id, { important: !message.isImportant })
      const patch = { isImportant: !message.isImportant }
      set({
        messages: patchMessage(get().messages, message.id, patch),
        searchResults: get().searchResults
          ? patchMessage(get().searchResults as MessageSummary[], message.id, patch)
          : null,
        detail:
          get().detail?.id === message.id
            ? { ...(get().detail as MessageDetail), ...patch }
            : get().detail
      })
      void reloadFolders()
    },

    toggleSelect: (messageId) => {
      const current = get().selectedIds
      set({
        selectedIds: current.includes(messageId)
          ? current.filter((id) => id !== messageId)
          : [...current, messageId]
      })
    },

    selectAll: () => {
      const list = get().searchResults ?? get().messages
      set({ selectedIds: list.map((m) => m.id) })
    },

    clearSelection: () => set({ selectedIds: [] }),

    bulk: async (action, targetFolderId) => {
      await get().bulkIds(get().selectedIds, action, targetFolderId)
    },

    bulkIds: async (ids, action, targetFolderId) => {
      if (ids.length === 0) return
      let result: BulkActionResult
      try {
        result = await window.clover.mail.bulkAction({ messageIds: ids, action, targetFolderId })
      } catch (error) {
        useToasts.getState().push({ message: `Action failed: ${(error as Error).message}`, kind: 'error' })
        return
      }
      set({ selectedIds: [], selectedMessageId: null, detail: null })
      await reloadFolder()
      await reloadFolders()

      // Offer undo for reversible moves (archive, move, delete-to-Trash).
      const undo = result.undo ?? []
      if (undo.length > 0) {
        const label = action === 'archive' ? 'Archived' : action === 'trash' ? 'Moved to Trash' : 'Moved'
        useToasts.getState().push({
          message: `${label} ${undo.length} ${undo.length === 1 ? 'message' : 'messages'}`,
          kind: 'info',
          actionLabel: 'Undo',
          onAction: () => {
            void (async () => {
              try {
                const res = await window.clover.mail.undoMoves(undo)
                if (res.restored === 0) {
                  useToasts.getState().push({ message: 'Could not undo', kind: 'error' })
                  return
                }
                await reloadFolder()
                await reloadFolders()
              } catch (error) {
                useToasts.getState().push({ message: `Could not undo: ${(error as Error).message}`, kind: 'error' })
              }
            })()
          }
        })
      }
    },

    emptyFolder: async (folderId) => {
      await window.clover.mail.emptyFolder(folderId)
      set({ selectedMessageId: null, detail: null })
      await reloadFolder()
      await reloadFolders()
    },

    markFolderRead: async (folderId) => {
      await window.clover.mail.markFolderRead(folderId)
      await reloadFolder()
      await reloadFolders()
    },

    syncFolder: async (folderId) => {
      set({ syncing: true, status: 'Syncing folder…' })
      try {
        await window.clover.mail.syncFolder(folderId)
      } finally {
        set({ syncing: false, status: null })
      }
      await reloadFolder()
      await reloadFolders()
    },

    emptyJunk: async () => {
      const accountId = get().activeAccountId
      if (!accountId) return
      await window.clover.mail.deleteSpam(accountId)
      set({ selectedMessageId: null, detail: null })
      await reloadFolder()
      await reloadFolders()
    },

    setUnreadOnly: (value) => set({ unreadOnly: value }),

    snooze: async (messageId, untilMs) => {
      await window.clover.mail.snooze(messageId, untilMs)
      set({ selectedMessageId: null, detail: null })
      await reloadFolder()
      await reloadFolders()
    },

    unsnooze: async (messageId) => {
      await window.clover.mail.unsnooze(messageId)
      await reloadFolder()
      await reloadFolders()
    },

    muteThread: async (threadId, muted) => {
      await window.clover.mail.setThreadMuted(threadId, muted)
      await reloadFolder()
    },

    pinThread: async (threadId, pinned) => {
      await window.clover.mail.setThreadPinned(threadId, pinned)
      await reloadFolder()
    },

    loadLabels: async () => {
      const labels = await window.clover.mail.listLabels()
      set({ labels })
    },

    createLabel: async (name, color) => {
      const trimmed = name.trim()
      if (!trimmed) return
      await window.clover.mail.createLabel(trimmed, color)
      await get().loadLabels()
    },

    deleteLabel: async (id) => {
      await window.clover.mail.deleteLabel(id)
      await get().loadLabels()
      if (get().activeFolderId === `label:${id}`) {
        const accountId = get().activeAccountId
        if (accountId) await get().selectAccount(accountId)
      }
    },

    toggleLabel: async (messageId, labelId, on) => {
      if (on) await window.clover.mail.addLabelToMessage(messageId, labelId)
      else await window.clover.mail.removeLabelFromMessage(messageId, labelId)
      if (get().activeFolderId === `label:${labelId}`) await reloadFolder()
    },

    loadSavedSearches: async () => {
      const savedSearches = await window.clover.mail.listSavedSearches()
      set({ savedSearches })
    },

    createSavedSearch: async (name, query) => {
      const trimmed = name.trim()
      const q = query.trim()
      if (!trimmed || !q) return
      await window.clover.mail.createSavedSearch(trimmed, q)
      await get().loadSavedSearches()
    },

    deleteSavedSearch: async (id) => {
      await window.clover.mail.deleteSavedSearch(id)
      await get().loadSavedSearches()
    },

    importMbox: async () => {
      const result = await window.clover.mail.pickImportMbox()
      if (!result) return
      set({ status: `Imported ${result.imported} messages` })
      await get().refreshAccounts()
      setTimeout(() => {
        if (get().status?.startsWith('Imported')) set({ status: null })
      }, 5000)
    },
    setThreaded: async (value) => {
      set({ threaded: value })
      await window.clover.settings.set(SETTINGS_KEYS.threadedView, value)
      await reloadFolder()
    },

    toggleThread: (threadId) => {
      const current = get().expandedThreadIds
      set({
        expandedThreadIds: current.includes(threadId)
          ? current.filter((id) => id !== threadId)
          : [...current, threadId]
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
      // The sent copy is cached locally, so refresh to show it in its thread.
      await reloadFolders()
      await reloadFolder()
      await get().loadOutbox()
    },

    loadOutbox: async () => {
      const outbox = await window.clover.mail.listOutbox()
      set({ outbox })
    },

    loadMessageBody: async (id) => {
      const detail = await window.clover.mail.getMessage(id)
      if (!detail) return
      set({ conversation: get().conversation.map((m) => (m.id === id ? detail : m)) })
    },

    refreshDetail: async () => {
      const id = get().selectedMessageId
      if (!id) return
      const [detail, conversation] = await Promise.all([
        window.clover.mail.getMessage(id),
        window.clover.mail.getConversation(id)
      ])
      set({ detail, conversation: conversation.length ? conversation : detail ? [detail] : [] })
    },

    retryOutbox: async (id) => {
      await window.clover.mail.retryOutbox(id)
      await get().loadOutbox()
    },

    discardOutbox: async (id) => {
      await window.clover.mail.discardOutbox(id)
      await get().loadOutbox()
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

    createFolder: async (name) => {
      const accountId = get().activeAccountId
      if (!accountId || !name.trim()) return
      await window.clover.mail.createFolder({ accountId, name: name.trim() })
      await reloadFolders()
    },

    renameFolder: async (folderId, name) => {
      if (!name.trim()) return
      await window.clover.mail.renameFolder(folderId, name.trim())
      await reloadFolders()
    },

    deleteFolder: async (folderId) => {
      const wasActive = get().activeFolderId === folderId
      await window.clover.mail.deleteFolder(folderId)
      await reloadFolders()
      const accountId = get().activeAccountId
      if (wasActive && accountId) await get().selectAccount(accountId)
    },

    setFolderVisible: async (folderId, visible) => {
      await window.clover.mail.setFolderVisible(folderId, visible)
      await reloadFolders()
    },

    exportMbox: async (folderId) => {
      const result = await window.clover.mail.exportMbox(folderId)
      if (result.saved) {
        set({ status: `Exported ${result.count ?? 0} messages to mbox` })
        setTimeout(() => {
          if (get().status?.startsWith('Exported')) set({ status: null })
        }, 4000)
      }
    },

    setShowHidden: (value) => {
      set({ showHidden: value })
      void window.clover.settings.set('mail.showHidden', value)
    },

    loadRules: async () => {
      const accountId = get().activeAccountId
      if (!accountId) return
      const rules = await window.clover.mail.listRules(accountId)
      set({ rules })
    },

    saveRule: async (input, ruleId) => {
      const accountId = get().activeAccountId
      if (!accountId) return
      if (ruleId) await window.clover.mail.updateRule(ruleId, input)
      else await window.clover.mail.createRule(accountId, input)
      await get().loadRules()
    },

    removeRule: async (ruleId) => {
      await window.clover.mail.deleteRule(ruleId)
      await get().loadRules()
    },

    applyRulesNow: async () => {
      const accountId = get().activeAccountId
      if (!accountId) return { matched: 0, moved: 0 }
      const result = await window.clover.mail.applyRules(accountId)
      await reloadFolders()
      await reloadFolder()
      return result
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

// Benchmark-only: expose the store so the bench runner can drive it. Removed by
// dead-code elimination in a normal build.
if (__CLOVER_BENCH__) benchInstallStore(useMail)
