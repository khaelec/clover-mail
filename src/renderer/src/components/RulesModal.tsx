import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMail } from '../state/mail'
import { useFocusTrap } from '../lib/useFocusTrap'
import type { Rule, RuleActionInput, RuleActionType, RuleConditionInput, RuleField, RuleOp } from '@shared/mail'
import { IconClose, IconPlus, IconRefresh, IconTrash } from './icons'

const FIELDS: { value: RuleField; label: string }[] = [
  { value: 'from', label: 'From' },
  { value: 'to', label: 'To / Cc' },
  { value: 'subject', label: 'Subject' },
  { value: 'body', label: 'Body (cached)' },
  { value: 'hasAttachment', label: 'Has attachment' }
]

const OPS: { value: RuleOp; label: string }[] = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' }
]

const ACTIONS: { value: RuleActionType; label: string }[] = [
  { value: 'move', label: 'Move to folder' },
  { value: 'markRead', label: 'Mark as read' },
  { value: 'markFlagged', label: 'Star it' },
  { value: 'markSpam', label: 'Mark as spam' },
  { value: 'trash', label: 'Move to Trash' }
]

const selectClass =
  'rounded-lg border border-line bg-canvas/60 px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent'
const inputClass =
  'flex-1 rounded-lg border border-line bg-canvas/60 px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-accent'

function summarize(rule: Rule): string {
  const cond = rule.conditions
    .map((c) => `${c.field} ${c.op} “${c.value}”`)
    .join(rule.matchAll ? ' and ' : ' or ')
  const act = rule.actions.map((a) => a.action).join(', ')
  return `${cond} → ${act}`
}

export function RulesModal({ onClose }: { onClose: () => void }): ReactNode {
  const rules = useMail((s) => s.rules)
  const folders = useMail((s) => s.folders)
  const loadRules = useMail((s) => s.loadRules)
  const saveRule = useMail((s) => s.saveRule)
  const removeRule = useMail((s) => s.removeRule)
  const applyRulesNow = useMail((s) => s.applyRulesNow)

  const [name, setName] = useState('')
  const [matchAll, setMatchAll] = useState(true)
  const [conditions, setConditions] = useState<RuleConditionInput[]>([{ field: 'from', op: 'contains', value: '' }])
  const [actions, setActions] = useState<RuleActionInput[]>([{ action: 'move', value: undefined }])
  const [message, setMessage] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, onClose)

  useEffect(() => {
    void loadRules()
  }, [loadRules])

  function updateCondition(index: number, patch: Partial<RuleConditionInput>): void {
    setConditions(conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }
  function updateAction(index: number, patch: Partial<RuleActionInput>): void {
    setActions(actions.map((a, i) => (i === index ? { ...a, ...patch } : a)))
  }

  async function save(): Promise<void> {
    if (!name.trim() || conditions.length === 0 || actions.length === 0) {
      setMessage('Give the rule a name, a condition, and an action.')
      return
    }
    await saveRule({ name: name.trim(), isEnabled: true, matchAll, stopProcessing: false, conditions, actions })
    setName('')
    setConditions([{ field: 'from', op: 'contains', value: '' }])
    setActions([{ action: 'move', value: undefined }])
    setMessage('Rule saved.')
  }

  async function run(): Promise<void> {
    setMessage('Applying…')
    const result = await applyRulesNow()
    setMessage(`Applied: ${result.matched} matched, ${result.moved} moved.`)
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Rules and workflow"
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm"
    >
      <div className="animate-fade-in flex max-h-[84vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Rules & workflow</h2>
            <p className="text-[11px] text-muted">Automatically sort incoming mail into folders.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={run}
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] text-muted hover:text-accent"
            >
              <IconRefresh className="h-3.5 w-3.5" />
              Apply now
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
            >
              <IconClose />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {rules.length === 0 && <p className="text-[12px] text-muted">No rules yet.</p>}
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center gap-2 rounded-xl border border-line bg-canvas/40 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">{rule.name}</div>
                  <div className="truncate text-[11px] text-muted">{summarize(rule)}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void removeRule(rule.id)}
                  className="grid h-7 w-7 place-items-center rounded-md text-muted hover:text-rose-500"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-line p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">New rule</div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rule name" className={inputClass + ' w-full'} />

            <div className="mt-3 space-y-2">
              {conditions.map((condition, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-10 text-[11px] text-muted">{index === 0 ? 'If' : matchAll ? 'and' : 'or'}</span>
                  <select
                    value={condition.field}
                    onChange={(e) => updateCondition(index, { field: e.target.value as RuleField })}
                    className={selectClass}
                  >
                    {FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  {condition.field !== 'hasAttachment' && (
                    <>
                      <select
                        value={condition.op}
                        onChange={(e) => updateCondition(index, { op: e.target.value as RuleOp })}
                        className={selectClass}
                      >
                        {OPS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={condition.value}
                        onChange={(e) => updateCondition(index, { value: e.target.value })}
                        placeholder="value"
                        className={inputClass}
                      />
                    </>
                  )}
                  {conditions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setConditions(conditions.filter((_, i) => i !== index))}
                      className="text-muted hover:text-rose-500"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-3 pl-12">
                <button
                  type="button"
                  onClick={() => setConditions([...conditions, { field: 'subject', op: 'contains', value: '' }])}
                  className="flex items-center gap-1 text-[11px] text-muted hover:text-accent"
                >
                  <IconPlus className="h-3 w-3" /> Add condition
                </button>
                <button
                  type="button"
                  onClick={() => setMatchAll(!matchAll)}
                  className="text-[11px] text-muted hover:text-accent"
                >
                  Match: {matchAll ? 'all' : 'any'}
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-2 border-t border-line pt-3">
              {actions.map((action, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-10 text-[11px] text-muted">Then</span>
                  <select
                    value={action.action}
                    onChange={(e) => updateAction(index, { action: e.target.value as RuleActionType, value: undefined })}
                    className={selectClass}
                  >
                    {ACTIONS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  {action.action === 'move' && (
                    <select
                      value={action.value ?? ''}
                      onChange={(e) => updateAction(index, { value: e.target.value })}
                      className={selectClass + ' flex-1'}
                    >
                      <option value="">Choose folder…</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {actions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setActions(actions.filter((_, i) => i !== index))}
                      className="text-muted hover:text-rose-500"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <div className="pl-12">
                <button
                  type="button"
                  onClick={() => setActions([...actions, { action: 'markRead' }])}
                  className="flex items-center gap-1 text-[11px] text-muted hover:text-accent"
                >
                  <IconPlus className="h-3 w-3" /> Add action
                </button>
              </div>
            </div>
          </div>

          {message && <div className="mt-3 text-[12px] text-muted">{message}</div>}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3.5 py-2 text-[13px] text-muted hover:text-ink">
            Close
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-lg bg-accent px-4 py-2 text-[13px] font-semibold text-accent-ink"
          >
            Save rule
          </button>
        </footer>
      </div>
    </div>
  )
}
