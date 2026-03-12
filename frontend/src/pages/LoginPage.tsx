import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input, SurfaceCard, Text } from '@/components/ui'
import { loginUser, verifyStoredSession } from '@/services/auth'
import './LoginPage.scss'

export function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const checkSession = async () => {
      setIsCheckingSession(true)
      const session = await verifyStoredSession()
      if (!active) return

      if (session.ok) {
        navigate('/dashboard', { replace: true })
        return
      }

      setIsCheckingSession(false)
    }

    void checkSession()
    return () => {
      active = false
    }
  }, [navigate])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('Укажите логин и пароль')
      return
    }

    setError(null)
    setIsSubmitting(true)
    try {
      await loginUser(username.trim(), password)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Неверный логин или пароль')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <SurfaceCard className="login-page__card" tone="elevated">
        <Text as="p" variant="eyebrow" tone="muted">
          AI Trader
        </Text>
        <Text as="h1" variant="title">
          Вход в систему
        </Text>
        <Text as="p" variant="body" tone="muted">
          Авторизация через API с валидацией токена перед входом в dashboard.
        </Text>

        {isCheckingSession ? (
          <Text as="p" variant="body" tone="muted">
            Проверяем активную сессию...
          </Text>
        ) : (
          <form className="login-page__form" onSubmit={handleSubmit}>
            <Input
              label="Логин"
              value={username}
              onChange={event => setUsername(event.target.value)}
              placeholder="Введите username"
              autoComplete="username"
            />
            <Input
              label="Пароль"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="********"
              autoComplete="current-password"
            />
            {error && (
              <Text as="p" variant="hint" tone="danger">
                {error}
              </Text>
            )}
            <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
              Войти
            </Button>
          </form>
        )}

        <Text as="p" variant="hint" tone="muted">
          Временный переход в shell:{' '}
          <Link to="/dashboard" className="login-page__link">
            Dashboard
          </Link>
        </Text>
      </SurfaceCard>
    </main>
  )
}
