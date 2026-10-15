import type { ReactNode } from 'react'
import { useMail } from '../state/mail'
import { useToasts } from '../state/toasts'
import type { BulkActionType, FolderSummary, MessageSummary, ThreadSummary } from '@shared/mail'

export interface MessageMenuState {
  x: number
  y: number
  message: MessageSummary
  mode: 'main' | 'move' | 'label'
}
export interface ThreadMenuState {
  x: number
  y: number
  thread: ThreadSummary
}
export interface FolderMenuState {
  x: number
  y: number
  kind: 'folder' | 'junk'
  folder?: FolderSummary
}
export interface PromptState {
  title: string
  value: string
  onSubmit: (value: string) => void
}
export interface ConfirmState {
  title: string
  body: string
  action: () => void
}

function MenuItem({
  onClick,
  danger,
  children
}: {
  onClick: () => void
  danger?: boolean
  children: ReactNode
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-black/5 dark:hover:bg-white/10 ' +
        (danger ? 'text-rose-500' : 'text-ink')
      }
    >
      {children}
    </button>
  )
}

function MenuDivider(): ReactNode {
  return <div className="my-1 h-px bg-line" />
}

export function MailContextMenus({
  menu,
  setMenu,
  threadMenu,
  setThreadMenu,
  folderMenu,
  setFolderMenu,
  prompt,
  setPrompt,
  confirm,
  setConfirm,
  menuLabelIds,
  setMenuLabelIds,
  onForward,
  ask
}: {
  menu: MessageMenuState | null
  setMenu: (m: MessageMenuState | null) => void
  threadMenu: ThreadMenuState | null
  setThreadMenu: (m: ThreadMenuState | null) => void
  folderMenu: FolderMenuState | null
  setFolderMenu: (m: FolderMenuState | null) => void
  prompt: PromptState | null
  setPrompt: (p: PromptState | null) => void
  confirm: ConfirmState | null
  setConfirm: (c: ConfirmState | null) => void
  menuLabelIds: string[]
  setMenuLabelIds: (ids: string[]) => void
  onForward: () => void
  ask: (title: string, body: string, action: () => void) => void
}): ReactNode {
  const selectMessage = useMail((s) => s.selectMessage)
  const toggleImportant = useMail((s) => s.toggleImportant)
  const toggleFlag = useMail((s) => s.toggleFlag)
  const toggleLabel = useMail((s) => s.toggleLabel)
  const muteThread = useMail((s) => s.muteThread)
  const pinThread = useMail((s) => s.pinThread)
  const bulkIds = useMail((s) => s.bulkIds)
  const emptyJunk = useMail((s) => s.emptyJunk)
  const syncFolder = useMail((s) => s.syncFolder)
  const markFolderRead = useMail((s) => s.markFolderRead)
  const exportMbox = useMail((s) => s.exportMbox)
  const setFolderVisible = useMail((s) => s.setFolderVisible)
  const createFolder = useMail((s) => s.createFolder)
  const renameFolder = useMail((s) => s.renameFolder)
  const deleteFolder = useMail((s) => s.deleteFolder)
  const emptyFolder = useMail((s) => s.emptyFolder)
  const labels = useMail((s) => s.labels)
  const folders = useMail((s) => s.folders)
  const selectedIds = useMail((s) => s.selectedIds)

  const menuTargets =
    menu && selectedIds.includes(menu.message.id) && selectedIds.length > 1
      ? selectedIds
      : menu
        ? [menu.message.id]
        : []

  function menuRun(action: BulkActionType, targetFolderId?: string): void {
    void bulkIds(menuTargets, action, targetFolderId)
    setMenu(null)
  }

  function menuDelete(): void {
    const count = menuTargets.length
    ask('Delete messages', `Move ${count} message${count === 1 ? '' : 's'} to Trash?`, () => {
      void bulkIds(menuTargets, 'trash')
      setMenu(null)
    })
  }

  return (
    <>
      {menu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu(null)
            }}
          />
          <div
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-2xl"
            style={{ left: menu.x, top: menu.y }}
          >
            {menu.mode === 'main' ? (
              <>
                <MenuItem
                  onClick={() => {
                    void selectMessage(menu.message.id)
                    setMenu(null)
                  }}
                >
                  Open
                </MenuItem>
                <MenuItem onClick={() => menuRun(menu.message.isRead ? 'markUnread' : 'markRead')}>
                  {menu.message.isRead ? 'Mark as unread' : 'Mark as read'}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void toggleImportant(menu.message)
                    setMenu(null)
                  }}
                >
                  {menu.message.isImportant ? 'Remove important' : 'Mark as important'}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    void toggleFlag(menu.message)
                    setMenu(null)
                  }}
                >
                  {menu.message.isFlagged ? 'Unstar' : 'Star'}
                </MenuItem>
                <MenuDivider />
                <MenuItem onClick={() => menuRun('archive')}>Archive</MenuItem>
                <MenuItem
                  onClick={() => {
                    void (async () => {
                      await selectMessage(menu.message.id)
                      onForward()
                    })()
                    setMenu(null)
                  }}
                >
                  Forward
                </MenuItem>
                <MenuItem onClick={() => setMenu({ ...menu, mode: 'move' })}>Move to folder ›</MenuItem>
                <MenuItem
                  onClick={() => {
                    void window.clover.mail.labelsForMessage(menu.message.id).then(setMenuLabelIds)
                    setMenu({ ...menu, mode: 'label' })
                  }}
                >
                  Labels ›
                </MenuItem>
                <MenuItem danger onClick={menuDelete}>
                  Delete
                </MenuItem>
              </>
            ) : menu.mode === 'move' ? (
              <>
                <MenuItem onClick={() => setMenu({ ...menu, mode: 'main' })}>‹ Back</MenuItem>
                <MenuDivider />
                <div className="max-h-64 overflow-y-auto">
                  {folders.map((folder) => (
                    <MenuItem key={folder.id} onClick={() => menuRun('move', folder.id)}>
                      {folder.name}
                    </MenuItem>
                  ))}
                </div>
              </>
            ) : (
              <>
                <MenuItem onClick={() => setMenu({ ...menu, mode: 'main' })}>‹ Back</MenuItem>
                <MenuDivider />
                <div className="max-h-64 overflow-y-auto">
                  {labels.length === 0 && (
                    <div className="px-3 py-1.5 text-[12px] text-muted">No labels yet</div>
                  )}
                  {labels.map((label) => {
                    const on = menuLabelIds.includes(label.id)
                    return (
                      <MenuItem
                        key={label.id}
                        onClick={() => {
                          const mid = menu.message.id
                          void toggleLabel(mid, label.id, !on)
                          setMenuLabelIds(
                            on
                              ? menuLabelIds.filter((x) => x !== label.id)
                              : [...menuLabelIds, label.id]
                          )
                          useToasts.getState().push({
                            message: `${on ? 'Removed' : 'Added'} label “${label.name}”`,
                            kind: 'info',
                            actionLabel: 'Undo',
                            onAction: () => void toggleLabel(mid, label.id, on)
                          })
                        }}
                      >
                        <span className="flex flex-1 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: label.color }}
                          />
                          <span className="flex-1">{label.name}</span>
                          {on && <span className="text-accent">✓</span>}
                        </span>
                      </MenuItem>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}

      {threadMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setThreadMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setThreadMenu(null)
            }}
          />
          <div
            className="fixed z-50 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-2xl"
            style={{ left: threadMenu.x, top: threadMenu.y }}
          >
            <MenuItem
              onClick={() => {
                void muteThread(threadMenu.thread.threadId, !threadMenu.thread.muted)
                setThreadMenu(null)
              }}
            >
              {threadMenu.thread.muted ? 'Unmute thread' : 'Mute thread'}
            </MenuItem>
            <MenuItem
              onClick={() => {
                void pinThread(threadMenu.thread.threadId, !threadMenu.thread.pinned)
                setThreadMenu(null)
              }}
            >
              {threadMenu.thread.pinned ? 'Unpin thread' : 'Pin thread'}
            </MenuItem>
            <MenuItem
              onClick={() => {
                void bulkIds(
                  threadMenu.thread.messages.map((x) => x.id),
                  'markRead'
                )
                setThreadMenu(null)
              }}
            >
              Mark thread read
            </MenuItem>
            <MenuDivider />
            <MenuItem
              onClick={() => {
                void bulkIds(
                  threadMenu.thread.messages.map((x) => x.id),
                  'archive'
                )
                setThreadMenu(null)
              }}
            >
              Archive thread
            </MenuItem>
            <MenuItem
              danger
              onClick={() => {
                if (window.confirm('Move this whole conversation to Trash?')) {
                  void bulkIds(
                    threadMenu.thread.messages.map((x) => x.id),
                    'trash'
                  )
                }
                setThreadMenu(null)
              }}
            >
              Delete thread
            </MenuItem>
          </div>
        </>
      )}

      {folderMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setFolderMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setFolderMenu(null)
            }}
          />
          <div
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-2xl"
            style={{ left: folderMenu.x, top: folderMenu.y }}
          >
            {folderMenu.kind === 'junk' ? (
              <MenuItem
                danger
                onClick={() => {
                  setFolderMenu(null)
                  ask('Empty Junk', 'Permanently delete all messages in Junk?', () => void emptyJunk())
                }}
              >
                Empty Junk
              </MenuItem>
            ) : (
              <>
                <MenuItem
                  onClick={() => {
                    if (folderMenu.folder) void syncFolder(folderMenu.folder.id)
                    setFolderMenu(null)
                  }}
                >
                  Sync now
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    if (folderMenu.folder) void markFolderRead(folderMenu.folder.id)
                    setFolderMenu(null)
                  }}
                >
                  Mark all as read
                </MenuItem>
                <MenuDivider />
                <MenuItem
                  onClick={() => {
                    const folder = folderMenu.folder
                    setFolderMenu(null)
                    if (folder) void exportMbox(folder.id)
                  }}
                >
                  Export to mbox…
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    const folder = folderMenu.folder
                    setFolderMenu(null)
                    if (folder) void setFolderVisible(folder.id, !folder.isVisible)
                  }}
                >
                  {folderMenu.folder?.isVisible ? 'Hide folder' : 'Show folder'}
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    setFolderMenu(null)
                    setPrompt({
                      title: 'New folder',
                      value: '',
                      onSubmit: (v) => {
                        if (v.trim()) void createFolder(v)
                      }
                    })
                  }}
                >
                  New folder…
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    const folder = folderMenu.folder
                    setFolderMenu(null)
                    if (folder) {
                      setPrompt({
                        title: 'Rename folder',
                        value: folder.name,
                        onSubmit: (v) => {
                          if (v.trim()) void renameFolder(folder.id, v)
                        }
                      })
                    }
                  }}
                >
                  Rename…
                </MenuItem>
                {folderMenu.folder?.specialUse !== 'trash' && folderMenu.folder?.specialUse !== 'inbox' && (
                  <MenuItem
                    danger
                    onClick={() => {
                      const folder = folderMenu.folder
                      setFolderMenu(null)
                      if (folder) {
                        ask('Delete folder', `Delete the folder “${folder.name}”?`, () =>
                          void deleteFolder(folder.id)
                        )
                      }
                    }}
                  >
                    Delete folder
                  </MenuItem>
                )}
                {folderMenu.folder?.specialUse === 'trash' && (
                  <>
                    <MenuDivider />
                    <MenuItem
                      danger
                      onClick={() => {
                        const id = folderMenu.folder?.id
                        setFolderMenu(null)
                        if (id) {
                          ask('Empty Trash', 'Permanently delete everything in Trash?', () =>
                            void emptyFolder(id)
                          )
                        }
                      }}
                    >
                      Empty Trash
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {prompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl">
            <h3 className="text-[15px] font-semibold text-ink">{prompt.title}</h3>
            <input
              autoFocus
              value={prompt.value}
              onChange={(e) => setPrompt({ ...prompt, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const value = prompt.value
                  const submit = prompt.onSubmit
                  setPrompt(null)
                  submit(value)
                }
                if (e.key === 'Escape') setPrompt(null)
              }}
              className="mt-3 w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPrompt(null)}
                className="rounded-lg px-3.5 py-2 text-[13px] text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const value = prompt.value
                  const submit = prompt.onSubmit
                  setPrompt(null)
                  submit(value)
                }}
                className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-2xl">
            <h3 className="text-[15px] font-semibold text-ink">{confirm.title}</h3>
            <p className="mt-1.5 text-[13px] text-muted">{confirm.body}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="rounded-lg px-3.5 py-2 text-[13px] text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = confirm.action
                  setConfirm(null)
                  action()
                }}
                className="rounded-lg bg-rose-500 px-4 py-2 text-[13px] font-semibold text-white"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
