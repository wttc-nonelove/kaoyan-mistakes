import { useEffect, useState } from 'react'
import { cloud } from '../lib/cloud'
import { Icon } from '../components/Icon'

/** 发码结果必须存在事件处理器外面：重试、切 tab 都不能丢 */
let pendingOtp: { phone: string; verificationId: string; isExistingUser: boolean } | null = null

type Mode = 'otp' | 'password'

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('otp')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [sent, setSent] = useState(false)
  const [isNewUser, setIsNewUser] = useState(false)

  useEffect(() => {
    if (countdown <= 0) return
    const t = window.setInterval(() => setCountdown((n) => (n > 0 ? n - 1 : 0)), 1000)
    return () => window.clearInterval(t)
  }, [countdown])

  async function sendCode() {
    if (!/^1\d{10}$/.test(phone)) {
      setPhoneError('请输入正确的 11 位手机号')
      return
    }
    setPhoneError('')
    setError('')
    setSending(true)
    try {
      const res = await cloud.auth.sendOtp({ phone })
      if (res.error || !res.data) {
        setError(res.error?.message || '验证码发送失败，请稍后重试')
        return
      }
      pendingOtp = {
        phone,
        verificationId: res.data.verificationId,
        isExistingUser: res.data.isExistingUser,
      }
      setIsNewUser(!res.data.isExistingUser)
      setSent(true)
      setCountdown(60)
    } catch (e) {
      setError(e instanceof Error ? e.message : '验证码发送失败')
    } finally {
      setSending(false)
    }
  }

  async function submitCode() {
    if (!pendingOtp || pendingOtp.phone !== phone) {
      setError('请先获取当前手机号的验证码')
      return
    }
    if (!/^\d{4,8}$/.test(code)) {
      setError('请输入收到的验证码')
      return
    }
    if (newPassword && newPassword.length < 6) {
      setError('密码至少 6 位')
      return
    }
    setError('')
    setVerifying(true)
    try {
      const res = await cloud.auth.verifyOtp({
        phone: pendingOtp.phone,
        verificationId: pendingOtp.verificationId,
        isExistingUser: pendingOtp.isExistingUser,
        token: code,
        ...(newPassword && !pendingOtp.isExistingUser ? { password: newPassword } : {}),
      })
      if (res.error) {
        setError(res.error.message || '验证码不正确')
        return
      }
      pendingOtp = null
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败')
    } finally {
      setVerifying(false)
    }
  }

  async function submitPassword() {
    if (!/^1\d{10}$/.test(phone)) {
      setPhoneError('请输入正确的 11 位手机号')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }
    setError('')
    setVerifying(true)
    try {
      const res = await cloud.auth.signInWithPassword({ phone, password })
      if (res.error) {
        setError(res.error.message || '手机号或密码不正确')
        return
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark" style={{ width: 38, height: 38, borderRadius: 11, fontSize: 18 }}>
            题
          </div>
          <div>
            <div className="auth-title">错题集</div>
            <div className="auth-sub">考研数二 / 408 · 手机电脑同步</div>
          </div>
        </div>

        <div className="seg" style={{ marginTop: 18, width: '100%' }}>
          <button
            className={mode === 'otp' ? 'is-on' : ''}
            style={{ flex: 1 }}
            onClick={() => {
              setMode('otp')
              setError('')
            }}
          >
            验证码登录
          </button>
          <button
            className={mode === 'password' ? 'is-on' : ''}
            style={{ flex: 1 }}
            onClick={() => {
              setMode('password')
              setError('')
            }}
          >
            密码登录
          </button>
        </div>

        <div className="stack" style={{ gap: 14, marginTop: 16 }}>
          <div className="field">
            <div className="field-label">手机号</div>
            <input
              className="input"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="11 位手机号"
              value={phone}
              maxLength={11}
              onChange={(e) => {
                setPhone(e.target.value.replace(/\D/g, ''))
                setPhoneError('')
                setError('')
              }}
            />
            {phoneError ? <div className="field-error">{phoneError}</div> : null}
          </div>

          {mode === 'otp' ? (
            <>
              <div className="field">
                <div className="field-label">验证码</div>
                <div className="code-row">
                  <input
                    className="input"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6 位验证码"
                    value={code}
                    maxLength={8}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, ''))
                      setError('')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void submitCode()
                    }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => void sendCode()}
                    disabled={sending || countdown > 0}
                    style={{ minWidth: 108 }}
                  >
                    {sending ? '发送中…' : countdown > 0 ? `${countdown}s 后重发` : sent ? '重新获取' : '获取验证码'}
                  </button>
                </div>
              </div>

              {isNewUser ? (
                <div className="field">
                  <div className="field-label">
                    设置登录密码 <span className="muted">（可选，设了以后免验证码）</span>
                  </div>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    placeholder="至少 6 位"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value)
                      setError('')
                    }}
                  />
                  <div className="tiny muted">
                    设了之后在「密码登录」里用手机号 + 密码直接进，不用等短信。
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="auth-error">
                  <Icon name="flag" size={14} /> {error}
                </div>
              ) : null}

              <button
                className="btn btn-primary btn-lg btn-block"
                onClick={() => void submitCode()}
                disabled={verifying}
              >
                {verifying ? '登录中…' : isNewUser ? '注册并登录' : '登录'}
              </button>
            </>
          ) : (
            <>
              <div className="field">
                <div className="field-label">密码</div>
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  placeholder="注册时设置的密码"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitPassword()
                  }}
                />
              </div>

              {error ? (
                <div className="auth-error">
                  <Icon name="flag" size={14} /> {error}
                </div>
              ) : null}

              <button
                className="btn btn-primary btn-lg btn-block"
                onClick={() => void submitPassword()}
                disabled={verifying}
              >
                {verifying ? '登录中…' : '登录'}
              </button>

              <div className="tiny muted" style={{ lineHeight: 1.8 }}>
                密码是首次注册时设置的。如果当时没设，用「验证码登录」进来即可。
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
