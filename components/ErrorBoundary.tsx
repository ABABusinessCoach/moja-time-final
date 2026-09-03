import { Component, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-moja-bg flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
              <span className="text-3xl text-red-500">!</span>
            </div>
            <h1 className="text-xl font-bold text-moja-blue">Something went wrong</h1>
            <p className="text-sm text-moja-blue/60">
              An unexpected error occurred. Please reload the page to continue.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-moja-blue text-white rounded-xl font-bold hover:bg-moja-blue/90 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
