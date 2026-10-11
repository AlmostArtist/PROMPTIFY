import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SavedPrompt } from '@/engine/types';
import {
  addSavedPrompt,
  ensureDefaultPrompts,
  loadHumanTone,
  removeSavedPrompt,
  saveHumanTone,
  updateSavedPrompt,
} from '@/lib/storage';
import { withHumanTone } from '@/data/humanTone';
import { fillPromptVariables, PROMPT_CATEGORIES, PROMPT_STARTERS, promptVariables } from '@/data/promptTemplates';

interface SavedPromptsProps {
  setPrompt: (text: string) => Promise<boolean>;
  onBurst?: () => void;
  flash: (msg: string) => void;
}

interface Draft { label: string; content: string; category: string; template: boolean }
const EMPTY: Draft = { label: '', content: '', category: 'General', template: false };

/**
 * Prompts tab — a minimal library. A slim toolbar (search · New · human voice),
 * category chips, compact rows, and an inline save sheet with template
 * starters. Templates with [VARIABLES] ask for values before inserting.
 */
export function SavedPrompts({ setPrompt, onBurst, flash }: SavedPromptsProps) {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [humanTone, setHumanTone] = useState(false);
  const [sheet, setSheet] = useState<{ id: string | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [starter, setStarter] = useState('blank');
  const [filling, setFilling] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => { setPrompts(await ensureDefaultPrompts()); }, []);
  useEffect(() => { void refresh(); void loadHumanTone().then(setHumanTone); }, [refresh]);
  useEffect(() => { if (sheet) nameRef.current?.focus(); }, [sheet]);
  useEffect(() => {
    if (!confirmDelete) return;
    const t = window.setTimeout(() => setConfirmDelete(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const vars = useMemo(() => promptVariables(draft.content), [draft.content]);

  const openNew = () => { setDraft(EMPTY); setStarter('blank'); setSheet({ id: null }); setFilling(null); };
  const openEdit = (p: SavedPrompt) => {
    setDraft({ label: p.label, content: p.content, category: p.category ?? 'General', template: Boolean(p.template) });
    setStarter('');
    setSheet({ id: p.id });
    setFilling(null);
  };
  const closeSheet = () => { setSheet(null); setDraft(EMPTY); };

  const pickStarter = (id: string) => {
    const s = PROMPT_STARTERS.find((x) => x.id === id);
    if (!s) return;
    setStarter(id);
    setDraft((d) => ({
      label: d.label || (id === 'blank' ? '' : s.label),
      content: s.content,
      category: s.category,
      template: promptVariables(s.content).length > 0,
    }));
  };

  const save = async () => {
    const label = draft.label.trim(), content = draft.content.trim();
    if (!label || !content) return;
    const fields = { label, content, category: draft.category, template: draft.template };
    if (sheet?.id) {
      setPrompts(await updateSavedPrompt(sheet.id, fields));
      flash('Prompt updated');
    } else {
      setPrompts(await addSavedPrompt({ id: crypto.randomUUID?.() ?? `sp-${Date.now()}`, ts: Date.now(), ...fields }));
      flash(draft.template ? 'Template saved' : 'Prompt saved');
    }
    closeSheet();
  };

  const insert = async (text: string) => {
    const ok = await setPrompt(withHumanTone(text, humanTone));
    if (ok) { onBurst?.(); flash(humanTone ? 'Inserted with human voice' : 'Inserted into chat'); setFilling(null); }
    else flash('Focus a supported AI chat tab first.');
  };

  const open = (p: SavedPrompt) => {
    if (p.template && promptVariables(p.content).length) {
      setFilling(filling === p.id ? null : p.id);
      setValues({});
      return;
    }
    void insert(p.content);
  };

  const remove = async (id: string) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    setPrompts(await removeSavedPrompt(id));
    setConfirmDelete(null);
    flash('Prompt deleted');
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of prompts) { const k = p.category ?? 'General'; c[k] = (c[k] ?? 0) + 1; }
    return c;
  }, [prompts]);
  const chips = ['All', ...PROMPT_CATEGORIES.filter((c) => counts[c])];
  const q = query.toLowerCase();
  const filtered = prompts.filter((p) =>
    (category === 'All' || (p.category ?? 'General') === category) &&
    `${p.label} ${p.content}`.toLowerCase().includes(q));

  return (
    <div className="pk-sp">
      {/* Toolbar */}
      <div className="pk-sp-toolbar">
        <input type="search" className="p-input" aria-label="Search saved prompts" placeholder="Search prompts…"
          value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="p-btn p-btn-primary p-btn-sm" onClick={openNew} aria-expanded={Boolean(sheet && !sheet.id)}>
          + New
        </button>
      </div>
      <div className="pk-sp-meta">
        <span>{prompts.length} saved · type <kbd>//</kbd> in any chat to insert</span>
        <button type="button" className="pk-sp-voice" aria-pressed={humanTone}
          title="Prefix inserted prompts so the AI writes like a real person"
          onClick={() => { const v = !humanTone; setHumanTone(v); void saveHumanTone(v); }}>
          <i aria-hidden="true" /> Human voice
        </button>
      </div>

      {/* Save sheet */}
      {sheet && (
        <section className="pk-sp-sheet" aria-label={sheet.id ? 'Edit prompt' : 'Save a new prompt'}>
          <div className="pk-sp-sheet-head">
            <strong>{sheet.id ? 'Edit prompt' : 'Save a prompt'}</strong>
            <button type="button" className="pk-sp-x" onClick={closeSheet} aria-label="Close">✕</button>
          </div>

          {!sheet.id && (
            <div className="pk-sp-field">
              <span className="pk-sp-label">Start from</span>
              <div className="pk-sp-starters" role="radiogroup" aria-label="Template starter">
                {PROMPT_STARTERS.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={starter === s.id} onClick={() => pickStarter(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="pk-sp-field">
            <span className="pk-sp-label">Name</span>
            <input ref={nameRef} className="p-input" value={draft.label} maxLength={60} placeholder="e.g. Product launch tweet"
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />
          </label>

          <div className="pk-sp-field">
            <span className="pk-sp-label">Category</span>
            <div className="pk-sp-cats" role="radiogroup" aria-label="Category">
              {PROMPT_CATEGORIES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={draft.category === c}
                  onClick={() => setDraft((d) => ({ ...d, category: c }))}>{c}</button>
              ))}
            </div>
          </div>

          <label className="pk-sp-field">
            <span className="pk-sp-label">Prompt</span>
            <textarea className="p-input pf-scroll" rows={6} value={draft.content}
              placeholder="Write the prompt. Use [CAPITALS] for parts you'll fill in each time."
              onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value, template: d.template || promptVariables(e.target.value).length > 0 }))} />
          </label>

          {vars.length > 0 && (
            <div className="pk-sp-vars" aria-label="Detected variables">
              {vars.map((v) => <span key={v}>{v}</span>)}
            </div>
          )}

          <label className="pk-sp-check">
            <input type="checkbox" checked={draft.template} onChange={(e) => setDraft((d) => ({ ...d, template: e.target.checked }))} />
            <span>
              <strong>Save as reusable template</strong>
              <small>{vars.length ? `You'll fill ${vars.length} variable${vars.length === 1 ? '' : 's'} before inserting.` : 'Add [VARIABLES] to fill in each time you use it.'}</small>
            </span>
          </label>

          <div className="pk-sp-actions">
            <button type="button" className="p-btn p-btn-ghost p-btn-sm" onClick={closeSheet}>Cancel</button>
            <button type="button" className="p-btn p-btn-primary p-btn-sm" onClick={() => void save()}
              disabled={!draft.label.trim() || !draft.content.trim()}>
              {sheet.id ? 'Update' : draft.template ? 'Save template' : 'Save prompt'}
            </button>
          </div>
        </section>
      )}

      {/* Category chips */}
      {chips.length > 2 && (
        <div className="pk-sp-chips" role="group" aria-label="Filter by category">
          {chips.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}>
              {c}{c !== 'All' && <small>{counts[c]}</small>}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {prompts.length === 0 ? (
        <div className="pk-sp-empty">
          <strong>No saved prompts yet</strong>
          <span>Save one with <b>+ New</b>, or star a prompt in History.</span>
        </div>
      ) : filtered.length === 0 ? (
        <p className="pk-muted">No prompts match.</p>
      ) : (
        <ul className="pk-sp-list">
          {filtered.map((p) => {
            const pv = p.template ? promptVariables(p.content) : [];
            return (
              <li key={p.id} className="pk-sp-row" data-open={filling === p.id}>
                <button type="button" className="pk-sp-main" onClick={() => open(p)}
                  title={pv.length ? 'Fill in the variables, then insert' : 'Insert into the focused AI chat'}>
                  <span className="pk-sp-title">
                    <strong>{p.label}</strong>
                    {p.template && <em>Template</em>}
                  </span>
                  <span className="pk-sp-preview">{p.content}</span>
                  <span className="pk-sp-foot">
                    {p.category ?? 'General'}{pv.length ? ` · ${pv.length} variable${pv.length === 1 ? '' : 's'}` : ''}
                  </span>
                </button>
                <div className="pk-sp-tools">
                  <button type="button" aria-label={`Copy ${p.label}`} title="Copy"
                    onClick={() => { void navigator.clipboard?.writeText(withHumanTone(p.content, humanTone)); flash('Copied'); }}>
                    <Icon d="M8 8h11v13H8zM5 16H4V3h11v1" />
                  </button>
                  <button type="button" aria-label={`Edit ${p.label}`} title="Edit" onClick={() => openEdit(p)}>
                    <Icon d="m4 20 4-1 11-11-3-3L5 16l-1 4Z" />
                  </button>
                  <button type="button" aria-label={confirmDelete === p.id ? `Confirm delete ${p.label}` : `Delete ${p.label}`}
                    title={confirmDelete === p.id ? 'Click again to delete' : 'Delete'}
                    data-danger={confirmDelete === p.id} onClick={() => void remove(p.id)}>
                    {confirmDelete === p.id ? <span>Delete?</span> : <Icon d="M5 7h14M10 7V4h4v3m-7 0 1 13h8l1-13" />}
                  </button>
                </div>

                {filling === p.id && (
                  <div className="pk-sp-fill">
                    {pv.map((v) => (
                      <label key={v}>
                        <span>{v}</span>
                        <input className="p-input" value={values[v] ?? ''} placeholder={v.toLowerCase()}
                          onChange={(e) => setValues((x) => ({ ...x, [v]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === 'Enter') void insert(fillPromptVariables(p.content, values)); }} />
                      </label>
                    ))}
                    <div className="pk-sp-actions">
                      <button type="button" className="p-btn p-btn-ghost p-btn-sm" onClick={() => setFilling(null)}>Cancel</button>
                      <button type="button" className="p-btn p-btn-ghost p-btn-sm"
                        onClick={() => { void navigator.clipboard?.writeText(withHumanTone(fillPromptVariables(p.content, values), humanTone)); flash('Copied'); }}>
                        Copy
                      </button>
                      <button type="button" className="p-btn p-btn-primary p-btn-sm" onClick={() => void insert(fillPromptVariables(p.content, values))}>
                        Insert
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Exported helper: the side panel can call this to add a prompt from history. */
export async function savePromptFromHistory(label: string, content: string): Promise<SavedPrompt[]> {
  const prompt: SavedPrompt = {
    id: crypto.randomUUID?.() ?? `sp-${Date.now()}`,
    label,
    content,
    ts: Date.now(),
  };
  return addSavedPrompt(prompt);
}
