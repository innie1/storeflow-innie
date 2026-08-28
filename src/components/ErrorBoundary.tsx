import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
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

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Logged to console for now. If/when a monitoring tool (e.g. Sentry) is
    // wired up, report the error here as well.
    console.error("StoreFlow crashed:", error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
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
