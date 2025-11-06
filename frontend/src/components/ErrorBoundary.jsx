import React from 'react';
import * as Sentry from '@sentry/react';
import './ErrorBoundary.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorCount: 0
    };
  }

  // eslint-disable-next-line no-unused-vars
  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details with timestamp
    console.error('[ErrorBoundary] Caught error:', {
      error: error.toString(),
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString()
    });
    
    this.setState({
      error: error,
      errorInfo: errorInfo,
      errorCount: this.state.errorCount + 1
    });

    // Optional: Send to error tracking service like Sentry
    try {
      const client = Sentry.getCurrentHub().getClient();
      if (client) {
        Sentry.captureException(error, { extra: errorInfo });
      }
    } catch (e) {
      // Sentry not initialized or configured, skip error reporting
    }
  }

  handleReset = () => {
    // Reload the page if errors persist (3+ consecutive errors)
    if (this.state.errorCount > 2) {
      window.location.reload();
    } else {
      // Reset error state and try again
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null
        // Keep errorCount to track consecutive failures
      });
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  componentDidUpdate(prevProps, prevState) {
    // Reset error count if we successfully recovered from an error
    if (prevState.hasError && !this.state.hasError) {
      this.setState({ errorCount: 0 });
    }
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <div className="error-icon">⚠️</div>
            <h1>Oops! Something went wrong</h1>
            <p className="error-message">
              {this.state.errorCount > 2 
                ? "We're having persistent issues. The page will reload to fix this."
                : "Don't worry, your data is safe. Try refreshing the page."}
            </p>
            
            {import.meta.env.DEV && this.state.error && (
              <details className="error-details">
                <summary>Error Details (Dev Only)</summary>
                <pre>{this.state.error.toString()}</pre>
                <pre>{this.state.errorInfo?.componentStack}</pre>
              </details>
            )}

            <div className="error-actions">
              <button 
                className="btn-primary"
                onClick={this.handleReset}
              >
                {this.state.errorCount > 2 ? 'Reload Page' : 'Try Again'}
              </button>
              <button 
                className="btn-secondary"
                onClick={this.handleGoHome}
              >
                Go to Dashboard
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
