import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorCode?: string;
}

/**
 * Top-level crash guard for StoreFlow.
 *
 * Without this, any uncaught render error in ANY component takes down
 * the entire app to a blank white screen — including mid-sale, mid-checkout,
 * or while editing inventory. This catches that, shows a branded recovery
 * screen instead, and lets the merchant reload without losing trust in the app.
 *
 * Note: React error boundaries do not catch errors inside event handlers,
 * async code, or the service worker — only errors thrown during render.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    const value = String(error?.message || 'unknown');
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    return { hasError: true, errorCode: `SF-${Math.abs(hash).toString(36).toUpperCase()}` };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Logged to console for now. If/when a monitoring tool (e.g. Sentry) is
    // wired up, report the error here as well.
    console.error("StoreFlow crashed:", error, errorInfo);
    try {
      sessionStorage.setItem('storeflow_last_crash', JSON.stringify({
        message: String(error?.message || error),
        stack: errorInfo.componentStack,
        at: new Date().toISOString(),
      }));
    } catch {
      // Storage can be unavailable in strict mobile privacy modes.
    }
  }

  private handleReload = async () => {
    try {
      if ('caches' in window) {
        await Promise.all(['html', 'assets'].map(cacheName => caches.delete(cacheName)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.update().catch(() => undefined)));
      }
    } catch {
      // Reload still works when cache or service-worker access is restricted.
    } finally {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            padding: "24px",
            textAlign: "center",
            background: "#08080f",
            color: "#f5f5f7",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: "40px" }}>⚡</div>
          <h1 style={{ fontSize: "20px", fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "14px", opacity: 0.7, maxWidth: "320px", margin: 0 }}>
            StoreFlow hit an unexpected error. Your data is safe — tap below to
            reload and pick up where you left off.
          </p>
          {this.state.errorCode && (
            <p style={{ fontSize: "11px", opacity: 0.45, margin: 0 }}>Reference {this.state.errorCode}</p>
          )}
          <button
            onClick={this.handleReload}
            style={{
              marginTop: "8px",
              padding: "12px 24px",
              borderRadius: "9999px",
              border: "none",
              background: "#f5f5f7",
              color: "#08080f",
              fontWeight: 600,
              fontSize: "14px",
              minHeight: "44px",
              cursor: "pointer",
            }}
          >
            Reload StoreFlow
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
