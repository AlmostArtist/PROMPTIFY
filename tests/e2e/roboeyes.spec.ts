import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('prompt bar RoboEyes and Translation shortcut work together', async ({ page }) => {
  await page.addInitScript(() => {
    const listeners = new Set<(changes: Record<string, unknown>, area: string) => void>();
    const event = {
      addListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.add(listener),
      removeListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.delete(listener),
    };
    const local: Record<string, unknown> = {};
    (window as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: local[key] }),
          set: async (values: Record<string, unknown>) => Object.assign(local, values),
        },
        onChanged: event,
      },
      runtime: {
        id: 'ui-test',
        onMessage: event,
        sendMessage: async (message: { type?: string; task?: string }) => {
          if (message.type === 'health') return { ok: true, model: 'test-model', provider: 'openrouter' };
          if (message.type === 'claimHandoff') return null;
          if (message.type === 'ai') {
            (window as unknown as { lastTask?: string }).lastTask = message.task;
            return { ok: true, text: 'This is corrected English.' };
          }
          return { ok: true };
        },
      },
    };
  });

  await page.route('**/composer-fixture.html', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main><div id="composer"><textarea aria-label="Prompt">this are bad english</textarea><button>Send</button></div></main></body></html>',
  }));
  await page.goto('/composer-fixture.html');
  const chunk = readdirSync('dist/assets').find(name => /^(?:src-content-)?index\.tsx-(?!loader).+\.js$/.test(name));
  expect(chunk).toBeTruthy();
  await page.addScriptTag({ type: 'module', url: `/assets/${chunk}` });

  const face = page.locator('[data-promptify-anchor] [data-robo-eyes]');
  const promptButton = page.locator('[data-promptify-anchor] button');
  await expect(face).toBeVisible();
  await expect(face).toHaveAttribute('data-mood', 'neutral');
  await expect(promptButton.locator(':scope > span')).toHaveCount(1);
  await promptButton.hover();
  await expect(face).toHaveAttribute('data-mood', 'curious');

  const prompt = page.getByRole('textbox', { name: 'Prompt' });
  await prompt.focus();
  await prompt.pressSequentially('!');
  await expect(face).toHaveAttribute('data-mood', 'excited');
  await expect(face.locator('[data-robo-mouth="excited"]')).toHaveCount(1);
  await page.keyboard.press('Backspace');
  await expect(face).toHaveAttribute('data-mood', 'angry');
  await expect(face.locator('[data-robo-mouth="angry"]')).toHaveCount(1);
  await page.keyboard.press('Meta+ArrowRight');
  await expect(page.getByText('Translation & English')).toBeVisible();
  await page.getByRole('button', { name: /Fix English grammar/ }).click();
  await expect(prompt).toHaveValue('This is corrected English.');
  expect(await page.evaluate(() => (window as unknown as { lastTask?: string }).lastTask)).toBe('fix-english-grammar');
  await expect(face).toHaveAttribute('data-mood', 'excited');
  await expect(face).toHaveAttribute('data-variant', 'orb');
});

test('quick tools uses expressive eyes in collapsed and expanded states', async ({ page }) => {
  await page.addInitScript(() => {
    const listeners = new Set<(changes: Record<string, unknown>, area: string) => void>();
    const event = {
      addListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.add(listener),
      removeListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.delete(listener),
    };
    (window as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: { get: async (key: string) => ({ [key]: undefined }), set: async () => undefined },
        onChanged: event,
      },
      runtime: {
        id: 'ui-test',
        onMessage: event,
        sendMessage: async (message: { type?: string }) => {
          if (message.type === 'health') return { ok: true, model: 'test-model', provider: 'openrouter' };
          if (message.type === 'panelState') return { open: false };
          if (message.type === 'usageSnapshot') return {
            ts: Date.now(),
            active: 'claude',
            rings: [
              { provider: 'codex', used: 48, label: '5 hour', resetsAt: Date.now() + 3_600_000, weekly: 21 },
              { provider: 'claude', used: 23, label: 'session', resetsAt: Date.now() + 7_200_000, weekly: 9 },
            ],
          };
          return { ok: true };
        },
      },
    };
    Object.defineProperty(navigator, 'getBattery', { configurable: true, value: async () => ({
      level: .76,
      charging: true,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }) });
  });
  await page.route('**/rail-fixture.html', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><body><main><h1>Quick tools fixture</h1></main></body></html>',
  }));
  await page.goto('/rail-fixture.html');
  const chunk = readdirSync('dist/assets').find(name => /^(?:src-content-)?contextRail\.tsx-(?!loader).+\.js$/.test(name));
  expect(chunk).toBeTruthy();
  await page.addScriptTag({ type: 'module', url: `/assets/${chunk}` });

  const rail = page.getByRole('complementary', { name: 'Quick tools' });
  const collapsed = rail.locator('[data-rail-state="collapsed"]');
  const expanded = rail.locator('[data-rail-state="expanded"]');
  const morph = rail.locator('[data-rail-morph]');
  await expect(collapsed).toHaveCount(1);
  await expect(expanded).toHaveCount(1);
  await expect(collapsed.locator('[data-robo-eyes]')).toHaveAttribute('data-mood', 'thinking');
  await expect(collapsed.locator('[data-robo-eyes]')).toHaveAttribute('data-variant', 'eyes-only');
  await expect(collapsed.getByText('23%')).toBeVisible();
  await expect(collapsed.getByText('48%')).toHaveCount(0);
  const digitalClock = collapsed.locator('[data-time-utility]');
  await expect(digitalClock).toBeVisible();
  await expect(digitalClock).toHaveAttribute('aria-label', /^Current time/);
  await expect(digitalClock.locator('svg')).toHaveCount(0);
  await expect(collapsed.locator('[aria-label="Battery 76 percent, charging"]')).toBeVisible();
  await expect(collapsed.getByRole('button', { name: 'Screenshot analysis' })).toHaveCount(0);
  await expect(collapsed.getByRole('button', { name: 'Ask your browser' })).toHaveCount(0);
  await digitalClock.hover();
  await expect(rail.getByRole('menu', { name: 'Clock tools' })).toBeVisible();
  await page.waitForTimeout(280);
  await expect(rail).toHaveAttribute('data-open', 'false');
  await rail.getByRole('menuitem', { name: /Timer/ }).click();
  await expect(digitalClock).toHaveAttribute('aria-label', /^Timer 05:00, running$/);
  await expect(digitalClock.locator('[data-clock-value]')).toContainText(/04:5\d|05:00/);
  await digitalClock.hover();
  await rail.getByRole('menuitem', { name: /Stopwatch/ }).click();
  await expect(digitalClock).toHaveAttribute('aria-label', /^Stopwatch \d\d:\d\d, running$/);
  const closedBox = await morph.boundingBox();
  expect(closedBox?.width).toBeCloseTo(48, 0);
  await page.getByRole('button', { name: 'Expand quick tools' }).click();
  await expect(rail).toHaveAttribute('data-open', 'true');
  await page.waitForTimeout(100);
  const middleBox = await morph.boundingBox();
  expect(middleBox?.width ?? 0).toBeGreaterThan(48);
  expect(middleBox?.width ?? 999).toBeLessThan(292);
  await page.waitForTimeout(380);
  const openBox = await morph.boundingBox();
  expect(openBox?.width).toBeCloseTo(292, 0);
  const viewport = page.viewportSize();
  expect(Math.abs((openBox?.y ?? 0) + (openBox?.height ?? 0) / 2 - (viewport?.height ?? 0) / 2)).toBeLessThan(2);
  await expect(expanded.getByText(/ChatGPT · 5 hour/)).toBeVisible();
  await expect(expanded.getByText(/Claude · session/)).toBeVisible();
  await expect(expanded.getByText(/resets in/).first()).toBeVisible();
  await expect(expanded.locator('[aria-label^="Current time"]')).toHaveCount(0);
  await expect(expanded.locator('[aria-label^="Battery"]')).toHaveCount(0);
  await expect(rail.getByRole('button', { name: 'Key points: Main ideas' })).toBeVisible();
  await expect(rail.getByRole('button', { name: 'Translate: To English' })).toHaveCount(0);
  await expect(rail.getByRole('button', { name: 'Copy link: Current page' })).toHaveCount(0);
  const workspace = rail.getByRole('button', { name: /Workspace/ });
  const ask = rail.locator('button[aria-label="Ask: Your browser"]');
  await expect(workspace).toHaveAttribute('aria-expanded', 'false');
  await expect(ask).toBeHidden();
  const beforeWorkspace = await morph.boundingBox();
  await workspace.click();
  await expect(workspace).toHaveAttribute('aria-expanded', 'true');
  await expect(ask).toBeVisible();
  await page.waitForTimeout(380);
  const afterWorkspace = await morph.boundingBox();
  expect(afterWorkspace?.height ?? 0).toBeGreaterThan(beforeWorkspace?.height ?? 0);
  await rail.getByRole('button', { name: 'Ask: Your browser' }).hover();
  await expect(expanded.locator('[data-robo-eyes]')).toHaveAttribute('data-mood', 'curious');
});

test('expanded quick tools stays inside a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 260, height: 760 });
  await page.addInitScript(() => {
    const listeners = new Set<(changes: Record<string, unknown>, area: string) => void>();
    const event = { addListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.add(listener), removeListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.delete(listener) };
    (window as unknown as { chrome: unknown }).chrome = {
      storage: { local: { get: async () => ({}), set: async () => undefined }, onChanged: event },
      runtime: { id: 'ui-test', onMessage: event, sendMessage: async (message: { type?: string }) => message.type === 'health' ? { ok: true, model: 'test-model', provider: 'openrouter' } : message.type === 'panelState' ? { open: false } : { ok: true } },
    };
  });
  await page.route('**/narrow-rail-fixture.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main>Narrow fixture</main></body></html>' }));
  await page.goto('/narrow-rail-fixture.html');
  const chunk = readdirSync('dist/assets').find(name => /^(?:src-content-)?contextRail\.tsx-(?!loader).+\.js$/.test(name));
  expect(chunk).toBeTruthy();
  await page.addScriptTag({ type: 'module', url: `/assets/${chunk}` });
  await page.getByRole('button', { name: 'Expand quick tools' }).click();
  await page.waitForTimeout(450);
  const box = await page.locator('[data-rail-morph]').boundingBox();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 999)).toBeLessThanOrEqual(260.5);
  expect(box?.width).toBeCloseTo(248, 0);
});

test('prompt robot fits a Claude-style composer without covering send', async ({ page }) => {
  await page.addInitScript(() => {
    const listeners = new Set<(changes: Record<string, unknown>, area: string) => void>();
    const event = {
      addListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.add(listener),
      removeListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.delete(listener),
    };
    (window as unknown as { chrome: unknown }).chrome = {
      storage: { local: { get: async () => ({}), set: async () => undefined }, onChanged: event },
      runtime: {
        id: 'ui-test', onMessage: event,
        sendMessage: async (message: { type?: string }) => message.type === 'health'
          ? { ok: true, model: 'test-model', provider: 'openrouter' }
          : message.type === 'claimHandoff' ? null : { ok: true },
      },
    };
  });
  await page.route('**/claude-composer-fixture.html', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><head><style>
      body{margin:0;min-height:100vh;display:grid;place-items:end center;background:#171716}
      form{width:620px;max-width:90vw;margin:24px;padding:8px 10px;border:1px solid #45433f;border-radius:22px;background:#262522}
      .editor-shell{display:flex;align-items:center;gap:8px;min-height:54px;position:relative}
      .editor-wrap{flex:1;min-width:0;padding:9px 10px}.ProseMirror{min-height:28px;color:white;outline:0}
      button{width:42px;height:42px;border:0;border-radius:14px}
    </style></head><body><form><div class="editor-shell"><div class="editor-wrap"><div class="ProseMirror" role="textbox" contenteditable="true">Draft</div></div><button aria-label="Send message">Send</button></div></form></body></html>`,
  }));
  await page.goto('/claude-composer-fixture.html');
  const chunk = readdirSync('dist/assets').find(name => /^(?:src-content-)?index\.tsx-(?!loader).+\.js$/.test(name));
  expect(chunk).toBeTruthy();
  await page.addScriptTag({ type: 'module', url: `/assets/${chunk}` });

  const robotButton = page.locator('[data-promptify-anchor] button');
  const sendButton = page.getByRole('button', { name: 'Send message' });
  await expect(robotButton).toBeVisible();
  const robotBox = await robotButton.boundingBox();
  const sendBox = await sendButton.boundingBox();
  expect((robotBox?.x ?? 9999) + (robotBox?.width ?? 0)).toBeLessThan((sendBox?.x ?? 0) - 3);
  expect(robotBox?.height ?? 99).toBeLessThanOrEqual(40);
});

test('side panel brand replaces the K tile with a 3D visor robot', async ({ page }) => {
  await page.addInitScript(() => {
    const listeners = new Set<(changes: Record<string, unknown>, area: string) => void>();
    const event = {
      addListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.add(listener),
      removeListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.delete(listener),
    };
    const store = {
      get: async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        return Object.fromEntries(keys.map(item => [item, undefined]));
      },
      set: async () => undefined,
    };
    (window as unknown as { chrome: unknown }).chrome = {
      storage: { local: store, session: store, onChanged: event },
      runtime: {
        id: 'ui-test',
        onMessage: event,
        sendMessage: async (message: { type?: string }) => {
          if (message.type === 'health') return { ok: true, model: 'test-model', provider: 'openrouter' };
          if (message.type === 'listModels') return [];
          if (message.type === 'news') return { stories: [], refreshedAt: Date.now(), attemptedAt: 0 };
          return { ok: true };
        },
      },
      permissions: { contains: async () => false },
      tabs: { query: async () => [{ id: 7, url: 'https://example.com' }] },
      scripting: { executeScript: async () => [{ result: '' }] },
      commands: { getAll: async () => [] },
    };
  });
  await page.goto('/sidepanel.html');
  const brand = page.getByRole('button', { name: 'PROMPTIFY workspace' });
  const robot = brand.locator('[data-robo-eyes]');
  await expect(robot).toBeVisible();
  await expect(robot).toHaveAttribute('data-variant', 'visor');
  await expect(robot).toHaveAttribute('data-mood', 'happy');
  await expect(brand.locator('.pk-brand-icon')).toHaveCount(0);

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Robot controls' })).toBeVisible();
  const preview = page.locator('.rc-preview [data-robo-eyes]');
  await page.getByLabel('Prompt bar robot hue').fill('210');
  await page.getByLabel('Prompt bar eye movement intensity').fill('165');
  await page.getByRole('button', { name: 'Love robot expression' }).click();
  await expect(preview).toHaveAttribute('data-hue', '210');
  await expect(preview).toHaveAttribute('data-movement', '165');
  await expect(preview).toHaveAttribute('data-mood', 'love');
  await expect(page.getByLabel('Custom accent color picker')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toHaveCount(0);

  const panel = page.locator('.pk-panel');
  await page.getByRole('button', { name: 'tabs', exact: true }).click();
  await expect(panel).toHaveAttribute('data-layout', 'tabs');
  await page.getByRole('button', { name: 'cards', exact: true }).click();
  await expect(panel).toHaveAttribute('data-layout', 'cards');
  await page.getByRole('button', { name: 'sidebar', exact: true }).click();
  await expect(panel).toHaveAttribute('data-layout', 'sidebar');
});
