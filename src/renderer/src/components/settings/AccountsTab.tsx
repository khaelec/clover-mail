import type { ReactNode } from 'react'
import { useSettings } from './context'
import { Card, Field } from './ui'

export function AccountsTab(): ReactNode {
  const {
    googleClientId,
    setGoogleClientId,
    googleSecret,
    setGoogleSecret,
    googleMsg,
    saveGoogleConfig,
    msClientId,
    setMsClientId,
    msSecret,
    setMsSecret,
    msMsg,
    saveMicrosoftConfig
  } = useSettings()
  return (
    <Card title="OAuth clients (optional)">
      <div className="space-y-4">
        <div className="rounded-xl border border-line p-3">
          <div className="mb-1 text-[12px] font-medium text-ink">Google</div>
          <p className="mb-2 text-[11px] text-muted">
            Sign-in uses your own free Google OAuth client (Google requires every app to
            register one). One-time setup:
          </p>
          <ol className="mb-2 list-decimal space-y-0.5 pl-5 text-[11px] text-muted">
            <li>
              Open <code>console.cloud.google.com</code> and create a project.
            </li>
            <li>
              APIs &amp; Services → <strong>OAuth consent screen</strong> → External. Add the
              scope <code>https://mail.google.com/</code> and add your own address under{' '}
              <strong>Test users</strong>.
            </li>
            <li>
              Credentials → <strong>Create credentials</strong> → OAuth client ID → type{' '}
              <strong>Desktop app</strong>.
            </li>
            <li>Paste the Client ID below, Save, then use “Sign in with Google”.</li>
          </ol>
          <Field label="Client ID" value={googleClientId} onChange={setGoogleClientId} placeholder="xxxxx.apps.googleusercontent.com" hint="Google Cloud Console → Credentials → OAuth client ID (type: Desktop app). Enables “Sign in with Google” instead of an app password." />
          <div className="mt-2">
            <Field label="Client Secret (optional)" type="password" value={googleSecret} onChange={setGoogleSecret} hint="Only required for ‘Web application’ OAuth clients. Desktop clients use PKCE, so leave this blank." />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Prefer to skip OAuth? Add the account below with a Gmail <strong>app password</strong>{' '}
            instead.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={() => void saveGoogleConfig()} className="rounded-lg bg-accent px-3.5 py-2 text-[12px] font-semibold text-accent-ink">
              Save Google
            </button>
            {googleMsg && <span className="text-[11px] text-accent">{googleMsg}</span>}
          </div>
        </div>

        <div className="rounded-xl border border-line p-3">
          <div className="mb-1 text-[12px] font-medium text-ink">Microsoft / Outlook</div>
          <ol className="mb-2 list-decimal space-y-0.5 pl-5 text-[11px] text-muted">
            <li>
              Open <code>portal.azure.com</code> → Microsoft Entra ID →{' '}
              <strong>App registrations</strong> → New registration.
            </li>
            <li>
              Add a redirect URI under <strong>Mobile and desktop applications</strong>:{' '}
              <code>http://localhost</code>.
            </li>
            <li>Copy the Application (client) ID below and Save. No secret needed (public client).</li>
          </ol>
          <Field label="Application (client) ID" value={msClientId} onChange={setMsClientId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" hint="Azure/Entra → App registrations → Application (client) ID. Add a ‘Mobile and desktop applications’ redirect of http://localhost." />
          <div className="mt-2">
            <Field label="Client Secret (optional)" type="password" value={msSecret} onChange={setMsSecret} hint="Only needed if you made it a confidential client. Public clients don’t require a secret." />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={() => void saveMicrosoftConfig()} className="rounded-lg bg-accent px-3.5 py-2 text-[12px] font-semibold text-accent-ink">
              Save Microsoft
            </button>
            {msMsg && <span className="text-[11px] text-accent">{msMsg}</span>}
          </div>
        </div>
      </div>
    </Card>
  )
}
