import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Contains render-time errors so a single bad component can't take down the rail
 * or the side panel. Logs the component stack so the culprit is identifiable.
 */
export class ErrorBoundary extends Component<Props, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('[PROMPTIFY] UI error contained:', error?.message, info?.componentStack);
  }

  render(): ReactNode {
    return this.state.hasError ? (this.props.fallback ?? null) : this.props.children;
  }
}
