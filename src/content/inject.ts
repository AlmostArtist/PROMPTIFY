// Reading from and writing to the host page's prompt input. The tricky part is
// that ChatGPT/Claude/Gemini use framework-controlled editors (ProseMirror,
// Quill) where a naive `value =` or `textContent =` is ignored. We use the
// techniques those editors actually listen for.

function isTextField(el: HTMLElement): el is HTMLTextAreaElement | HTMLInputElement {
  return el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement;
}

/** Read the current prompt text regardless of input type. */
export function readPrompt(el: HTMLElement): string {
  if (isTextField(el)) return el.value;
  // innerText keeps the user's visible line breaks; textContent would not.
  return (el as HTMLElement).innerText ?? el.textContent ?? '';
}

/** React/Vue track an internal value, so set it via the native setter and fire `input`. */
function setNativeValue(el: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function selectAll(el: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Replace a contenteditable editor's content. Framework editors (Lexical on ChatGPT,
 * ProseMirror on older versions, Quill, Tiptap) each have their own model that doesn't
 * respond to naive DOM writes. We try paths in order of reliability:
 *
 *  1. document.execCommand('selectAll') + insertText — the native command pipeline that
 *     Lexical / ProseMirror intercept via beforeinput events. Most reliable.
 *  2. Manual Range selectAll + insertText — fallback when document.execCommand selectAll
 *     doesn't focus the right element.
 *  3. Synthetic ClipboardEvent paste — some editors handle this but ignore the selection.
 *  4. Direct textContent + input event — last-resort fallback.
 */
function setContentEditable(el: HTMLElement, text: string): void {
  el.focus();

  // Path 1: native selectAll command + insertText. Lexical and ProseMirror register
  // beforeinput handlers that intercept execCommand and update their internal model,
  // so this reliably REPLACES the whole content rather than inserting at the cursor.
  document.execCommand('selectAll');
  if (document.execCommand('insertText', false, text)) return;

  // Path 2: explicit Range-based select-all, then insertText.
  selectAll(el);
  if (document.execCommand('insertText', false, text)) return;

  // Path 3: synthetic paste. Works for editors that handle ClipboardEvent but the
  // selectAll above should already cover the selection state.
  try {
    selectAll(el);
    const data = new DataTransfer();
    data.setData('text/plain', text);
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    const accepted = !el.dispatchEvent(pasteEvent); // preventDefault → editor handled it
    if (accepted) return;
  } catch {
    /* ClipboardEvent not supported — fall through */
  }

  // Path 4: direct DOM write + synthetic input event.
  el.textContent = text;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
}

/** Overwrite the prompt box with `text` and place the caret at the end. */
export function writePrompt(el: HTMLElement, text: string): void {
  if (isTextField(el)) {
    el.focus();
    setNativeValue(el, text);
    el.selectionStart = el.selectionEnd = text.length;
  } else {
    setContentEditable(el, text);
    placeCaretAtEnd(el);
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Reveal `full` into the prompt box with a typewriter effect, then settle on the
 * exact final text. The OpenRouter bridge is request/response (not a true token
 * stream), so we simulate streaming by writing progressively longer slices.
 *
 * We reuse `writePrompt` each tick so all the framework-editor quirks
 * (Lexical/ProseMirror/Quill) keep working. To stay cheap on long text we reveal
 * in a bounded number of steps (≈ under a second total) and cut on word
 * boundaries so words never visibly split mid-reveal.
 */
export async function streamWrite(el: HTMLElement, full: string): Promise<void> {
  const text = full;
  if (!text) {
    writePrompt(el, text);
    return;
  }
  try {
    const steps = Math.max(8, Math.min(36, Math.round(text.length / 18)));
    const delay = Math.min(28, Math.max(14, Math.round(900 / steps)));
    let prev = 0;
    for (let i = 1; i < steps; i++) {
      let cut = Math.round((text.length * i) / steps);
      const nextSpace = text.indexOf(' ', cut);
      if (nextSpace !== -1 && nextSpace - cut < 12) cut = nextSpace; // snap to word end
      if (cut <= prev) continue;
      prev = cut;
      writePrompt(el, text.slice(0, cut));
      await wait(delay);
    }
  } catch {
    /* if anything goes wrong mid-stream, fall through to the final exact write */
  }
  writePrompt(el, text);
}

function placeCaretAtEnd(el: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

// ── Insert-into-selection (any site: WhatsApp, LinkedIn, Gmail, X, …) ──
// A snapshot of where the user selected text inside an editable element, so AI
// output can be written back in place even after our UI briefly steals focus.

export interface EditableTarget {
  /** The editable element: a textarea/input, or the host of a contenteditable. */
  el: HTMLElement;
  kind: 'field' | 'ce';
  /** For text fields: the character range of the selection. */
  start: number;
  end: number;
  /** For contenteditable: a cloned Range covering the selection. */
  range: Range | null;
}

/** Climb to the top-most contenteditable host containing `node` (or null). */
function closestEditableHost(node: Node | null): HTMLElement | null {
  let n: Node | null = node;
  while (n) {
    if (n instanceof HTMLElement && n.isContentEditable) {
      let host = n;
      while (host.parentElement?.isContentEditable) host = host.parentElement;
      return host;
    }
    n = n.parentNode;
  }
  return null;
}

/**
 * If the current selection sits inside an editable field or contenteditable,
 * capture it so AI output can later replace it in place. Returns null when the
 * selection isn't writable (plain page text, our own UI, etc.).
 */
export function captureEditableTarget(): EditableTarget | null {
  const active = document.activeElement as HTMLElement | null;
  if (active && isTextField(active)) {
    const start = active.selectionStart;
    const end = active.selectionEnd;
    if (start != null && end != null && start !== end) {
      return { el: active, kind: 'field', start, end, range: null };
    }
  }
  const sel = window.getSelection();
  if (sel && sel.rangeCount && !sel.isCollapsed) {
    const host = closestEditableHost(sel.anchorNode);
    if (host) return { el: host, kind: 'ce', start: 0, end: 0, range: sel.getRangeAt(0).cloneRange() };
  }
  return null;
}

/**
 * Replace the captured editable selection with `text`, leaving the caret after
 * it. Uses the same framework-friendly paths as writePrompt. Returns success.
 */
export function insertIntoTarget(target: EditableTarget, text: string): boolean {
  try {
    if (target.kind === 'field') {
      const field = target.el as HTMLTextAreaElement | HTMLInputElement;
      field.focus();
      const v = field.value;
      const start = Math.min(target.start, v.length);
      const end = Math.min(target.end, v.length);
      setNativeValue(field, v.slice(0, start) + text + v.slice(end));
      const caret = start + text.length;
      try {
        field.selectionStart = field.selectionEnd = caret;
      } catch {
        /* some input types don't expose selection — ignore */
      }
      return true;
    }

    // contenteditable: restore the saved range, then let the editor's own
    // beforeinput/insertText pipeline replace it (Lexical, Draft.js, Quill, …).
    target.el.focus();
    if (target.range) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(target.range);
    }
    if (document.execCommand('insertText', false, text)) return true;
    // Last resort: overwrite the whole editor.
    setContentEditable(target.el, text);
    return true;
  } catch {
    return false;
  }
}
