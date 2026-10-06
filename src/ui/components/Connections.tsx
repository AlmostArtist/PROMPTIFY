import { ProviderInsights, TokenStats } from './ProviderInsights';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadAiProvider, saveAiProvider, requestConnections, PROVIDER_LABELS, type AiProvider, type CliProvider, type ConnectionResult } from '@/lib/connections';

const BRAND: Record<CliProvider, { name: string; via: string; mark: string; login: string; logout: string }> = {
  codex: { name: 'ChatGPT', via: 'via Codex CLI', mark: '◎', login: 'codex login', logout: 'codex logout' },
  claude: { name: 'Claude', via: 'via Claude Code', mark: '✳', login: 'claude auth login', logout: 'claude auth logout' },
};

export function Connections({ onChange, onSettings, flash }: {
  onChange: () => void; onSettings: () => void; flash: (message: string, ok?: boolean) => void;
}) {
  const [provider, setProvider] = useState<AiProvider>('openrouter');
  const [result, setResult] = useState<ConnectionResult | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [loginPending, setLoginPending] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState<CliProvider | null>(null);
  const running = useRef(false);

  const refresh = useCallback(async () => {
    setBusy('status');
    setError('');
    try {
      const response = await requestConnections('status');
      setResult(response);
      if (!response.ok) setError(response.error || 'The companion did not respond.');
      return response;
    }
    finally { setBusy(''); }
  }, []);

  useEffect(() => {
    void loadAiProvider().then(setProvider);
    void refresh();
  }, [refresh]);

  const select = async (next: AiProvider) => {
    try { await saveAiProvider(next); setProvider(next); onChange(); flash(`Using ${PROVIDER_LABELS[next]}`); }
    catch { flash('Could not save your provider. Try again.', false); }
  };

  /** Run the CLI's own browser login, then confirm it took. */
  const runLogin = async (id: CliProvider): Promise<boolean> => {
    setLoginPending(true);
    const login = await requestConnections('login', id);
    setLoginPending(false);
    if (!login.ok) { setError(login.error || 'Login did not complete.'); return false; }
    const response = await requestConnections('status');
    setResult(response);
    if (!response.ok || !response.providers?.[id]?.authenticated) {
      setError(response.error || `${BRAND[id].name} is still signed out. Run “${BRAND[id].login}” in a terminal, then recheck.`);
      return false;
    }
    return true;
  };

  /** Sign in (or reuse an existing login) and make this account active. */
  const connect = async (id?: CliProvider) => {
    if (running.current) return;
    running.current = true;
    setBusy(id || 'status'); setError(''); setConfirmLogout(null);
    try {
      const response = await requestConnections('status');
      setResult(response);
      if (!response.ok) { setError(response.error || 'The companion did not respond.'); return; }
      if (!id) { onChange(); return; }
      const status = response.providers?.[id];
      if (!status?.installed) { setError(`Install ${id === 'codex' ? 'Codex CLI' : 'Claude Code'}, then try again.`); return; }
      if (!status.authenticated && !await runLogin(id)) return;
      await select(id);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      setError(`Could not connect: ${detail}. Reload PROMPTIFY at chrome://extensions, then reopen this panel.`);
    } finally { running.current = false; setBusy(''); setLoginPending(false); }
  };

  /** Sign the CLI out on this computer. With `then: 'login'`, sign straight back in (switch account). */
  const signOut = async (id: CliProvider, then?: 'login') => {
    if (running.current) return;
    running.current = true;
    setBusy(then ? `switch-${id}` : `logout-${id}`); setError(''); setConfirmLogout(null);
    try {
      const out = await requestConnections('logout', id);
      if (!out.ok) { setError(out.error || 'Sign-out did not complete.'); return; }
      const response = await requestConnections('status');
      setResult(response);
      flash(`Signed out of ${BRAND[id].name}`);
      if (then === 'login' && await runLogin(id)) {
        await select(id);
        flash(`Switched ${BRAND[id].name} account ✓`);
      }
      onChange();
    } finally { running.current = false; setBusy(''); setLoginPending(false); }
  };

  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); flash('Command copied'); }
    catch { flash('Could not copy. Select the command and copy it manually.', false); }
  };

  return <div className="pk-connections">

    <div className="pk-note"><p>Log in with your own ChatGPT or Claude account below. PROMPTIFY uses the official CLI on this computer — your password and tokens never touch the extension.</p></div>
    {error && <div className="pk-connection-error" role="alert"><strong>Connection needs attention</strong><p>{error}</p>{/reload/i.test(error) && <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => chrome.runtime.reload()}>Reload extension</button>}</div>}
    {busy && <p role="status" className="pk-notice">{loginPending ? 'Finish signing in in the browser window opened by the CLI…' : busy.startsWith('logout') || busy.startsWith('switch') ? 'Signing out…' : 'Checking your accounts…'}</p>}

    <div className="pk-provider-list">
      {(['codex', 'claude'] as const).map((id) => {
        const state = result?.providers?.[id];
        const ready = Boolean(state?.authenticated);
        const active = provider === id;
        const brand = BRAND[id];
        const statusLabel = ready ? 'Signed in' : state ? state.installed ? 'Signed out' : 'CLI not installed' : 'Not checked';
        const actions = confirmLogout === id
          ? <div className="pk-confirm" role="alertdialog" aria-label={`Log out of ${brand.name}`}>
              <p>Log out of {brand.name}? This signs out <code>{id === 'codex' ? 'codex' : 'claude'}</code> on this computer, including your terminal.</p>
              <div className="pk-button-row">
                <button className="p-btn p-btn-danger p-btn-sm" onClick={() => void signOut(id)}>Log out</button>
                <button className="p-btn p-btn-ghost p-btn-sm" onClick={() => setConfirmLogout(null)}>Cancel</button>
              </div>
            </div>
          : ready
            ? <>
                <button className="p-btn p-btn-primary p-btn-sm" disabled={Boolean(busy) || active} onClick={() => void select(id)}>
                  {active ? '✓ Active account' : 'Use this account'}
                </button>
                <button className="p-btn p-btn-ghost p-btn-sm" disabled={Boolean(busy)} onClick={() => void signOut(id, 'login')}>
                  {busy === `switch-${id}` ? loginPending ? 'Finish sign-in…' : 'Switching…' : 'Switch account'}
                </button>
                <button className="p-btn p-btn-ghost p-btn-sm pk-logout" disabled={Boolean(busy)} onClick={() => setConfirmLogout(id)}>
                  {busy === `logout-${id}` ? 'Logging out…' : 'Log out'}
                </button>
              </>
            : <>
                <button className="p-btn p-btn-primary p-btn-sm" disabled={Boolean(busy) || state?.installed === false} onClick={() => void connect(id)}>
                  {busy === id ? loginPending ? 'Finish sign-in…' : 'Connecting…' : `Log in with ${brand.name}`}
                </button>
                <a className="pk-text-link" href={id === 'codex' ? 'https://chatgpt.com/' : 'https://claude.ai/'} target="_blank" rel="noreferrer">Open web app ↗</a>
              </>;
        return <article className="pk-provider" data-active={active} data-provider={id} data-ready={ready} key={id}>
          <div className="pk-provider-heading">
            <span className={`pk-provider-mark pk-provider-${id}`} aria-hidden="true">{brand.mark}</span>
            <div><h3>{brand.name}</h3><p>{brand.via}{active ? ' · active' : ''}</p></div>
            <span className="pk-status" data-ready={ready}><i aria-hidden="true" />{statusLabel}</span>
          </div>
          <ProviderInsights provider={id} ready={ready} onChange={onChange} version={state?.version} actions={actions} />
          {state?.error && <p className="pk-muted">{state.error}</p>}
        </article>;
      })}

      <article className="pk-provider" data-active={provider === 'openrouter'} data-provider="openrouter" data-ready="true">
        <div className="pk-provider-heading"><span className="pk-provider-mark" aria-hidden="true">↗</span><div><h3>OpenRouter</h3><p>API key · free models · text + images</p></div><span className="pk-status" data-ready={provider === 'openrouter'}><i aria-hidden="true" />{provider === 'openrouter' ? 'Active' : 'Available'}</span></div>
        <p className="pk-provider-description">Free models with your own OpenRouter key. Also powers Vision when you pick it there.</p>
        <div className="pk-button-row"><button className="p-btn p-btn-primary p-btn-sm" disabled={provider === 'openrouter'} onClick={() => void select('openrouter')}>{provider === 'openrouter' ? '✓ Active account' : 'Use OpenRouter'}</button><button className="pk-text-link" onClick={onSettings}>Manage API key →</button></div>
        <TokenStats provider="openrouter" />
      </article>
    </div>

    <section className="pk-companion">
      <div className="pk-row"><h3>Local companion</h3><span className="pk-status" data-ready={result?.ok}><i aria-hidden="true" />{result?.ok ? 'Connected' : 'Setup required'}</span></div>
      <p>Talks to the official CLIs on this computer. Credentials stay in their own login stores. macOS and Linux supported.</p>
      <div className="pk-button-row"><button className="p-btn p-btn-ghost p-btn-sm" disabled={Boolean(busy)} onClick={() => void connect()}>{busy === 'status' ? 'Checking…' : 'Recheck connection'}</button>
        <button className="pk-text-link" onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html#connections') })}>Open setup in a tab ↗</button>
      </div>
      <details open={Boolean(error)}><summary>Setup instructions</summary>
        <ol className="pk-setup"><li>Install <a href="https://developers.openai.com/codex/cli" target="_blank" rel="noreferrer">Codex CLI</a> or <a href="https://code.claude.com/docs/en/setup" target="_blank" rel="noreferrer">Claude Code</a> and Node.js 20+.</li>
          <li>In the PROMPTIFY project folder, run:<div className="pk-command"><code>npm run companion:install -- {chrome.runtime.id}</code><button aria-label="Copy companion install command" onClick={() => void copy(`npm run companion:install -- ${chrome.runtime.id}`)}>Copy</button></div><p>Using Edge or Brave? Add <code>edge</code> or <code>brave</code> at the end.</p></li>
          <li>Click Log in with ChatGPT or Claude above. Existing CLI logins are detected automatically. You can also use a terminal:
            {[BRAND.codex.login, BRAND.claude.login, BRAND.codex.logout, BRAND.claude.logout].map((command) => <div className="pk-command" key={command}><code>{command}</code><button aria-label={`Copy ${command}`} onClick={() => void copy(command)}>Copy</button></div>)}
          </li><li>Recheck the connection and choose “Use this account”.</li></ol>
      </details>
    </section>
    <p className="pk-muted">Text and Vision use your selected account and models. Web-app sessions (chatgpt.com, claude.ai) and CLI logins are separate.</p>
  </div>;
}
