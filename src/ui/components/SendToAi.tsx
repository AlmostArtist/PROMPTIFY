import { useEffect, useState } from 'react';
import { AI_HUBS, DEFAULT_ASK_ALL } from '@/lib/aiHubs';
import { sendToAi } from '@/lib/messages';
import { addSavedPrompt } from '@/lib/storage';

const QUICK = ['chatgpt', 'claude', 'gemini', 'deepseek', 'perplexity', 'grok'];

/** Shared hub prefs (edited in the AI Hub tab). */
export async function loadHubPrefs(): Promise<{ askAll: string[]; autoSend: boolean }> {
  const r = await chrome.storage.local.get(['pf_hub_askall', 'pf_hub_autosend']);
  const askAll = (r.pf_hub_askall as string[] | undefined)?.length ? (r.pf_hub_askall as string[]) : DEFAULT_ASK_ALL;
  return { askAll, autoSend: r.pf_hub_autosend === true };
}

/** Copy · Save · Send-to-AI action row for any generated prompt. */
export function PromptActions({
  text,
  label,
  flash,
}: {
  text: string;
  label: string;
  flash: (msg: string, ok?: boolean) => void;
}) {
  const [prefs, setPrefs] = useState<{ askAll: string[]; autoSend: boolean }>({ askAll: DEFAULT_ASK_ALL, autoSend: false });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void loadHubPrefs().then(setPrefs);
  }, []);

  const send = async (ids: string[]) => {
    const ok = await sendToAi(ids, text, prefs.autoSend);
    flash(ok ? `Opening ${ids.length === 1 ? AI_HUBS.find((h) => h.id === ids[0])?.name : `${ids.length} AIs`}…` : 'Could not open tabs', ok);
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="p-btn p-btn-primary p-btn-xs"
          onClick={() => { void navigator.clipboard?.writeText(text); flash('Copied ✓'); }}>
          Copy
        </button>
        <button type="button" className="p-btn p-btn-ghost p-btn-xs"
          onClick={async () => {
            await addSavedPrompt({ id: crypto.randomUUID(), label: label.slice(0, 60), content: text, ts: Date.now() });
            flash('Saved to Prompts ★');
          }}>
          Save ★
        </button>
        <button type="button" className="p-btn p-btn-ghost p-btn-xs" onClick={() => setOpen((o) => !o)}
          aria-expanded={open}>
          Send to AI {open ? '▴' : '▾'}
        </button>
      </div>
      {open && (
        <div className="p-animate-in" style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" className="p-btn p-btn-primary p-btn-xs" onClick={() => void send(prefs.askAll)}
            title={prefs.askAll.join(', ')}>
            Ask all ({prefs.askAll.length})
          </button>
          {QUICK.map((id) => {
            const hub = AI_HUBS.find((h) => h.id === id);
            if (!hub) return null;
            return (
              <button key={id} type="button" className="p-btn p-btn-ghost p-btn-xs" onClick={() => void send([id])}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: hub.color, flexShrink: 0 }} />
                {hub.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
