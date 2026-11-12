import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in React tree:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#0e0f14] text-[#dbdee1] p-6">
          <div className="max-w-lg w-full bg-[#1e1f24] border border-red-500/30 rounded-2xl p-6 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto text-3xl mb-4">
              ⚠️
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Arayüz Yüklenirken Bir Hata Oluştu</h1>
            <p className="text-sm text-gray-400 mb-4">
              Tarayıcı arayüzü başlatırken beklenmeyen bir hata ile karşılaştı.
            </p>
            <div className="bg-black/40 rounded-xl p-3 text-left font-mono text-xs text-red-300 overflow-x-auto max-h-40 mb-6 border border-white/5">
              {this.state.error?.toString()}
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium text-sm transition"
              >
                Önbelleği Temizle & Yenile
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-sm transition"
              >
                Sayfayı Yenile
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
