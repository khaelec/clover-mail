import { ipcHost as ipcMain } from '@main/ipcHost'
import { IpcChannels } from '@shared/channels'
import type { ContactInput } from '@shared/contacts'
import {
  exportContacts,
  listContacts,
  listGroups,
  removeGroup,
  saveGroup,
  pickAndImportContacts,
  removeContact,
  saveContact,
  suggestContacts
} from '@core/mail/contacts'

export function registerContactsIpc(): void {
  ipcMain.handle(IpcChannels.contacts.list, (_e, scope: 'saved' | 'all', query?: string) =>
    listContacts(scope === 'all' ? 'all' : 'saved', query ?? '')
  )
  ipcMain.handle(IpcChannels.contacts.suggest, (_e, query: string, limit?: number) =>
    suggestContacts(query, limit)
  )
  ipcMain.handle(IpcChannels.contacts.save, (_e, input: ContactInput, id?: string) =>
    saveContact(input, id)
  )
  ipcMain.handle(IpcChannels.contacts.remove, (_e, id: string) => removeContact(id))
  ipcMain.handle(IpcChannels.contacts.listGroups, () => listGroups())
  ipcMain.handle(IpcChannels.contacts.saveGroup, (_e, name: string, memberIds: string[], id?: string) =>
    saveGroup(name, memberIds, id)
  )
  ipcMain.handle(IpcChannels.contacts.removeGroup, (_e, id: string) => removeGroup(id))
  ipcMain.handle(IpcChannels.contacts.importFile, () => pickAndImportContacts())
  ipcMain.handle(IpcChannels.contacts.exportFile, () => exportContacts())
}
