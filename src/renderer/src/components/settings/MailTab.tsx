import type { ReactNode } from 'react'
import { SETTINGS_KEYS } from '@shared/theme'
import { useSettings } from './context'
import { Card, Field } from './ui'
import { IconSignature } from '../icons'
import { linkifyElement } from '../../lib/linkify'

export function MailTab(): ReactNode {
  const {
    dictationEnabled,
    setDictationEnabled,
    importBusy,
    runImportMbox,
    importMsg,
    accounts,
    sigAccountId,
    setSigAccountId,
    sigFileRef,
    onSigImage,
    sigEnabled,
    setSigEnabled,
    applySignatureTemplate,
    execSig,
    sigLink,
    sigEditorRef,
    saveSignature,
    sigMsg,
    aliasAccountId,
    setAliasAccountId,
    aliasList,
    aliasDefault,
    makeDefaultFrom,
    removeAliasEntry,
    aliasEmail,
    setAliasEmail,
    aliasName,
    setAliasName,
    addAliasEntry,
    snippetList,
    removeSnippetEntry,
    snippetName,
    setSnippetName,
    snippetBody,
    setSnippetBody,
    addSnippetEntry
  } = useSettings()

  return (
    <>
      <Card title="Dictation">
        <button
          type="button"
          onClick={() => {
            const next = !dictationEnabled
            setDictationEnabled(next)
            void window.clover.settings.set(SETTINGS_KEYS.dictationEnabled, next)
          }}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <span>
            <span className="block text-[13px] text-ink">Dictate replies by voice</span>
            <span className="mt-0.5 block text-[12px] text-muted">
              Adds a Dictate button to the compose window that turns speech into text using the
              Windows offline speech engine. Audio never leaves your computer. Off by default.
            </span>
          </span>
          <span
            className={
              'relative h-6 w-11 shrink-0 rounded-full transition-colors ' +
              (dictationEnabled ? 'bg-accent' : 'bg-line')
            }
          >
            <span
              className={
                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ' +
                (dictationEnabled ? 'left-[22px]' : 'left-0.5')
              }
            />
          </span>
        </button>
      </Card>

      <Card title="Import mail">
        <p className="text-[12px] text-muted">
          Import messages from an .mbox file (Thunderbird, Apple Mail, Gmail Takeout, …) into a
          local &ldquo;Imported Mail&rdquo; account. Original .pst files aren&apos;t supported.
        </p>
        <button
          type="button"
          disabled={importBusy}
          onClick={() => void runImportMbox()}
          className="mt-3 rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink disabled:opacity-50"
        >
          {importBusy ? 'Importing…' : 'Import .mbox file'}
        </button>
        {importMsg && <p className="mt-2 text-[12px] text-muted">{importMsg}</p>}
      </Card>

      <Card title="Signature">
        <div className="space-y-3">
          {accounts.length === 0 ? (
            <p className="text-[12px] text-muted">Add a mail account first to set a signature.</p>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">Account</span>
                <select
                  value={sigAccountId}
                  onChange={(e) => setSigAccountId(e.target.value)}
                  className="w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => sigFileRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-ink"
                >
                  <IconSignature className="h-3.5 w-3.5" />
                  Insert picture
                </button>
                <input ref={sigFileRef} type="file" accept="image/*" hidden onChange={onSigImage} />
                <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted">
                  <input
                    type="checkbox"
                    checked={sigEnabled}
                    onChange={(e) => setSigEnabled(e.target.checked)}
                  />
                  Add to new mail
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                <span>Start from:</span>
                <button
                  type="button"
                  onClick={() => applySignatureTemplate('simple')}
                  className="rounded-md border border-line px-2 py-0.5 hover:text-accent"
                >
                  Simple
                </button>
                <button
                  type="button"
                  onClick={() => applySignatureTemplate('role')}
                  className="rounded-md border border-line px-2 py-0.5 hover:text-accent"
                >
                  With role
                </button>
                <button
                  type="button"
                  onClick={() => applySignatureTemplate('contact')}
                  className="rounded-md border border-line px-2 py-0.5 hover:text-accent"
                >
                  With divider
                </button>
              </div>
              <div className="flex items-center gap-0.5 rounded-t-lg border border-b-0 border-line bg-canvas/40 px-1 py-1">
                {[
                  { label: 'B', cmd: 'bold', cls: 'font-bold' },
                  { label: 'I', cmd: 'italic', cls: 'italic' },
                  { label: 'U', cmd: 'underline', cls: 'underline' },
                  { label: '•', cmd: 'insertUnorderedList', cls: '' },
                  { label: '1.', cmd: 'insertOrderedList', cls: '' },
                  { label: '⌫', cmd: 'removeFormat', cls: '' }
                ].map((b) => (
                  <button
                    key={b.cmd}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => execSig(b.cmd)}
                    className={
                      'grid h-6 min-w-6 place-items-center rounded px-1 text-[12px] text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10 ' +
                      b.cls
                    }
                  >
                    {b.label}
                  </button>
                ))}
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => execSig('insertHorizontalRule')}
                  title="Divider line"
                  className="grid h-6 min-w-6 place-items-center rounded px-1 text-[12px] text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
                >
                  ―
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={sigLink}
                  className="grid h-6 min-w-6 place-items-center rounded px-1 text-[12px] text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
                >
                  🔗
                </button>
              </div>
              <div
                ref={sigEditorRef}
                contentEditable
                suppressContentEditableWarning
                onBlur={() => {
                  const editor = sigEditorRef.current
                  if (editor) linkifyElement(editor)
                }}
                className="sig-editor min-h-[110px] rounded-b-lg border border-line bg-canvas/50 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void saveSignature()}
                  className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink"
                >
                  Save signature
                </button>
                {sigMsg && <span className="text-[12px] text-accent">{sigMsg}</span>}
              </div>
              <p className="text-[11px] text-muted">
                Pictures are embedded into outgoing messages automatically.
              </p>
            </>
          )}
        </div>
      </Card>

      <Card title="Send-as aliases">
        <div className="space-y-3">
          {accounts.length === 0 ? (
            <p className="text-[12px] text-muted">Add a mail account first.</p>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-muted">Account</span>
                <select
                  value={aliasAccountId}
                  onChange={(e) => setAliasAccountId(e.target.value)}
                  className="w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email}
                    </option>
                  ))}
                </select>
              </label>

              {(() => {
                const primaryEmail = accounts.find((a) => a.id === aliasAccountId)?.email ?? ''
                const rows = [
                  { id: '__primary__', name: null as string | null, email: primaryEmail },
                  ...aliasList.map((a) => ({ id: a.id, name: a.name, email: a.email }))
                ].filter((row) => row.email)
                return (
                  <ul className="space-y-1.5">
                    {rows.map((row) => {
                      const isDefault = (aliasDefault ?? primaryEmail) === row.email
                      return (
                        <li
                          key={row.id}
                          className="flex items-center gap-2 rounded-lg border border-line bg-canvas/40 px-3 py-1.5 text-[13px] text-ink"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {row.name ? `${row.name} ` : ''}
                            <span className="text-muted">&lt;{row.email}&gt;</span>
                          </span>
                          {isDefault ? (
                            <span className="shrink-0 text-[11px] font-medium text-accent">Default</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void makeDefaultFrom(row.email)}
                              className="shrink-0 text-[11px] text-muted hover:text-accent"
                            >
                              Make default
                            </button>
                          )}
                          {row.id !== '__primary__' && (
                            <button
                              type="button"
                              onClick={() => void removeAliasEntry(row.id)}
                              className="shrink-0 text-muted hover:text-rose-500"
                            >
                              Remove
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )
              })()}

              <div className="flex flex-wrap items-end gap-2">
                <Field label="Alias email" value={aliasEmail} onChange={setAliasEmail} placeholder="sales@yourdomain.com" hint="An address you can send from on this account. Your provider must allow sending as it (e.g. a Gmail ‘Send mail as’ alias)." />
                <Field label="Name (optional)" value={aliasName} onChange={setAliasName} placeholder="Sales" hint="Display name shown on the From line for this alias." />
                <button
                  type="button"
                  onClick={() => void addAliasEntry()}
                  className="mb-0.5 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-ink"
                >
                  Add
                </button>
              </div>
              <p className="text-[11px] text-muted">
                Aliases appear in the composer&apos;s “From” menu. Mark one as Default to send as it
                automatically. Make sure your provider allows sending as them.
              </p>
            </>
          )}
        </div>
      </Card>

      <Card title="Snippets">
        <div className="space-y-3">
          {snippetList.length > 0 && (
            <ul className="space-y-1.5">
              {snippetList.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded-lg border border-line bg-canvas/40 px-3 py-1.5 text-[13px] text-ink"
                >
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <button
                    type="button"
                    onClick={() => void removeSnippetEntry(s.id)}
                    className="text-muted hover:text-rose-500"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Field label="Name" value={snippetName} onChange={setSnippetName} placeholder="e.g. Meeting follow-up" />
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium text-muted">Text / HTML</span>
            <textarea
              value={snippetBody}
              onChange={(e) => setSnippetBody(e.target.value)}
              className="min-h-[80px] w-full rounded-lg border border-line bg-canvas/60 px-3 py-2 text-[13px] text-ink outline-none focus:border-accent"
            />
          </label>
          <button
            type="button"
            onClick={() => void addSnippetEntry()}
            className="rounded-lg bg-accent px-3.5 py-2 text-[12px] font-semibold text-accent-ink"
          >
            Add snippet
          </button>
          <p className="text-[11px] text-muted">Insert snippets from the composer&apos;s Snippet menu.</p>
        </div>
      </Card>
    </>
  )
}
