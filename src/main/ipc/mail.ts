import { ipcMain, type BrowserWindow } from 'electron'
import { IpcChannels } from '@shared/channels'
import type {
  AccountInput,
  ComposeInput,
  ConnectionTestResult,
  CreateAccountInput,
  CreateFolderInput,
  RuleInput
} from '@shared/mail'
import * as accountService from '@main/mail/accounts'
import { testImap } from '@main/mail/imap'
import { testSmtp } from '@main/mail/smtp'
import { syncAccount as runSyncAccount, syncFolder as runSyncFolder, type Emit } from '@main/mail/sync'
import { listFolders, listJunk, listMessages, spamCount } from '@main/mail/queries'
import { deleteMessage, downloadAttachment, getMessageDetail, moveMessage, setFlags } from '@main/mail/messages'
import { sendMessage } from '@main/mail/send'
import { searchMessages } from '@main/mail/search'
import { markNotSpam, markSpam, setSenderKind } from '@main/mail/spam'
import { createFolder } from '@main/mail/folders'
import { applyRules, createRule, deleteRule, listRules, updateRule } from '@main/mail/rules'

export function registerMailIpc(getWindow: () => BrowserWindow | null): void {
  const emit: Emit = (event) => getWindow()?.webContents.send(IpcChannels.mail.events, event)

  ipcMain.handle(IpcChannels.mail.listAccounts, () => accountService.listAccounts())
  ipcMain.handle(IpcChannels.mail.createAccount, (_e, input: CreateAccountInput) =>
    accountService.createAccount(input)
  )
  ipcMain.handle(IpcChannels.mail.updateAccount, (_e, id: string, input: AccountInput) =>
    accountService.updateAccount(id, input)
  )
  ipcMain.handle(IpcChannels.mail.deleteAccount, (_e, id: string) =>
    accountService.deleteAccount(id)
  )

  ipcMain.handle(
    IpcChannels.mail.testConnection,
    async (_e, input: CreateAccountInput): Promise<ConnectionTestResult> => {
      const result: ConnectionTestResult = { ok: false }
      try {
        result.imap = await testImap(input.incoming, input.password)
      } catch (error) {
        result.error = `IMAP: ${(error as Error).message}`
        return result
      }
      try {
        result.smtp = await testSmtp(input.outgoing, input.password)
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
  ipcMain.handle(IpcChannels.mail.listJunk, (_e, accountId: string) => listJunk(accountId))
  ipcMain.handle(IpcChannels.mail.spamCount, (_e, accountId: string) => spamCount(accountId))
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
  ipcMain.handle(
    IpcChannels.mail.setFlags,
    (_e, messageId: string, flags: { seen?: boolean; flagged?: boolean }) =>
      setFlags(messageId, flags)
  )
  ipcMain.handle(IpcChannels.mail.moveMessage, (_e, messageId: string, targetFolderId: string) =>
    moveMessage(messageId, targetFolderId)
  )
  ipcMain.handle(IpcChannels.mail.deleteMessage, (_e, messageId: string) =>
    deleteMessage(messageId)
  )
  ipcMain.handle(IpcChannels.mail.sendMessage, (_e, input: ComposeInput) => sendMessage(input))
  ipcMain.handle(IpcChannels.mail.downloadAttachment, (_e, attachmentId: string) =>
    downloadAttachment(attachmentId)
  )
  ipcMain.handle(IpcChannels.mail.search, (_e, query: string, accountId?: string) =>
    searchMessages(query, accountId)
  )
}
