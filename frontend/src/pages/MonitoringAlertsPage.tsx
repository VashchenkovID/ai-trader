import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { MonitoringService } from '@/api/generated'
import { apiErrorMessage } from '@/utils/apiErrorMessage'

type AlertRow = {
  id: string
  category?: string
  severity?: string
  resolved?: boolean
  message?: string
  timestamp?: string
}

function asRows(raw: unknown): AlertRow[] {
  if (!Array.isArray(raw)) return []
  return raw.map(x => {
    const o = (x ?? {}) as Record<string, unknown>
    return {
      id: String(o.id ?? ''),
      category: o.category != null ? String(o.category) : undefined,
      severity: o.severity != null ? String(o.severity) : undefined,
      resolved: typeof o.resolved === 'boolean' ? o.resolved : undefined,
      message: o.message != null ? String(o.message) : undefined,
      timestamp: o.timestamp != null ? String(o.timestamp) : undefined,
    }
  })
}

export function MonitoringAlertsPage() {
  const [rows, setRows] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('')
  const [resolvedFilter, setResolvedFilter] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const env = await MonitoringService.monitoringAlertsApiV1MonitoringAlertsGet({
        category: category || undefined,
        severity: severity || undefined,
        resolved:
          resolvedFilter === 'true' ? true : resolvedFilter === 'false' ? false : undefined,
        limit: 100,
      })
      const data = env.data as { items?: unknown[] }
      setRows(asRows(data.items))
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [category, severity, resolvedFilter])

  useEffect(() => {
    void load()
  }, [load])

  const resolveOne = async (id: string) => {
    try {
      await MonitoringService.resolveAlertApiV1MonitoringAlertsAlertIdResolvePost({ alertId: id })
      void load()
    } catch (e) {
      setError(apiErrorMessage(e))
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 0.5 }}>
        Алерты мониторинга
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Вторичный экран: маршрутные SLO и служебные сигналы. Фильтры не сохраняют состояние resolve на стороне API для
        bootstrap-алертов.
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Категория</InputLabel>
            <Select
              label="Категория"
              value={category}
              onChange={e => setCategory(String(e.target.value))}
            >
              <MenuItem value="">Все</MenuItem>
              <MenuItem value="system">system</MenuItem>
              <MenuItem value="availability">availability</MenuItem>
              <MenuItem value="latency">latency</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Важность</InputLabel>
            <Select label="Важность" value={severity} onChange={e => setSeverity(String(e.target.value))}>
              <MenuItem value="">Все</MenuItem>
              <MenuItem value="low">low</MenuItem>
              <MenuItem value="high">high</MenuItem>
              <MenuItem value="critical">critical</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Resolved</InputLabel>
            <Select
              label="Resolved"
              value={resolvedFilter}
              onChange={e => setResolvedFilter(String(e.target.value))}
            >
              <MenuItem value="">Все</MenuItem>
              <MenuItem value="false">Активные</MenuItem>
              <MenuItem value="true">Закрытые</MenuItem>
            </Select>
          </FormControl>
          <Button variant="outlined" size="small" onClick={() => void load()} disabled={loading}>
            Обновить
          </Button>
        </Box>
        {loading ? <LinearProgress sx={{ mt: 2 }} /> : null}
      </Paper>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Время</TableCell>
              <TableCell>Категория</TableCell>
              <TableCell>Важность</TableCell>
              <TableCell>Сообщение</TableCell>
              <TableCell>Статус</TableCell>
              <TableCell width={140} />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell>{r.timestamp ?? '—'}</TableCell>
                <TableCell>{r.category ?? '—'}</TableCell>
                <TableCell>{r.severity ?? '—'}</TableCell>
                <TableCell>{r.message ?? '—'}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={r.resolved ? 'resolved' : 'open'}
                    color={r.resolved ? 'default' : 'warning'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>
                  {!r.resolved ? (
                    <Button size="small" onClick={() => void resolveOne(r.id)}>
                      Resolve
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography color="text.secondary">Нет алертов.</Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}
