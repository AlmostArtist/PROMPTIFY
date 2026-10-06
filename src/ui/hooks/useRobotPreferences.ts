import { useSyncExternalStore } from 'react';
import { DEFAULT_ROBOT, normalizeRobot, ROBOT_KEY, type RobotPreferences } from '@/lib/robot';

let preferences = DEFAULT_ROBOT;
let snapshot = { preferences, ready: false, status: 'Loading robot settings…' };
let started = false;
let revision = 0;
let pending = 0;
let queue = Promise.resolve();
const listeners = new Set<() => void>();

const emit = () => {
  snapshot = { ...snapshot, preferences };
  listeners.forEach(listener => listener());
};

const hasExtensionStorage = () => typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);

async function start() {
  if (started) return;
  started = true;
  if (hasExtensionStorage()) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[ROBOT_KEY] && !pending) {
        preferences = normalizeRobot(changes[ROBOT_KEY].newValue);
        snapshot.status = 'Saved on this device';
        emit();
      }
    });
  } else {
    window.addEventListener('storage', event => {
      if (event.key !== ROBOT_KEY) return;
      try { preferences = normalizeRobot(JSON.parse(event.newValue || '{}')); emit(); } catch { /* Ignore malformed data. */ }
    });
  }
  try {
    const data = hasExtensionStorage()
      ? await chrome.storage.local.get(ROBOT_KEY)
      : { [ROBOT_KEY]: JSON.parse(localStorage.getItem(ROBOT_KEY) || 'null') };
    preferences = normalizeRobot(data[ROBOT_KEY]);
    snapshot.status = 'Saved on this device';
  } catch {
    snapshot.status = 'Could not load robot settings';
  }
  snapshot.ready = true;
  emit();
}

export function updateRobot(patch: Partial<RobotPreferences>) {
  preferences = normalizeRobot({ ...preferences, ...patch });
  const next = preferences;
  const id = ++revision;
  pending += 1;
  snapshot.status = 'Saving…';
  emit();
  queue = queue.then(async () => {
    try {
      if (hasExtensionStorage()) await chrome.storage.local.set({ [ROBOT_KEY]: next });
      else localStorage.setItem(ROBOT_KEY, JSON.stringify(next));
      if (id === revision) snapshot.status = 'Saved on this device';
    } catch {
      if (id === revision) snapshot.status = 'Save failed · change a control to retry';
    } finally {
      pending -= 1;
    }
    emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void start();
  return () => listeners.delete(listener);
}

export function useRobotPreferences() {
  return { ...useSyncExternalStore(subscribe, () => snapshot), update: updateRobot };
}
