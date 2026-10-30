import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Loader2, Smartphone, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import QRCode from 'qrcode'
import { generateQrCode, pollQrCode } from '@/services/api'

type QrStatus = 'loading' | 'waiting' | 'scanned' | 'success' | 'expired' | 'error'

interface LoginDialogProps {
  onClose: () => void
  onSuccess: () => void
}

export default function LoginDialog({ onClose, onSuccess }: LoginDialogProps) {
  const [status, setStatus] = useState<QrStatus>('loading')
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [countdown, setCountdown] = useState(180)
  const [errorMsg, setErrorMsg] = useState('')
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  // 轮询扫码状态
  const startPolling = useCallback((key: string) => {
    stopPolling()

    pollTimerRef.current = setInterval(async () => {
      try {
        const result = await pollQrCode(key)

        if (result.status === 0 || result.code === 0) {
          setStatus('success')
          stopPolling()
          setTimeout(() => onSuccess(), 800)
        } else if (result.status === 86090) {
          setStatus('scanned')
        } else if (result.code === 86038 || result.status === 86038) {
          setStatus('expired')
          stopPolling()
        }
      } catch {
        // 网络波动继续轮询，不中断流程
      }
    }, 2000)
  }, [onSuccess, stopPolling])

  // 生成二维码
  const generate = useCallback(async () => {
    setStatus('loading')
    setErrorMsg('')
    setCountdown(180)

    try {
      const data = await generateQrCode()
      const dataUrl = await QRCode.toDataURL(data.url, {
        width: 200,
        margin: 2,
        color: { dark: '#18191C', light: '#FFFFFF' },
      })
      setQrDataUrl(dataUrl)
      setStatus('waiting')
      startPolling(data.qrcodeKey)
    } catch {
      setStatus('error')
      setErrorMsg('无法连接 Bilibili，请检查网络后重试')
    }
  }, [startPolling])

  // 倒计时
  useEffect(() => {
    if (status !== 'waiting' && status !== 'scanned') return

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setStatus('expired')
          stopPolling()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [status, stopPolling])

  // 初始化生成二维码
  useEffect(() => {
    generate()
    return () => stopPolling()
  }, [generate, stopPolling])

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="playlist-dialog-backdrop login-dialog-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        className="playlist-dialog login-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="playlist-dialog__head">
          <div>
            <p>Account</p>
            <h2 id="login-dialog-title">Bilibili 扫码登录</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </div>

        <div className="login-dialog__qr">
          {status === 'loading' && <Loader2 size={32} className="spin login-dialog__loading" />}

          {(status === 'waiting' || status === 'scanned') && qrDataUrl && (
            <>
              <img src={qrDataUrl} alt="登录二维码" />
              {status === 'scanned' && (
                <div className="login-dialog__overlay">
                  <Smartphone size={30} />
                  <strong>扫码成功</strong>
                  <span>请在手机上确认登录</span>
                </div>
              )}
            </>
          )}

          {status === 'success' && (
            <div className="login-dialog__state is-success">
              <CheckCircle2 size={40} />
              <strong>登录成功</strong>
            </div>
          )}

          {(status === 'expired' || status === 'error') && (
            <div className="login-dialog__state">
              <AlertCircle size={40} />
              <strong>{status === 'expired' ? '二维码已过期' : (errorMsg || '生成二维码失败')}</strong>
              <button type="button" className="login-dialog__refresh" onClick={generate}>
                <RefreshCw size={14} />
                刷新二维码
              </button>
            </div>
          )}
        </div>

        {status === 'waiting' && (
          <div className="login-dialog__copy">
            <strong>请使用 Bilibili App 扫码登录</strong>
            <span>二维码有效期 {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}</span>
          </div>
        )}

        <p className="login-dialog__hint">打开 Bilibili App → 我的 → 扫一扫</p>
      </div>
    </div>
  )
}
