import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onReport?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  reportStatus: "idle" | "sent";
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    reportStatus: "idle",
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error: error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // Escalate to any outer boundary / observer while still showing the fallback UI.
    console.error("Uncaught render error:", error);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      reportStatus: "idle",
    });
  };

  handleReport = () => {
    const { error, errorInfo } = this.state;
    if (!error) return;

    try {
      this.props.onReport?.(error, errorInfo as ErrorInfo);
    } catch (reportError) {
      console.error("Failed to report error:", reportError);
    }

    this.setState({ reportStatus: "sent" });
  };

  render() {
    const { hasError, error, reportStatus } = this.state;
    const { children, fallback } = this.props;

    if (!hasError) {
      return children;
    }

    if (typeof fallback === "function") {
      return fallback(error as Error, this.handleReset);
    }

    if (fallback !== undefined) {
      return fallback;
    }

    return (
      <div
        role="alert"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          minHeight: "100vh",
          padding: "24px",
          textAlign: "center",
          boxSizing: "border-box",
        }}
      >
        <h1>Something went wrong</h1>
        <p>OUR APP ENCOUNTERED UNEXPECTED ERROR.</p>
        {error?.message ? (
          <pre
            style={{
              maxWidth: "600px",
              overflow: "auto",
              padding: "12px",
              background: "#f5f5f5",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          >
            {error.message}
          </pre>
        ) : null}
        <div style={{ display: "flex", gap: "12px" }}>
          <button type="button" onClick={this.handleReport} disabled={reportStatus === "sent"}>
            {reportStatus === "sent" ? "Reported" : "Report"}
          </button>
          <button type="button" onClick={this.handleReset}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
