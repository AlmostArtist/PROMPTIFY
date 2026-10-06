const paths: Record<string, string> = {
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 7l3-3 3 1h4l3-1 3 3-1 3v4l1 3-3 3-3-1h-4l-3 1-3-3 1-3v-4L4 7Z',
  summary: 'M5 3h14v18H5V3Zm3 5h8m-8 4h8m-8 4h5',
  analysis: 'M5 19V9m7 10V4m7 15v-7M3 21h18',
  home: 'm15 4 5 5M4 20l4-1L21 6l-5-5L3 14l1 6Z',
  prompts: 'M5 3h14v18l-7-4-7 4V3Z',
  tools: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm13-1v8m-4-4h8',
  history: 'M3 11a9 9 0 1 1 2 7M3 4v7h7m2-5v6l4 2',
  ask: 'M4 4h16v12H9l-5 4V4Zm4 5h8m-8 3h5',
  vision: 'M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
  news: 'M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M5 19l3-3m8-8 3-3',
  studio: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  enhancer: 'm13 3-8 11h6l-1 7 9-12h-6l1-6Z',
  connections: 'm10 14 4-4M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 0 2-2a4 4 0 1 1 6 6l-4 4a4 4 0 0 1-6 0',
  points: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  explain: 'M12 18h.01M9.7 9a2.5 2.5 0 1 1 3.7 2.2c-.9.5-1.4 1-1.4 2.1M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20',
  translate: 'M4 5h7M7.5 3v2m2.8 0c-.8 3.4-2.8 6-6.3 8m1.8-5c1.2 2.2 3 4 5.2 5m2-2 3.5 9m3.5 0-3.5-9m-2.2 6h5.5',
  copy: 'M8 8h11v11H8V8Zm-3 8H4V4h12v1',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  battery: 'M5 7h13v10H5V7Zm13 3h2v4h-2M8 10v4m3-4v4m3-4v4',
};
export function ToolIcon({ name }: { name: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.studio} /></svg>;
}
