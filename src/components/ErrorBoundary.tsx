// One error boundary around the app (tech.md section 6, dashboard R10). An unexpected bug shows
// the fallback instead of a blank page. No technical detail is shown to the visitor. The error
// is logged to the console. The fallback content (friendly wording) comes in as a prop.
import { Component, type ErrorInfo, type ReactNode } from 'react';

export type ErrorBoundaryProps = {
  readonly fallback: ReactNode;
  readonly children: ReactNode;
};

type ErrorBoundaryState = { readonly hasError: boolean };

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('Unexpected error in the app:', error, info.componentStack);
  }

  override render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
