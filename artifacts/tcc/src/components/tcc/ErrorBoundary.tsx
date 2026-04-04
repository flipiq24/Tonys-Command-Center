import { Component, type ErrorInfo, type ReactNode } from "react";
import { C, F } from "./constants";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[TCC] Uncaught error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", maxWidth: 480, padding: 32 }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⚠</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.fg, marginBottom: 8 }}>
              Something went wrong
            </div>
            <div style={{ fontSize: 13, color: C.mut, marginBottom: 24, wordBreak: "break-word" }}>
              {this.state.error.message}
            </div>
            <button
              onClick={() => this.setState({ error: null })}
              style={{ background: C.acc, color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
