import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          width: '100vw',
          backgroundColor: '#09090b',
          color: '#f4f4f5',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          boxSizing: 'border-box'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.5rem',
            color: '#ef4444',
            fontSize: '1.75rem',
            fontWeight: 'bold'
          }}>
            !
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '0.5rem', letterSpacing: '-0.025em' }}>
            Application Encountered an Error
          </h1>
          <p style={{ color: '#a1a1aa', fontSize: '0.95rem', maxWidth: '500px', marginBottom: '1.5rem', lineHeight: '1.5' }}>
            Send2Me encountered an unexpected issue while loading. You can try reloading the application window.
          </p>
          {this.state.error && (
            <div style={{
              backgroundColor: '#18181b',
              border: '1px solid #27272a',
              borderRadius: '0.75rem',
              padding: '1rem 1.25rem',
              maxWidth: '600px',
              width: '100%',
              textAlign: 'left',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              color: '#f87171',
              marginBottom: '1.5rem',
              wordBreak: 'break-word',
              maxHeight: '150px',
              overflowY: 'auto'
            }}>
              {this.state.error.name}: {this.state.error.message}
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '9999px',
              padding: '0.75rem 2rem',
              fontSize: '0.95rem',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
            }}
          >
            Reload Window
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
