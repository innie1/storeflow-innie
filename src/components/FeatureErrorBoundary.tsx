import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  name: string;
}

interface State {
  failed: boolean;
}

/** Keeps an optional dashboard feature from taking down the whole merchant app. */
export default class FeatureErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[StoreFlow ${this.props.name}] feature failed:`, error, errorInfo);
    try {
      sessionStorage.setItem(`storeflow_feature_error_${this.props.name}`, JSON.stringify({
        message: String(error?.message || error),
        stack: errorInfo.componentStack,
        at: new Date().toISOString(),
      }));
    } catch {
      // Never let diagnostics become another failure.
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-black">StoreFlow is ready</p>
          <p className="mt-1 text-xs text-muted-foreground">{this.props.name} is temporarily hidden, but sales, orders, laundry records and your store data remain available.</p>
        </section>
      );
    }
    return this.props.children;
  }
}
