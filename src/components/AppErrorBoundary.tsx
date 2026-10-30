import { Component, type ErrorInfo, type ReactNode } from 'react'
import { removeStoredItem } from '@/utils/persistentStorage'

interface State {
  error: Error | null
}

export default class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[biu-ui] startup/render error', error, info.componentStack)
  }

  private reload = () => {
    window.location.reload()
  }

  private resetPlayerState = () => {
    try {
      removeStoredItem('biu_player_state')
    } catch {
      // Storage may be unavailable; reload is still worth trying.
    }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        padding: '32px',
        background: '#f6f7f9',
        color: '#1c1c1e',
        fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", sans-serif',
        textAlign: 'center',
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>界面加载失败</h1>
        <p style={{ margin: 0, maxWidth: '420px', color: '#6b6b70', fontSize: '14px', lineHeight: 1.6 }}>
          播放器状态或界面渲染出现异常。可以先重新加载；如果仍然失败，再重置播放状态后重试。
        </p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={this.reload}
            style={{ minHeight: '38px', padding: '0 18px', border: 0, borderRadius: '999px', background: '#ff5c93', color: '#fff', fontSize: '14px', fontWeight: 600 }}
          >
            重新加载
          </button>
          <button
            type="button"
            onClick={this.resetPlayerState}
            style={{ minHeight: '38px', padding: '0 18px', border: '1px solid #dedee3', borderRadius: '999px', background: '#fff', color: '#1c1c1e', fontSize: '14px', fontWeight: 600 }}
          >
            重置播放状态
          </button>
        </div>
      </div>
    )
  }
}
