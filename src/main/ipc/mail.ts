import type { BrowserWindow } from 'electron'
import { ipcHost as ipcMain } from '@main/ipcHost'
import { IpcChannels } from '@shared/channels'
import type {
  AccountInput,
  BulkActionInput,
  ComposeInput,
  ConnectionTestResult,
  CreateAccountInput,
  CreateFolderInput,
  DraftData,
  MovedMessage,
  RuleInput
} from '@shared/mail'
import * as accountService from '@core/mail/accounts'
import { testImap } from '@core/mail/imap'
import { testSmtp } from '@core/mail/smtp'
import { syncAccount as runSyncAccount, syncFolder as runSyncFolder, type Emit } from '@core/mail/sync'
import { listFolders, listImportant, listJunk, listMessages, listThreads, listUnifiedMessages, listUnifiedThreads, importantCount, spamCount, hasOlderMessages } from '@core/mail/queries'
import { deleteMessage, downloadAttachment, getAttachmentPath, getConversation, getMessageDetail, moveMessage, openAttachment, readAttachmentText, setFlags } from '@core/mail/messages'
import { listOutbox, retryOutbox, cancelOutbox, sendNow } from '@core/mail/outbox'
import { searchMessages, searchServer } from '@core/mail/search'
import { addSnippet, deleteSnippet, listSnippets } from '@core/mail/snippets'
import { snooze, unsnooze } from '@core/mail/snooze'
import { cancelScheduled, listScheduled, scheduleSend } from '@core/mail/schedules'
import { setThreadMuted, setThreadPinned } from '@core/mail/threadSettings'
import {
  addLabelToMessage,
  createLabel,
  deleteLabel,
  labelIdsForMessage,
  listLabelMessages,
  listLabels,
  removeLabelFromMessage
} from '@core/mail/labels'
import { createSavedSearch, deleteSavedSearch, listSavedSearches } from '@core/mail/savedSearches'
import { importMboxFile, pickAndImportMbox } from '@core/mail/importMail'
import { testPop3 } from '@core/mail/pop3'
import { markNotSpam, markSpam, setSenderKind } from '@core/mail/spam'
import { createFolder, deleteFolder, renameFolder, setFolderVisible } from '@core/mail/folders'
import { addAlias, deleteAlias, getDefaultFrom, listAliases, setDefaultFrom } from '@core/mail/aliases'
import { exportFolderMbox } from '@core/mail/archive'
import { deleteDraft, saveDraft } from '@core/mail/drafts'
import {
  getGoogleConfig,
  getMicrosoftConfig,
  googleConfigured,
  microsoftConfigured,
  setGoogleConfig,
  setMicrosoftConfig,
  startGoogleOAuth,
  startMicrosoftOAuth
} from '@main/oauth'
import { bulkAction, deleteSpam, emptyFolder, markFolderRead, undoMoves } from '@core/mail/bulk'
import { startAllIdle, startIdle, stopIdle } from '@core/mail/idle'
import { createMailEmit } from '@main/mail/events'
import { applyRules, createRule, deleteRule, listRules, updateRule } from '@core/mail/rules'

export function registerMailIpc(getWindow: () => BrowserWindow | null): void {
  const emit: Emit = createMailEmit(getWindow)

  ipcMain.handle(IpcChannels.mail.listAccounts, () => accountService.listAccounts())
  ipcMain.handle(IpcChannels.mail.createAccount, (_e, input: CreateAccountInput) => {
    const account = accountService.createAccount(input)
    startIdle(account.id, emit)
    return account
  })
  ipcMain.handle(IpcChannels.mail.updateAccount, (_e, id: string, input: AccountInput) =>
    accountService.updateAccount(id, input)
  )
  ipcMain.handle(IpcChannels.mail.deleteAccount, (_e, id: string) => {
    stopIdle(id)
    accountService.deleteAccount(id)
  })

  ipcMain.handle(
    IpcChannels.mail.testConnection,
    async (_e, input: CreateAccountInput): Promise<ConnectionTestResult> => {
      const result: ConnectionTestResult = { ok: false }
      const isPop = input.protocol === 'pop3'
      try {
        result.imap = isPop
          ? await testPop3(input.incoming, {
              user: input.incoming.username,
              pass: input.password
            })
          : await testImap(input.incoming, {
              user: input.incoming.username,
              pass: input.password
            })
      } catch (error) {
        result.error = `${isPop ? 'POP3' : 'IMAP'}: ${(error as Error).message}`
        return result
      }
      try {
        result.smtp = await testSmtp(input.outgoing, {
          user: input.outgoing.username,
          pass: input.password
        })
      } catch (error) {
        result.error = `SMTP: ${(error as Error).message}`
        return result
      }
      result.ok = true
      return result
    }
  )

  ipcMain.handle(IpcChannels.mail.syncAccount, (_e, accountId: string) =>
    runSyncAccount(accountId, emit)
  )
  ipcMain.handle(IpcChannels.mail.syncFolder, (_e, folderId: string) =>
    runSyncFolder(folderId, emit)
  )
  ipcMain.handle(IpcChannels.mail.listFolders, (_e, accountId: string) => listFolders(accountId))
  ipcMain.handle(
    IpcChannels.mail.listMessages,
    (_e, folderId: string, limit?: number, offset?: number) => listMessages(folderId, limit, offset)
  )
  ipcMain.handle(IpcChannels.mail.listThreads, (_e, folderId: string, limit?: number) =>
    listThreads(folderId, limit)
  )
  ipcMain.handle(IpcChannels.mail.hasOlderMessages, (_e, folderId: string, limit: number) =>
    hasOlderMessages(folderId, limit)
  )
  ipcMain.handle(IpcChannels.mail.listJunk, (_e, accountId: string) => listJunk(accountId))
  ipcMain.handle(IpcChannels.mail.spamCount, (_e, accountId: string) => spamCount(accountId))
  ipcMain.handle(IpcChannels.mail.listImportant, (_e, accountId: string) => listImportant(accountId))
  ipcMain.handle(IpcChannels.mail.importantCount, (_e, accountId: string) =>
    importantCount(accountId)
  )
  ipcMain.handle(IpcChannels.mail.listUnifiedThreads, (_e, limit?: number) =>
    listUnifiedThreads(limit)
  )
  ipcMain.handle(IpcChannels.mail.listUnifiedMessages, (_e, limit?: number) =>
    listUnifiedMessages(limit)
  )
  ipcMain.handle(IpcChannels.mail.markSpam, (_e, messageId: string) => markSpam(messageId))
  ipcMain.handle(IpcChannels.mail.markNotSpam, (_e, messageId: string) => markNotSpam(messageId))
  ipcMain.handle(IpcChannels.mail.blockSender, (_e, accountId: string, email: string) =>
    setSenderKind(accountId, email, 'block')
  )
  ipcMain.handle(IpcChannels.mail.allowSender, (_e, accountId: string, email: string) =>
    setSenderKind(accountId, email, 'allow')
  )

  ipcMain.handle(IpcChannels.mail.createFolder, (_e, input: CreateFolderInput) =>
    createFolder(input.accountId, input.name, input.parentRemotePath)
  )
  ipcMain.handle(IpcChannels.mail.renameFolder, (_e, folderId: string, newName: string) =>
    renameFolder(folderId, newName)
  )
  ipcMain.handle(IpcChannels.mail.deleteFolder, (_e, folderId: string) => deleteFolder(folderId))
  ipcMain.handle(IpcChannels.mail.setFolderVisible, (_e, folderId: string, visible: boolean) =>
    setFolderVisible(folderId, visible)
  )
  ipcMain.handle(IpcChannels.mail.exportMbox, (_e, folderId: string) => exportFolderMbox(folderId))
  ipcMain.handle(IpcChannels.mail.listAliases, (_e, accountId: string) => listAliases(accountId))
  ipcMain.handle(IpcChannels.mail.addAlias, (_e, accountId: string, email: string, name?: string) =>
    addAlias(accountId, email, name)
  )
  ipcMain.handle(IpcChannels.mail.deleteAlias, (_e, aliasId: string) => deleteAlias(aliasId))
  ipcMain.handle(IpcChannels.mail.getDefaultFrom, (_e, accountId: string) => getDefaultFrom(accountId))
  ipcMain.handle(
    IpcChannels.mail.setDefaultFrom,
    (_e, accountId: string, email: string | null) => setDefaultFrom(accountId, email)
  )
  ipcMain.handle(IpcChannels.mail.oauthStart, async () => {
    const account = await startGoogleOAuth()
    startIdle(account.id, emit)
    return account
  })
  ipcMain.handle(IpcChannels.mail.oauthGoogleConfigured, () => googleConfigured())
  ipcMain.handle(IpcChannels.mail.oauthGetGoogleConfig, () => ({
    clientId: getGoogleConfig().clientId
  }))
  ipcMain.handle(
    IpcChannels.mail.oauthSetGoogleConfig,
    (_e, clientId: string, clientSecret?: string) => setGoogleConfig(clientId, clientSecret)
  )
  ipcMain.handle(IpcChannels.mail.oauthStartMicrosoft, async () => {
    const account = await startMicrosoftOAuth()
    startIdle(account.id, emit)
    return account
  })
  ipcMain.handle(IpcChannels.mail.oauthMicrosoftConfigured, () => microsoftConfigured())
  ipcMain.handle(IpcChannels.mail.oauthGetMicrosoftConfig, () => ({
    clientId: getMicrosoftConfig().clientId
  }))
  ipcMain.handle(
    IpcChannels.mail.oauthSetMicrosoftConfig,
    (_e, clientId: string, clientSecret?: string) => setMicrosoftConfig(clientId, clientSecret)
  )
  ipcMain.handle(IpcChannels.mail.listRules, (_e, accountId: string) => listRules(accountId))
  ipcMain.handle(IpcChannels.mail.createRule, (_e, accountId: string, input: RuleInput) =>
    createRule(accountId, input)
  )
  ipcMain.handle(IpcChannels.mail.updateRule, (_e, ruleId: string, input: RuleInput) =>
    updateRule(ruleId, input)
  )
  ipcMain.handle(IpcChannels.mail.deleteRule, (_e, ruleId: string) => deleteRule(ruleId))
  ipcMain.handle(IpcChannels.mail.applyRules, (_e, accountId: string) => applyRules(accountId))
  ipcMain.handle(IpcChannels.mail.getMessage, (_e, messageId: string) =>
    getMessageDetail(messageId)
  )
  ipcMain.handle(IpcChannels.mail.getConversation, (_e, messageId: string) =>
    getConversation(messageId)
  )
  ipcMain.handle(
    IpcChannels.mail.setFlags,
    (_e, messageId: string, flags: { seen?: boolean; flagged?: boolean; important?: boolean }) =>
      setFlags(messageId, flags)
  )
  ipcMain.handle(IpcChannels.mail.moveMessage, (_e, messageId: string, targetFolderId: string) =>
    moveMessage(messageId, targetFolderId)
  )
  ipcMain.handle(IpcChannels.mail.deleteMessage, (_e, messageId: string) =>
    deleteMessage(messageId)
  )
  ipcMain.handle(IpcChannels.mail.bulkAction, (_e, input: BulkActionInput) => bulkAction(input))
  ipcMain.handle(IpcChannels.mail.undoMoves, async (_e, moves: MovedMessage[]) => {
    const result = await undoMoves(moves)
    // Re-sync the origin folders in the background so the restored messages
    // reappear (via sync:done) without making the Undo action wait for a sync.
    for (const folderId of result.folderIds) {
      void runSyncFolder(folderId, emit).catch(() => undefined)
    }
    return { restored: result.restored, failed: result.failed }
  })
  ipcMain.handle(IpcChannels.mail.emptyFolder, (_e, folderId: string) => emptyFolder(folderId))
  ipcMain.handle(IpcChannels.mail.markFolderRead, (_e, folderId: string) => markFolderRead(folderId))
  ipcMain.handle(IpcChannels.mail.deleteSpam, (_e, accountId: string) => deleteSpam(accountId))
  ipcMain.handle(IpcChannels.mail.sendMessage, (_e, input: ComposeInput) => sendNow(input))
  ipcMain.handle(IpcChannels.mail.outboxList, () => listOutbox())
  ipcMain.handle(IpcChannels.mail.outboxRetry, (_e, id: string) => retryOutbox(id))
  ipcMain.handle(IpcChannels.mail.outboxDiscard, (_e, id: string) => cancelOutbox(id))
  ipcMain.handle(
    IpcChannels.mail.saveDraft,
    (_e, accountId: string, draft: DraftData, existingUid?: number | null) =>
      saveDraft(accountId, draft, existingUid)
  )
  ipcMain.handle(IpcChannels.mail.deleteDraft, (_e, accountId: string, uid: number) =>
    deleteDraft(accountId, uid)
  )
  ipcMain.handle(IpcChannels.mail.downloadAttachment, (_e, attachmentId: string) =>
    downloadAttachment(attachmentId)
  )
  ipcMain.handle(IpcChannels.mail.attachmentPath, (_e, attachmentId: string) =>
    getAttachmentPath(attachmentId)
  )
  ipcMain.handle(IpcChannels.mail.openAttachment, (_e, attachmentId: string) =>
    openAttachment(attachmentId)
  )
  ipcMain.handle(IpcChannels.mail.readAttachmentText, (_e, attachmentId: string) =>
    readAttachmentText(attachmentId)
  )
  ipcMain.handle(IpcChannels.mail.search, (_e, query: string, accountId?: string) =>
    searchMessages(query, accountId)
  )
  ipcMain.handle(IpcChannels.mail.searchServer, (_e, accountId: string, query: string) =>
    searchServer(accountId, query)
  )
  ipcMain.handle(IpcChannels.mail.listSnippets, () => listSnippets())
  ipcMain.handle(IpcChannels.mail.addSnippet, (_e, name: string, body: string) =>
    addSnippet(name, body)
  )
  ipcMain.handle(IpcChannels.mail.deleteSnippet, (_e, id: string) => deleteSnippet(id))
  ipcMain.handle(IpcChannels.mail.snooze, (_e, messageId: string, untilMs: number) =>
    snooze(messageId, untilMs)
  )
  ipcMain.handle(IpcChannels.mail.unsnooze, (_e, messageId: string) => unsnooze(messageId))
  ipcMain.handle(IpcChannels.mail.scheduleSend, (_e, payload: ComposeInput, sendAt: number) =>
    scheduleSend(payload, sendAt)
  )
  ipcMain.handle(IpcChannels.mail.listScheduled, () => listScheduled())
  ipcMain.handle(IpcChannels.mail.cancelScheduled, (_e, id: string) => cancelScheduled(id))
  ipcMain.handle(IpcChannels.mail.setThreadMuted, (_e, threadId: string, muted: boolean) =>
    setThreadMuted(threadId, muted)
  )
  ipcMain.handle(IpcChannels.mail.setThreadPinned, (_e, threadId: string, pinned: boolean) =>
    setThreadPinned(threadId, pinned)
  )
  ipcMain.handle(IpcChannels.mail.listLabels, () => listLabels())
  ipcMain.handle(IpcChannels.mail.createLabel, (_e, name: string, color?: string) =>
    createLabel(name, color)
  )
  ipcMain.handle(IpcChannels.mail.deleteLabel, (_e, id: string) => deleteLabel(id))
  ipcMain.handle(IpcChannels.mail.addLabelToMessage, (_e, messageId: string, labelId: string) =>
    addLabelToMessage(messageId, labelId)
  )
  ipcMain.handle(
    IpcChannels.mail.removeLabelFromMessage,
    (_e, messageId: string, labelId: string) => removeLabelFromMessage(messageId, labelId)
  )
  ipcMain.handle(IpcChannels.mail.listLabelMessages, (_e, labelId: string) =>
    listLabelMessages(labelId)
  )
  ipcMain.handle(IpcChannels.mail.labelsForMessage, (_e, messageId: string) =>
    labelIdsForMessage(messageId)
  )
  ipcMain.handle(IpcChannels.mail.listSavedSearches, () => listSavedSearches())
  ipcMain.handle(IpcChannels.mail.createSavedSearch, (_e, name: string, query: string) =>
    createSavedSearch(name, query)
  )
  ipcMain.handle(IpcChannels.mail.deleteSavedSearch, (_e, id: string) => deleteSavedSearch(id))
  ipcMain.handle(IpcChannels.mail.importMbox, (_e, path: string) => importMboxFile(path))
  ipcMain.handle(IpcChannels.mail.pickImportMbox, () => pickAndImportMbox())

  startAllIdle(emit)
}
