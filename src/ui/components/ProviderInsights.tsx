import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { loadCliModel, saveCliModel, requestConnections, type CliProvider, type ProviderTelemetry, type UsageWindow, type AiProvider, type CliAccount } from '@/lib/connections';
import { USAGE_KEY, type UsageStore } from '@/lib/token-usage';

const number = (n: number) => new Intl.NumberFormat(undefined, { notation: n >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
export function TokenStats({ provider }: { provider: AiProvider }) {
  const [store, setStore] = useState<UsageStore>({});
  useEffect(() => {
    let mounted = true;
    void chrome.storage.local.get(USAGE_KEY).then(data => { if (mounted) setStore(data[USAGE_KEY] || {}); });
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes[USAGE_KEY]) setStore(changes[USAGE_KEY].newValue || {});
    };
    chrome.storage.onChanged.addListener(listener);
    return () => { mounted = false; chrome.storage.onChanged.removeListener(listener); };
  }, []);
  const total = store[provider];
  return <details className="pk-token-stats">
    <summary><span>PROMPTIFY tokens</span><strong>{total && total.requests > total.unreported ? number(total.input + total.output) : '—'} <span aria-hidden="true">↗</span></strong></summary>
    {total ? <>
      <dl className="pk-token-grid">{[['Input', total.input], ['Output', total.output], ['Cached input', total.cachedInput], ['Cache writes', total.cacheWrite]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd title={String(value)}>{number(Number(value))}</dd></div>)}</dl>
      {total.input + total.output > 0 && <figure className="pk-token-chart" aria-label={`Token distribution: ${total.input} input, ${total.output} output`}>
        <div className="pk-token-stack" aria-hidden="true"><span style={{ width: `${total.input / (total.input + total.output) * 100}%` }} /><span style={{ width: `${total.output / (total.input + total.output) * 100}%` }} /></div>
        <figcaption><span>Input {Math.round(total.input / (total.input + total.output) * 100)}%</span><span>Output {Math.round(total.output / (total.input + total.output) * 100)}%</span></figcaption>
      </figure>}
      <p>{total.requests} requests · since {new Date(total.since).toLocaleDateString()}{total.unreported > 0 ? ` · ${total.unreported} unreported` : ''}</p>
      <p>Local usage only · cached tokens included in input</p>
    </> : <p>No tracked requests yet · this browser only</p>}
    {total && <span className="pk-muted" title="Completed PROMPTIFY requests on this browser. These totals do not represent your subscription limit or account-wide usage.">Scope: this browser ⓘ</span>}
  </details>;
}

function countdown(reset: number | null, now: number): string {
  if (!reset) return 'Reset time unavailable';
  const minutes = Math.ceil((reset - now) / 60000);
  if (minutes <= 0) return 'Reset due · refresh needed';
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), mins = minutes % 60;
  return `Resets in ${days ? `${days}d ` : ''}${hours ? `${hours}h ` : ''}${mins}m`;
}
function LimitMeter({ window, now, stale }: { window: UsageWindow; now: number; stale: boolean }) {
  const expired = Boolean(window.resetsAt && window.resetsAt <= now);
  const value = Math.round(window.usedPercent * 10) / 10;
  return <div className="pk-limit" data-warning={value >= 80} data-stale={stale || expired}>
    <div className="pk-row"><span>{window.label}</span><strong>{value}% <small>{stale || expired ? 'last reported' : 'used'}</small></strong></div>
    <div className="pk-limit-track" role="progressbar" aria-label={`${window.label}${stale || expired ? ' (last reported)' : ''}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><span style={{ width: `${value}%` }} /></div>
    <div className="pk-row pk-limit-caption"><span title={window.resetsAt ? new Date(window.resetsAt).toLocaleString() : undefined}>{countdown(window.resetsAt, now)}</span><span>{expired || stale ? 'Awaiting update' : `${Math.round((100 - value) * 10) / 10}% left`}</span></div>
  </div>;
}

function initials(account?: CliAccount): string {
  const name = account?.email?.split('@')[0] ?? '';
  const parts = name.split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '◉';
}

/** The signed-in CLI account: always-visible identity, plan and login details, plus the card's actions. */
function AccountDetails({ account, ready, loading, version, actions }: {
  account?: CliAccount; ready: boolean; loading: boolean; version?: string; actions?: ReactNode;
}) {
  const rawPlan = account?.plan?.replaceAll('_', ' ');
  const plan = rawPlan ? rawPlan[0].toUpperCase() + rawPlan.slice(1) : undefined;
  const facts = [
    ['Plan', plan],
    ['Login', account?.method],
    ['Organization', account?.organization],
    ['API', account?.apiProvider === 'firstParty' ? 'Anthropic' : account?.apiProvider],
    ['CLI', version ? `v${version}` : undefined],
  ].filter(([, value]) => value) as [string, string][];
  return <div className="pk-account-identity" data-ready={ready}>
    <div className="pk-identity-top">
      <div className="pk-identity-avatar" aria-hidden="true"><span>{ready ? initials(account) : '?'}</span></div>
      <div className="pk-identity-body">
        <span className="pk-account-label">{ready ? 'Signed in as' : 'Not signed in'}</span>
        <strong className="pk-account-email">{account?.email || (ready ? loading ? 'Reading account…' : 'Email not reported by CLI' : 'Log in to use your own account')}</strong>
        {ready && plan && <span className="pk-plan-badge">{plan}</span>}
      </div>
    </div>
    {ready && facts.length > 0 && <dl className="pk-account-facts">
      {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd title={value}>{value}</dd></div>)}
    </dl>}
    {ready && !account && !loading && <p className="pk-muted">The CLI didn’t report account details. Refresh to try again.</p>}
    {actions && <div className="pk-account-actions">{actions}</div>}
  </div>;
}

export function ProviderInsights({ provider, ready, onChange, version, actions }: { provider: CliProvider; ready: boolean; onChange: () => void; version?: string; actions?: ReactNode }) {
  const [model, setModel] = useState('');
  const [visionModel, setVisionModel] = useState('');
  const [data, setData] = useState<ProviderTelemetry>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [now, setNow] = useState(Date.now());
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setLoading(true);
    try {
      const response = await requestConnections('telemetry', provider);
      if (!mounted.current) return;
      if (response.ok && response.telemetry) { setData(response.telemetry); setError(''); }
      else setError(response.error === 'Unknown companion action.' ? 'Update the local companion using Setup instructions below, then refresh.' : response.error || 'Usage unavailable. Update the local companion, then refresh.');
    } finally { inFlight.current = false; if (mounted.current) setLoading(false); }
  }, [provider]);
  useEffect(() => {
    mounted.current = true;
    void loadCliModel(provider).then(value => { if (mounted.current) setModel(value); });
    void chrome.storage.local.get(`pf_cli_vision_model_${provider}`).then(value => { if (mounted.current) setVisionModel(value[`pf_cli_vision_model_${provider}`] || ''); });
    return () => { mounted.current = false; };
  }, [provider]);
  useEffect(() => {
    if (!ready) { setData(undefined); return; }
    void refresh();
    const poll = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [ready, refresh]);
  const changeModel = async (next: string, purpose: 'text' | 'vision' = 'text') => {
    setSaving(true); setSaveError('');
    try { await saveCliModel(provider, next, purpose); if (purpose === 'text') setModel(next); else setVisionModel(next); onChange(); }
    catch { setSaveError('Could not save this model. Try again.'); }
    finally { setSaving(false); }
  };
  const selection = data?.models.find(item => item.id === model);
  const defaultModel = data?.models.find(item => item.isDefault);
  const family = /astra/i.test(model) ? 'astra' : /sonnet/i.test(model) ? 'sonnet' : /opus|fable/i.test(model) ? 'opus' : /haiku|luna/i.test(model) ? 'light' : 'default';
  const stale = Boolean(error || data && now - data.fetchedAt > 120000);
  const hasFiveHour = data?.limits.some(window => window.windowMinutes === 300);
  return <div className="pk-provider-insights" data-family={family}>
    <AccountDetails account={ready ? data?.account : undefined} ready={ready} loading={loading} version={version} actions={actions} />
    <div className="pk-model-label"><label htmlFor={`model-${provider}`}>Text model</label><span>{data?.models.length ? `${data.models.length} available` : ready ? loading ? 'Loading catalog…' : 'CLI default' : 'Connect to discover'}</span></div>
    <select id={`model-${provider}`} className="pk-model-select" value={model} disabled={!ready || saving} onChange={event => void changeModel(event.target.value)}>
      <option value="">Automatic{defaultModel ? ` · ${defaultModel.label}` : ' · CLI default'}</option>
      {model && !selection && <option value={model}>{model} · {data ? 'not in current catalog' : 'saved'}</option>}
      {data?.models.filter(item => item.id !== 'default').map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      {model === 'default' && selection && <option value="default">Default (recommended)</option>}
    </select>
    <p className="pk-model-description">{model && !selection && data ? 'This saved model is no longer listed. Choose an available model before your next request.' : selection?.description || defaultModel?.description || 'The selected model will be used for your next text request.'}</p>
    <div className="pk-model-label"><label htmlFor={`vision-model-${provider}`}>Vision model</label><span>Screenshots & images</span></div>
    <select id={`vision-model-${provider}`} className="pk-model-select" value={visionModel} disabled={!ready || saving} onChange={event => void changeModel(event.target.value, 'vision')}>
      <option value="">Use text model{selection ? ` · ${selection.label}` : ''}</option>
      {visionModel && !data?.models.some(item => item.id === visionModel) && <option value={visionModel}>{visionModel} · saved</option>}
      {data?.models.filter(item => item.id !== 'default').map(item => <option key={item.id} value={item.id} disabled={item.supportsVision === false}>{item.label}{item.supportsVision === false ? ' · text only' : ''}</option>)}
    </select>
    <p className="pk-model-description">{!visionModel && selection?.supportsVision === false ? 'Your text model does not accept images. Choose a vision model above.' : 'Used for screenshot analysis, Prompt DNA, and image-to-prompt tools.'}</p>
    {saveError && <p className="pk-insight-error" role="alert">{saveError}</p>}
    <div className="pk-usage-heading"><span>Account limits</span><button className="pk-text-link" disabled={!ready || loading} onClick={() => void refresh()} aria-label={`Refresh ${provider === 'codex' ? 'ChatGPT' : 'Claude'} usage`}>{loading ? 'Refreshing…' : '↻ Refresh'}</button></div>
    {!hasFiveHour && <div className="pk-limit-empty"><span>5-hour limit</span><strong>—</strong><p>{!ready ? 'Connect your account to see live limits.' : loading && !data ? 'Reading usage from your CLI…' : 'Not reported by this account or CLI.'}</p></div>}
    {data?.limits.map(window => <LimitMeter key={window.id} window={window} now={now} stale={stale} />)}
    {(error || data?.modelsError || data?.limitsError) && <p className="pk-insight-error" role="status">{error || [data?.modelsError, data?.limitsError].filter(Boolean).join(' ')}</p>}
    {data && <p className="pk-usage-updated">{stale ? 'Last known usage' : 'Account-wide usage'} · updated {new Date(data.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}
    <TokenStats provider={provider} />
  </div>;
}
