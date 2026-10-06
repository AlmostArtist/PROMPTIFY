// One-time microphone grant. Chrome can't show a permission prompt inside the
// side panel, so we ask here, in a normal tab, on the extension's own origin —
// after that the side panel's speech recognition just works.
const status = document.getElementById('status') as HTMLDivElement;
const button = document.getElementById('allow') as HTMLButtonElement;

async function ask(): Promise<void> {
  status.textContent = 'Waiting for your OK…';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    status.textContent = 'Microphone enabled ✓ — you can close this tab and talk to PROMPTIFY.';
    button.style.display = 'none';
    await chrome.storage.session.set({ pf_voice_request: Date.now() }).catch(() => undefined);
    setTimeout(() => window.close(), 1600);
  } catch {
    status.textContent = 'Microphone was blocked. Click the camera/mic icon in the address bar to allow it, then try again.';
  }
}

button.addEventListener('click', () => void ask());
void ask();

export {};
