import React from "react";

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  onReport?: (error: Error, errorInfo: React.ErrorInfo) => void;
  fallback?: (
    error: Error,
    reset: () => void,
    report: () => void,
  ) => React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  reported: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    reported: false,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error: error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Escalate to any external logging service via the optional callback.
    console.error("Unhandled error caught by ErrorBoundary:", error, errorInfo);
  }

  reset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      reported: false,
    });
  };

  report = () => {
    const { error, errorInfo } = this.state;
    if (!error) return;

    try {
      this.props.onReport?.(error, errorInfo as React.ErrorInfo);
    } catch (reportError) {
      console.error("ErrorBoundary report handler failed:", reportError);
    }

    this.setState({ reported: true });
  };

  render() {
    const { hasError, error, reported } = this.state;

    if (hasError && error) {
      if (this.props.fallback) {
        return this.props.fallback(error, this.reset, this.report);
      }

      return (
        <div
          role="alert"
          className="min-h-screen flex items-center justify-center p-4"
        >
          <div className="max-w-lg text-center space-y-4">
            <h2 className="text-2-xl font-bold">Something went wrong</h2>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. You can report this issue or try again.
            </p>
            <pre className="text-left text-xs bg-muted p-3 rounded overflow-auto max-h-40">
              {error.message}
            </pre>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={this.report}
                disabled={reported}
                className="px-4 py-2 bg-indigo-600 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reported ? "Reported" : "Report"}
              </button>
              <button
                type="button"
                onClick={this.reset}
                className="px-4 py-2 bg-gray-200 text-gray-900 rounded"
              >
                Try again
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
