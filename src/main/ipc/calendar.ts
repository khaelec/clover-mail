import { ipcMain } from 'electron'
import { IpcChannels } from '@shared/channels'
import type { EventInput } from '@shared/calendar'
import {
  createCalendar,
  createEvent,
  deleteEvent,
  exportIcs,
  getEvent,
  importFromAttachment,
  importFromFile,
  listCalendars,
  listOccurrences,
  pickAndImport,
  updateEvent
} from '@main/calendar'

export function registerCalendarIpc(): void {
  ipcMain.handle(IpcChannels.calendar.listCalendars, () => listCalendars())
  ipcMain.handle(IpcChannels.calendar.createCalendar, (_e, name: string, color?: string) =>
    createCalendar(name, color)
  )
  ipcMain.handle(IpcChannels.calendar.listOccurrences, (_e, startUtc: number, endUtc: number) =>
    listOccurrences(startUtc, endUtc)
  )
  ipcMain.handle(IpcChannels.calendar.getEvent, (_e, id: string) => getEvent(id))
  ipcMain.handle(IpcChannels.calendar.createEvent, (_e, input: EventInput) => createEvent(input))
  ipcMain.handle(IpcChannels.calendar.updateEvent, (_e, id: string, input: EventInput) =>
    updateEvent(id, input)
  )
  ipcMain.handle(IpcChannels.calendar.deleteEvent, (_e, id: string) => deleteEvent(id))
  ipcMain.handle(IpcChannels.calendar.importPath, (_e, path: string) => importFromFile(path))
  ipcMain.handle(IpcChannels.calendar.importAttachment, (_e, attachmentId: string) =>
    importFromAttachment(attachmentId)
  )
  ipcMain.handle(IpcChannels.calendar.pickAndImport, () => pickAndImport())
  ipcMain.handle(IpcChannels.calendar.exportIcs, (_e, calendarId?: string) => exportIcs(calendarId))
}
