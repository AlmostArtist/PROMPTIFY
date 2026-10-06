import { readdirSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const listeners = new Set<(changes: any, area: string) => void>();
    const event = { addListener: (f: any) => listeners.add(f), removeListener: (f: any) => listeners.delete(f) };
    const store = (area: string) => ({
      get: async (keys: string | string[]) => { const data = JSON.parse(localStorage.getItem(`mock-${area}`) || '{}'); return typeof keys === 'string' ? { [keys]: data[keys] } : data; },
      set: async (values: Record<string, unknown>) => { const data = JSON.parse(localStorage.getItem(`mock-${area}`) || '{}'); localStorage.setItem(`mock-${area}`, JSON.stringify({ ...data, ...values })); const changes: any = {}; for (const key in values) changes[key] = { newValue: values[key] }; listeners.forEach(f => f(changes, area)); },
    });
    (window as any).newsFailure = false;
    (window as any).chrome = { storage: { local: store('local'), session: store('session'), onChanged: event },
      runtime: { id: 'ui-test', onMessage: event, sendMessage: async (msg: any) => {
        if (msg.type === 'health') return { ok: true, model: 'test-model', provider: 'openrouter' };
        if (msg.type === 'listModels') return [];
        if (msg.type === 'news') { if ((window as any).newsEmpty) return {stories:[],refreshedAt:Date.now(),attemptedAt:0}; if ((window as any).newsFailure) throw Error('Test offline'); return { stories: [{ id: 'fixture', title: 'AI research test fixture', source: 'Test publisher', url: 'https://example.com/test', publishedAt: Date.now(), category: 'Research', summary: 'Clearly labeled automated test data.' }], refreshedAt: Date.now(), attemptedAt: 0 }; }
        if (msg.type === 'ai') { (window as any).lastAiPrompt = msg.prompt; return { ok: true, text: '- First finding\n- Second finding' }; }
        if (msg.type === 'openSidePanel') { (window as any).lastQuickRoute = msg.page; return { ok: true }; }
        return { ok: false };
      } }, permissions: { contains: async () => false }, tabs: { query: async () => [{ id: 7, url: 'https://example.com' }] }, scripting: { executeScript: async () => [{ result: 'Readable test page content.' }] }, commands: { getAll: async () => [] },
    };
  });
  await page.goto('/sidepanel.html');
});

async function mountWebRail(page: Page, path = '/quick-tools-fixture.html') {
  await page.route(`**${path}`, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><body><main><h1>Current page fixture</h1><p>Readable public content.</p></main></body></html>' }));
  await page.goto(path);
  const chunk = readdirSync('dist/assets').find(name => /^(?:src-content-)?contextRail\.tsx-(?!loader).+\.js$/.test(name));
  expect(chunk).toBeTruthy();
  await page.addScriptTag({ type: 'module', url: `/assets/${chunk}` });
}

test('six presets persist, reset, respect system appearance, and meet accessibility checks', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  for (const name of ['Soft Colorful', 'Monochrome', 'Botanical', 'Editorial', 'Tidal']) {
    const preset = page.getByRole('button', { name: new RegExp(name) });
    await preset.click(); await expect(preset).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.tc-save-status')).toContainText('Saved on this device');
  }
  await page.reload(); await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: /Tidal/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Restore defaults' }).click();
  await expect(page.getByRole('button', { name: /Charcoal/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'system', exact: true }).click();
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await expect(page.locator('.pk-panel')).toHaveClass(new RegExp(`pf-theme-${colorScheme}`));
    const results = await new AxeBuilder({ page }).include('.tc-section').analyze();
    expect(results.violations).toEqual([]);
  }
});
test('charcoal panel and quick tools use the selected light and dark appearance', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'light', exact: true }).click();
  const panel = page.locator('.pk-panel');
  await expect(panel).toHaveClass(/pf-theme-light/);
  expect(await panel.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgb(9, 10, 11)');
  expect(await page.locator('.pk-main').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgb(9, 10, 11)');

  await mountWebRail(page, '/themed-quick-tools-fixture.html');
  const rail = page.getByRole('complementary', { name: 'Quick tools' });
  const morph = rail.locator('[data-rail-morph]');
  expect(await morph.evaluate(el => getComputedStyle(el).backgroundColor)).toMatch(/^rgb\((24[0-9]|25[0-5]),/);

  await page.evaluate(() => (window as any).chrome.storage.local.set({ pf_appearance_v1: { appearance: 'dark' } }));
  await expect.poll(() => morph.evaluate(el => getComputedStyle(el).backgroundColor)).not.toMatch(/^rgb\((24[0-9]|25[0-5]),/);
});
test('rail supports keyboard, status, real summary workflow, escape, and navigation', async ({ page }) => {
  await mountWebRail(page);
  const rail = page.getByRole('complementary', { name: 'Quick tools' });
  const trigger = page.getByRole('button', { name: 'Expand quick tools' });
  await trigger.focus(); await page.keyboard.press('Enter');
  await expect(rail).toHaveAttribute('data-open', 'true');
  await expect(rail.getByTitle('AI connected')).toBeVisible();
  await rail.getByRole('button', { name: 'deep', exact: true }).click();
  await rail.getByRole('button', { name: 'Summarize: This page', exact: true }).click();
  await expect(rail.getByRole('region', { name: 'Page summary' })).toContainText('First finding');
  await expect(rail.locator('.pk-structured-point')).toHaveCount(2);
  expect(await page.evaluate(() => (window as any).lastAiPrompt)).toContain('QUALITY: Deep');
  await rail.getByLabel('Summary length').selectOption('detailed');
  await page.keyboard.press('Escape'); await expect(rail).toHaveAttribute('data-open', 'false');
  await expect(page.getByRole('button', { name: 'Expand quick tools' })).toBeFocused();
  await page.getByRole('button', { name: 'Expand quick tools' }).click();
  await rail.getByRole('button', { name: /Workspace/ }).click();
  await rail.getByRole('button', { name: 'Settings: Manage' }).click();
  expect(await page.evaluate(() => (window as any).lastQuickRoute)).toBe('settings');
  await page.getByRole('button', { name: 'Expand quick tools' }).click();
  await expect(rail.getByLabel('Summary length')).toHaveValue('detailed');
  await expect(rail.getByRole('button', { name: 'deep', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
test('news loads, filters, reports errors and retries without losing cache', async ({ page }) => {
  await page.getByRole('button', { name: 'AI News', exact: true }).click();
  await expect(page.getByRole('link', { name: /AI research test fixture/ })).toBeVisible();
  await page.getByRole('button', { name: 'Video AI', exact: true }).click();
  await expect(page.getByText('No matching stories')).toBeVisible();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.evaluate(() => { (window as any).newsFailure = true; });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Test offline');
  await expect(page.getByRole('link', { name: /AI research test fixture/ })).toBeVisible();
  await page.evaluate(() => { (window as any).newsFailure = false; });
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('theme controls fit narrow through desktop layouts', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  for (const width of [280, 320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const layout of ['sidebar', 'tabs', 'cards']) {
      await page.getByRole('button', { name: layout, exact: true }).click();
      const size = await page.locator('.tc-section').evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      expect(size.scroll, `${width}px ${layout}`).toBeLessThanOrEqual(size.client + 1);
    }
  }
});

test('desktop rail opens on hover and closes outside', async ({ page }) => {
  await mountWebRail(page, '/hover-rail-fixture.html');
  await page.setViewportSize({width:1000,height:800});
  await page.getByRole('button',{name:'Expand quick tools'}).hover();
  await expect(page.locator('[data-context-rail]')).toHaveAttribute('data-open','true');
  await page.getByRole('heading',{name:'Current page fixture',exact:true}).click();
  await expect(page.locator('[data-context-rail]')).toHaveAttribute('data-open','false');
});
test('news empty state has no fabricated articles', async ({page})=>{
  await page.evaluate(()=>{(window as any).newsEmpty=true;});
  await page.getByRole('button',{name:'AI News',exact:true}).click();
  await expect(page.getByText('Your briefing is on its way')).toBeVisible();
  await expect(page.locator('.pk-news-card')).toHaveCount(0);
});
test('injected web rail works with blocked stylesheets and uses current page text', async ({page})=>{
  await page.route('**/fixture.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><head><meta http-equiv="Content-Security-Policy" content="style-src \'none\'"><title>Test page</title></head><body><main><h1>Current page fixture</h1><p>Readable public content.</p></main></body></html>'}));
  await page.goto('/fixture.html');
  const chunk=readdirSync('dist/assets').find(name=>/^(?:src-content-)?contextRail\.tsx-(?!loader).+\.js$/.test(name));
  expect(chunk).toBeTruthy();
  await page.addScriptTag({type:'module',url:`/assets/${chunk}`});
  await page.getByRole('button',{name:'Expand quick tools'}).click();
  await page.getByRole('button',{name:'Summarize: This page',exact:true}).click();
  await expect(page.getByRole('region',{name:'Page summary'})).toContainText('First finding');
  const rail=page.getByRole('complementary',{name:'Quick tools'});
  expect(await rail.evaluate(el=>getComputedStyle(el).position)).toBe('fixed');
  await page.keyboard.press('Escape');
  await expect(rail).toHaveAttribute('data-open','false');
});
