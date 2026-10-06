import { useCallback, useEffect, useState } from 'react';
import type { SavedPrompt } from '@/engine/types';
import {
  addSavedPrompt,
  ensureDefaultPrompts,
  loadHumanTone,
  removeSavedPrompt,
  saveHumanTone,
  updateSavedPrompt,
} from '@/lib/storage';
import { HUMAN_TONE_LABEL, withHumanTone } from '@/data/humanTone';
import { Toggle } from './primitives';

interface SavedPromptsProps {
  setPrompt: (text: string) => Promise<boolean>;
  onBurst?: () => void;
  flash: (msg: string) => void;
}

export function SavedPrompts({ setPrompt, onBurst, flash }: SavedPromptsProps) {
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [query, setQuery] = useState('');
  const [humanTone, setHumanTone] = useState(false);
  const [showCreator, setShowCreator] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ label: '', content: '' });

  const refresh = useCallback(async () => {
    setPrompts(await ensureDefaultPrompts());
  }, []);

  useEffect(() => {
    void refresh();
    void loadHumanTone().then(setHumanTone);
  }, [refresh]);

  const toggleHumanTone = useCallback((on: boolean) => {
    setHumanTone(on);
    void saveHumanTone(on);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!form.label.trim() || !form.content.trim()) return;
    const prompt: SavedPrompt = {
      id: crypto.randomUUID?.() ?? `sp-${Date.now()}`,
      label: form.label.trim(),
      content: form.content.trim(),
      ts: Date.now(),
    };
    setPrompts(await addSavedPrompt(prompt));
    setForm({ label: '', content: '' });
    setShowCreator(false);
    flash('Prompt saved ✓');
  }, [form, flash]);

  const handleUpdate = useCallback(async () => {
    if (!editingId || !form.label.trim() || !form.content.trim()) return;
    setPrompts(await updateSavedPrompt(editingId, { label: form.label.trim(), content: form.content.trim() }));
    setEditingId(null);
    setForm({ label: '', content: '' });
    flash('Prompt updated ✓');
  }, [editingId, form, flash]);

  const handleDelete = useCallback(async (id: string) => {
    setPrompts(await removeSavedPrompt(id));
    flash('Prompt deleted');
  }, [flash]);

  const insertPrompt = useCallback(async (text: string) => {
    const ok = await setPrompt(withHumanTone(text, humanTone));
    if (ok) {
      onBurst?.();
      flash(humanTone ? 'Inserted with human tone ✓' : 'Inserted into chat ✓');
    } else {
      flash('Focus a supported AI chat tab first.');
    }
  }, [setPrompt, onBurst, flash, humanTone]);

  const startEdit = useCallback((p: SavedPrompt) => {
    setEditingId(p.id);
    setForm({ label: p.label, content: p.content });
    setShowCreator(true);
  }, []);

  const filtered = prompts.filter((prompt) => `${prompt.label} ${prompt.content}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <input type="search" className="p-input pk-search" aria-label="Search saved prompts" placeholder="Find a saved prompt…" value={query} onChange={(event) => setQuery(event.target.value)} />
      {prompts.length > 0 && filtered.length === 0 && <p className="pk-muted">No prompts match your search.</p>}
      {/* Tip bar */}
      <div className="mb-3 rounded-xl border border-[var(--pf-border)] bg-[var(--pf-elev)] p-2.5 text-[10.5px] leading-snug text-[var(--pf-muted)]">
        Save your best prompts here. <span className="text-[var(--pf-fg)]">Type //</span> in the
        chat prompt to quickly insert one, or <span className="text-[var(--pf-fg)]">click any card</span> below.
      </div>

      {/* Human tone toggle */}
      <div className="mb-3 flex items-center justify-between rounded-xl border border-[var(--pf-border)] bg-[var(--pf-elev)] p-3">
        <div className="pr-2">
          <div className="text-[12px] font-semibold text-[var(--pf-fg)]">{HUMAN_TONE_LABEL}</div>
          <div className="text-[10px] leading-snug text-[var(--pf-faint)]">
            {humanTone
              ? 'On — every prompt you insert is prefixed to make the AI write like a real person.'
              : 'Off — insert prompts as-is.'}
          </div>
        </div>
        <Toggle on={humanTone} onChange={toggleHumanTone} />
      </div>

      {/* + Add button */}
      <button
        type="button"
        onClick={() => {
          setEditingId(null);
          setForm({ label: '', content: '' });
          setShowCreator(true);
        }}
        className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[var(--pf-border)] py-2.5 text-[11px] font-medium text-[var(--pf-faint)] transition-all hover:border-[var(--pf-accent)] hover:text-[var(--pf-accent)]"
      >
        <span className="grid h-5 w-5 place-items-center rounded-full border border-current text-[14px] font-light">
          +
        </span>
        Save new prompt
      </button>

      {/* Prompt list */}
      {prompts.length === 0 ? (
        <p className="text-center text-[11px] text-[var(--pf-faint)] py-6">
          No saved prompts yet. Click <span className="text-[var(--pf-accent)]">+</span> above or
          save one from your history.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              onClick={() => void insertPrompt(p.content)}
              onKeyDown={(ev) => {
                if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) {
                  ev.preventDefault();
                  void insertPrompt(p.content);
                }
              }}
              title="Click to insert into the focused AI chat tab"
              className="group cursor-pointer rounded-xl border border-[var(--pf-border)] bg-[var(--pf-elev)] p-3 transition-colors hover:border-[var(--pf-accent)] hover:bg-[var(--pf-hover)]"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-[var(--pf-fg)]">{p.label}</span>
                <span className="text-[9px] text-[var(--pf-faint)]">
                  {new Date(p.ts).toLocaleDateString()}
                </span>
              </div>
              <p className="line-clamp-3 whitespace-pre-wrap text-[10.5px] leading-snug text-[var(--pf-muted)]">
                {p.content}
              </p>
              <div className="mt-2 flex items-center gap-3 opacity-100">
                <span className="text-[10px] font-medium text-[var(--pf-accent)]">Insert →</span>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    void navigator.clipboard?.writeText(withHumanTone(p.content, humanTone));
                    flash(humanTone ? 'Copied with human tone' : 'Copied');
                  }}
                  className="text-[10px] text-[var(--pf-muted)] hover:text-[var(--pf-fg)]"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    startEdit(p);
                  }}
                  className="text-[10px] text-[var(--pf-muted)] hover:text-[var(--pf-fg)]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    void handleDelete(p.id);
                  }}
                  className="text-[10px] text-rose-400/70 hover:text-rose-400"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Creator / Editor Modal */}
      {showCreator && (
        <div
          className="pf-modal-overlay fixed inset-0 z-[2147483647] grid place-items-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCreator(false);
              setEditingId(null);
            }
          }}
        >
          <div className="pf-modal-body w-[320px] rounded-2xl border border-[var(--pf-border)] bg-[var(--pf-surface)] p-5 shadow-2xl backdrop-blur-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-[var(--pf-fg)]">
                {editingId ? 'Edit Prompt' : 'Save New Prompt'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreator(false);
                  setEditingId(null);
                }}
                className="grid h-6 w-6 place-items-center rounded-full text-[var(--pf-faint)] transition-colors hover:bg-[var(--pf-hover)] hover:text-[var(--pf-fg)]"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--pf-faint)]">
                  Label
                </label>
                <input
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Senior React Job Post"
                  maxLength={60}
                  className="w-full rounded-lg border border-[var(--pf-border)] bg-black/20 px-3 py-1.5 text-xs text-[var(--pf-fg)] placeholder:text-[var(--pf-faint)] focus:border-[var(--pf-accent)] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--pf-faint)]">
                  Prompt content
                </label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="Paste or type the full prompt text…"
                  rows={5}
                  className="w-full resize-none rounded-lg border border-[var(--pf-border)] bg-black/20 px-3 py-1.5 text-xs leading-snug text-[var(--pf-fg)] placeholder:text-[var(--pf-faint)] focus:border-[var(--pf-accent)] focus:outline-none pf-scroll"
                />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreator(false);
                  setEditingId(null);
                }}
                className="flex-1 rounded-xl border border-[var(--pf-border)] bg-[var(--pf-elev)] py-2 text-xs font-medium text-[var(--pf-muted)] transition-colors hover:bg-[var(--pf-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={editingId ? handleUpdate : handleCreate}
                disabled={!form.label.trim() || !form.content.trim()}
                className="flex-1 rounded-xl bg-[var(--pf-accent)] py-2 text-xs font-semibold text-[var(--pf-accent-fg)] transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {editingId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
