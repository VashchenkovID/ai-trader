import { Alert, Box, Button, Container, Paper, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FormField } from '@/components/ui/FormField'
import { loginUser } from '@/services/auth'

export function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await loginUser(username.trim(), password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Container maxWidth="sm">
        <Paper sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
            Вход
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            AI Trader — введите учётные данные бэкенда.
          </Typography>
          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}
          <Box component="form" onSubmit={e => void handleSubmit(e)} sx={{ mt: 1 }}>
            <FormField id="login-username" label="Имя пользователя" sx={{ mb: 2 }}>
              <TextField
                id="login-username"
                name="username"
                autoComplete="username"
                fullWidth
                size="small"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
              />
            </FormField>
            <FormField id="login-password" label="Пароль" sx={{ mb: 1 }}>
              <TextField
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                fullWidth
                size="small"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </FormField>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              size="large"
              sx={{ mt: 3 }}
              disabled={loading}
            >
              {loading ? 'Вход…' : 'Войти'}
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  )
}
