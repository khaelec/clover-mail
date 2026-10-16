/** An address-book entry: saved by the user, or learned from mail. */
export interface Contact {
  id: string
  email: string
  name: string | null
  company: string | null
  phone: string | null
  notes: string | null
  /** In the address book (vs. only learned from mail for autocomplete). */
  isSaved: boolean
  sendCount: number
  recvCount: number
  lastUsed: number | null
}

export interface ContactInput {
  email: string
  name?: string | null
  company?: string | null
  phone?: string | null
  notes?: string | null
}

export interface ContactSuggestion {
  email: string
  name: string | null
  isSaved: boolean
  /** Set for a contact group: picking it adds every member. */
  group?: { id: string; members: string[] }
}

export interface ContactGroup {
  id: string
  name: string
  members: Contact[]
}

export interface ContactImportResult {
  imported: number
  updated: number
  skipped: number
}

export interface ContactsApi {
  /** `saved` = the address book only; `all` also lists addresses learned from mail. */
  list: (scope: 'saved' | 'all', query?: string) => Promise<Contact[]>
  suggest: (query: string, limit?: number) => Promise<ContactSuggestion[]>
  save: (input: ContactInput, id?: string) => Promise<Contact>
  remove: (id: string) => Promise<void>
  listGroups: () => Promise<ContactGroup[]>
  /** Create (no id) or update a group; members are contact ids. */
  saveGroup: (name: string, memberIds: string[], id?: string) => Promise<ContactGroup>
  removeGroup: (id: string) => Promise<void>
  importFile: () => Promise<ContactImportResult | null>
  exportFile: () => Promise<{ path: string; count: number } | null>
}
