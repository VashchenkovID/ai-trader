import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Paper,
  Snackbar,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KellySettingsDTO, SettingItemDTO } from '@/api/generated'
import { SettingsService } from '@/api/generated'
import { useTradingCoreStore } from '@/store/tradingCoreStore'
import { apiErrorMessage } from '@/utils/apiErrorMessage'

function parseSettingValueFromText(raw: string): unknown {
  const t = raw.trim()
  if (t === 'true') return true
  if (t === 'false') return false
  if (t === '') return ''
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) {
    const n = Number(t)
    if (Number.isFinite(n)) return n
  }
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return JSON.parse(t) as unknown
    } catch {
      /* ignore */
    }
  }
  return t
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'boolean' || typeof v === 'number') return String(v)
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

export function SettingsPage() {
  const [items, setItems] = useState<SettingItemDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [kelly, setKelly] = useState<KellySettingsDTO | null>(null)
  const [kEnabled, setKEnabled] = useState(false)
  const [kConservative, setKConservative] = useState('')
  const [kMinTrades, setKMinTrades] = useState('')
  const [kVolPeriod, setKVolPeriod] = useState('')

  const [editOpen, setEditOpen] = useState(false)
  const [editKey, setEditKey] = useState('')
  const [editValue, setEditValue] = useState('')
  const [snack, setSnack] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const env = await SettingsService.getSettingsApiV1SettingsGet({ offset: 0, limit: 500 })
      const data = env.data as { items?: SettingItemDTO[] }
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadKelly = useCallback(async () => {
    try {
      const env = await SettingsService.getKellySettingsApiV1SettingsKellyGet()
      const k = env.data as KellySettingsDTO
      setKelly(k)
      setKEnabled(Boolean(k.enabled))
      setKConservative(k.conservativeFactor != null ? String(k.conservativeFactor) : '')
      setKMinTrades(k.minTrades != null ? String(k.minTrades) : '')
      setKVolPeriod(k.volatilityPeriod != null ? String(k.volatilityPeriod) : '')
    } catch {
      setKelly(null)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
    void loadKelly()
  }, [loadSettings, loadKelly])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      r =>
        r.key.toLowerCase().includes(q) ||
        String(r.module ?? '').toLowerCase().includes(q) ||
        String(r.description ?? '').toLowerCase().includes(q),
    )
  }, [items, search])

  const { notifyTimeRows, rowsByModule } = useMemo(() => {
    const notify = filtered.filter(r =>
      /notif|notification|telegram|alert|timezone|time_?zone|cron|schedule|slack|email/i.test(
        `${r.key} ${r.description ?? ''}`,
      ),
    )
    const notifyKeys = new Set(notify.map(r => r.key))
    const map = new Map<string, SettingItemDTO[]>()
    for (const row of filtered) {
      if (notifyKeys.has(row.key)) continue
      const mod = row.module?.trim() || 'Общее'
      const list = map.get(mod) ?? []
      list.push(row)
      map.set(mod, list)
    }
    return {
      notifyTimeRows: notify,
      rowsByModule: Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'ru')),
    }
  }, [filtered])

  const openEdit = (row: SettingItemDTO) => {
    setEditKey(row.key)
    setEditValue(stringifyValue(row.value))
    setEditOpen(true)
  }

  const saveEdit = async () => {
    try {
      const value = parseSettingValueFromText(editValue)
      await SettingsService.updateSettingsApiV1SettingsPut({
        requestBody: { key: editKey, value },
      })
      setEditOpen(false)
      setSnack('Сохранено')
      await loadSettings()
      await useTradingCoreStore.getState().refreshPortfolio('api')
    } catch (e) {
      setSnack(apiErrorMessage(e))
    }
  }

  const saveKelly = async () => {
    try {
      await SettingsService.updateKellySettingsApiV1SettingsKellyPut({
        requestBody: {
          enabled: kEnabled,
          conservativeFactor: kConservative === '' ? null : Number(kConservative),
          minTrades: kMinTrades === '' ? null : Number(kMinTrades),
          volatilityPeriod: kVolPeriod === '' ? null : Number(kVolPeriod),
        },
      })
      setSnack('Параметры Келли обновлены')
      await loadKelly()
      await useTradingCoreStore.getState().refreshPortfolio('api')
    } catch (e) {
      setSnack(apiErrorMessage(e))
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 1 }}>
        Настройки
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Ключи системы и параметры Келли. После сохранения обновляется снимок портфеля в торговом ядре.
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}
      {loading && items.length === 0 ? <LinearProgress sx={{ mb: 2 }} /> : null}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>
            Kelly
          </Typography>
          {!kelly ? (
            <Typography color="text.secondary">Параметры Келли недоступны.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 420 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography>Включено</Typography>
                <Switch checked={kEnabled} onChange={e => setKEnabled(e.target.checked)} />
              </Box>
              <TextField
                label="Conservative factor"
                size="small"
                value={kConservative}
                onChange={e => setKConservative(e.target.value)}
              />
              <TextField
                label="Min trades"
                size="small"
                value={kMinTrades}
                onChange={e => setKMinTrades(e.target.value)}
              />
              <TextField
                label="Volatility period (дней)"
                size="small"
                value={kVolPeriod}
                onChange={e => setKVolPeriod(e.target.value)}
              />
              <Button variant="contained" onClick={() => void saveKelly()} sx={{ alignSelf: 'flex-start' }}>
                Сохранить Kelly
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>

      <TextField
        fullWidth
        size="small"
        label="Поиск по ключу / модулю / описанию"
        value={search}
        onChange={e => setSearch(e.target.value)}
        sx={{ mb: 2 }}
      />

      {notifyTimeRows.length > 0 ? (
        <Paper sx={{ mb: 2 }}>
          <Box sx={{ px: 2, pt: 2, pb: 1 }}>
            <Typography variant="subtitle1">Уведомления и время</Typography>
            <Typography variant="caption" color="text.secondary">
              Ключи, похожие на уведомления, расписание или таймзону (эвристика по имени).
            </Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Ключ</TableCell>
                  <TableCell>Модуль</TableCell>
                  <TableCell>Значение</TableCell>
                  <TableCell width={120} />
                </TableRow>
              </TableHead>
              <TableBody>
                {notifyTimeRows.map(row => (
                  <TableRow key={row.key}>
                    <TableCell>{row.key}</TableCell>
                    <TableCell>{row.module ?? '—'}</TableCell>
                    <TableCell sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {stringifyValue(row.value)}
                    </TableCell>
                    <TableCell>
                      <Button size="small" onClick={() => openEdit(row)}>
                        Изменить
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      ) : null}

      {rowsByModule.map(([moduleName, rows]) => (
        <Paper key={moduleName} sx={{ mb: 2 }}>
          <Box sx={{ px: 2, pt: 2, pb: 1 }}>
            <Typography variant="subtitle1">Модуль: {moduleName}</Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Ключ</TableCell>
                  <TableCell>Модуль</TableCell>
                  <TableCell>Значение</TableCell>
                  <TableCell width={120} />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.key}>
                    <TableCell>{row.key}</TableCell>
                    <TableCell>{row.module ?? '—'}</TableCell>
                    <TableCell sx={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {stringifyValue(row.value)}
                    </TableCell>
                    <TableCell>
                      <Button size="small" onClick={() => openEdit(row)}>
                        Изменить
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography color="text.secondary">Нет строк.</Typography>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      ))}

      {filtered.length === 0 && !loading ? (
        <Typography color="text.secondary">Нет строк по запросу.</Typography>
      ) : null}

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Настройка: {editKey}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Значение (строка, число, true/false или JSON)"
            fullWidth
            multiline
            minRows={4}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={() => void saveEdit()}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={4000}
        onClose={() => setSnack(null)}
        message={snack}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  )
}
