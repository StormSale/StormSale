import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode | (() => React.ReactNode);
  onReset?: () => void;
  onReport?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error("Unhandled error caught by ErrorBoundary:", error, errorInfo);
    this.props.onReport?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    this.props.onReset?.();
  };

  handleReport = () => {
    const { error, errorInfo } = this.state;
    const payload = {
      message: error?.message ?? "Unknown error",
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      url: typeof window !== "undefined" ? window.location.href : "unknown",
    };

    console.error("Error report:", payload);

    try {
      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      if (clipboard && clipboard.writeText) {
        void clipboard.writeText(JSON.stringify(payload, null, 2));
      }
    } catch {
      // clipboard may be unavailable in some environments
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === "function"
          ? (this.props.fallback as () => React.ReactNode)()
          : this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-lg text-center">
            <h2 className="text-2 text-font-bold mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground mb-4">
              An unexpected error occurred. You can report this issue or reload the page.
            </p>
            {this.state.error ? (
              <details className="mb-4 text-left text-xs text-muted-foreground">
                <summary className="cursor-pointer mb-1">Error details</summary>
                <pre className="whitespace-pre-wrap break-words">{this.state.error.message}</pre>
              </details>
            ) : null}
            <div className="flex gap-2 justify-center">
              <button
                onClick={this.handleReport}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
              >
                Report
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
