// "Browser Brain" permissions are optional and requested only when the user
// turns on the features that need them — the extension installs without any
// history / all-sites warning.
//
//  - history      → recall pages from Chrome history
//  - tabs         → read open tabs' titles + URLs for voice commands
//  - <all_urls>   → read other tabs' text (summarize / compare), screenshot
//                   from the side panel, and fetch images for Prompt DNA

export const BRAIN_PERMISSIONS: chrome.permissions.Permissions = {
  permissions: ['history', 'tabs'],
  origins: ['<all_urls>'],
};

export async function hasBrain(): Promise<boolean> {
  try {
    return await chrome.permissions.contains(BRAIN_PERMISSIONS);
  } catch {
    return false;
  }
}

export async function hasPermission(perm: 'history' | 'tabs'): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ permissions: [perm] });
  } catch {
    return false;
  }
}

export async function hasAllSites(): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: ['<all_urls>'] });
  } catch {
    return false;
  }
}

/** Must be called from a user gesture (a click handler). */
export async function requestBrain(): Promise<boolean> {
  try {
    return await chrome.permissions.request(BRAIN_PERMISSIONS);
  } catch {
    return false;
  }
}
