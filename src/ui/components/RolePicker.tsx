import { useMemo, useState } from 'react';
import { CATEGORY_ORDER, getAllRoles, getRole, registerCustomRoles, rolesByCategory } from '@/data/roles';
import type { Role, RoleCategory } from '@/engine/types';
import { addCustomRole, removeCustomRole } from '@/lib/storage';
import { requestAi } from '@/lib/messages';
import { Chip } from './primitives';

/** Lenient extraction of the role JSON the model returns. */
function parseRoleJson(text: string): Partial<Role> | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as Partial<Role>;
  } catch {
    return null;
  }
}

export function RolePicker({
  selected,
  onToggle,
  onClear,
  online,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  online?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [openCat, setOpenCat] = useState<RoleCategory | null>(null);
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // version is a dependency so the lists refresh after a custom role is added/removed.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return getAllRoles().filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.headline.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        r.specialties.some((s) => s.toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, version]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const grouped = useMemo(() => rolesByCategory(), [version]);

  const handleCreate = async () => {
    const desc = query.trim();
    if (!desc || creating) return;
    setCreating(true);
    setCreateError(null);
    const res = await requestAi('create-role', desc);
    setCreating(false);
    if (!res.ok || !res.text) {
      setCreateError(res.error || 'Could not reach OpenRouter.');
      return;
    }
    const parsed = parseRoleJson(res.text);
    if (!parsed || !parsed.headline) {
      setCreateError('The model returned an unreadable role — try rephrasing.');
      return;
    }
    const role: Role = {
      id: `custom-${crypto.randomUUID?.() ?? Date.now()}`,
      emoji: String(parsed.emoji || '✨').slice(0, 4),
      label: String(parsed.label || desc).slice(0, 40),
      category: 'Custom',
      headline: String(parsed.headline),
      specialties: Array.isArray(parsed.specialties) ? parsed.specialties.map(String).slice(0, 8) : [],
      deliverable: String(parsed.deliverable || 'Expert Input').slice(0, 40),
    };
    const list = await addCustomRole(role);
    registerCustomRoles(list);
    setVersion((v) => v + 1);
    setQuery('');
    onToggle(role.id);
  };

  const handleDelete = async (id: string) => {
    const list = await removeCustomRole(id);
    registerCustomRoles(list);
    if (selected.includes(id)) onToggle(id);
    setVersion((v) => v + 1);
  };

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {selected.map((id) => {
            const role = getRole(id);
            if (!role) return null;
            return (
              <Chip key={id} active onClick={() => onToggle(id)} title="Remove">
                <span>{role.emoji}</span>
                <span>{role.label}</span>
                <span className="opacity-70">×</span>
              </Chip>
            );
          })}
          {selected.length > 1 && (
            <span className="text-[10px] font-medium text-[var(--pf-accent)]">Panel · {selected.length}</span>
          )}
          <button type="button" onClick={onClear} className="text-[10px] text-[var(--pf-faint)] hover:text-[var(--pf-fg)]">
            clear
          </button>
        </div>
      )}

      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setCreateError(null);
        }}
        placeholder="Search roles, or describe one to create…"
        className="w-full rounded-lg border border-[var(--pf-border)] bg-[var(--pf-elev)] px-3 py-1.5 text-xs text-[var(--pf-fg)] placeholder:text-[var(--pf-faint)] focus:border-[var(--pf-accent)] focus:outline-none"
      />

      {/* Create-with-AI affordance */}
      {query.trim() && (
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || !online}
          title={online ? 'Generate a custom role with AI' : 'Add your OpenRouter API key in Settings'}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--pf-accent)] py-1.5 text-[11px] font-semibold text-[var(--pf-accent-fg)] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {creating ? 'Creating role…' : `✨ Create “${query.trim().slice(0, 28)}” with AI`}
        </button>
      )}
      {createError && <div className="mt-1.5 text-[10px] text-rose-400">{createError}</div>}

      <div className="mt-2">
        {filtered ? (
          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto pf-scroll pr-1">
            {filtered.length === 0 ? (
              <span className="text-xs text-[var(--pf-faint)]">No roles match — create one above.</span>
            ) : (
              filtered.map((r) => (
                <Chip key={r.id} active={selected.includes(r.id)} onClick={() => onToggle(r.id)} title={r.headline}>
                  <span>{r.emoji}</span>
                  <span>{r.label}</span>
                </Chip>
              ))
            )}
          </div>
        ) : (
          <div className="max-h-48 space-y-0.5 overflow-y-auto pf-scroll pr-1">
            {CATEGORY_ORDER.map((cat) => {
              if (grouped[cat].length === 0) return null;
              const open = openCat === cat;
              const count = selected.filter((id) => getRole(id)?.category === cat).length;
              return (
                <div key={cat}>
                  <button
                    type="button"
                    onClick={() => setOpenCat(open ? null : cat)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-[var(--pf-muted)] transition-colors hover:bg-[var(--pf-hover)] hover:text-[var(--pf-fg)]"
                  >
                    <span className="font-medium">{cat}</span>
                    <span className="flex items-center gap-2">
                      {count > 0 && <span className="rounded-full bg-[var(--pf-elev)] px-1.5 text-[10px] text-[var(--pf-accent)]">{count}</span>}
                      <span className="text-[var(--pf-faint)]">{open ? '▾' : '▸'}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="flex flex-wrap gap-1.5 px-2 pb-2 pt-1">
                      {grouped[cat].map((r) =>
                        cat === 'Custom' ? (
                          <span
                            key={r.id}
                            className={[
                              'inline-flex items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-xs',
                              selected.includes(r.id)
                                ? 'border-transparent bg-[var(--pf-accent)] text-[var(--pf-accent-fg)]'
                                : 'border-[var(--pf-border)] bg-[var(--pf-elev)] text-[var(--pf-fg)]',
                            ].join(' ')}
                          >
                            <button type="button" onClick={() => onToggle(r.id)} title={r.headline} className="flex items-center gap-1">
                              <span>{r.emoji}</span>
                              <span>{r.label}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(r.id)}
                              title="Delete role"
                              className="grid h-4 w-4 place-items-center rounded-full text-current opacity-60 hover:opacity-100"
                            >
                              ×
                            </button>
                          </span>
                        ) : (
                          <Chip key={r.id} active={selected.includes(r.id)} onClick={() => onToggle(r.id)} title={r.headline}>
                            <span>{r.emoji}</span>
                            <span>{r.label}</span>
                          </Chip>
                        ),
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
