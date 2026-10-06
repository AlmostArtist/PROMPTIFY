import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SidePanel from './SidePanel';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import '@/ui/styles.css';

const root = document.getElementById('root')!;
root.className = 'pf-root';

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <SidePanel />
    </ErrorBoundary>
  </StrictMode>,
);
