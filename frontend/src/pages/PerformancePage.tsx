import {
  Alert,
  Box,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CollapsibleRawJson, LabeledValuesTable, type LabeledValueRow } from '@/components/ops'
import { PerformanceService } from '@/api/generated'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import { unwrapEnvelopeData } from '@/utils/unwrapEnvelope'

export function PerformancePage() {
  const [period, setPeriod] = useState(30)
  const [dashboard, setDashboard] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const env = await PerformanceService.performanceDashboardApiV1PerformanceVisualizationDashboardGet({
        period,
      })
      const inner =
        unwrapEnvelopeData<Record<string, unknown>>(env) ?? (env as unknown as Record<string, unknown>)
      setDashboard(inner)
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  const metaRows = useMemo((): LabeledValueRow[] => {
    if (!dashboard) return []
    const rows: LabeledValueRow[] = []
    if (dashboard.period != null) {
      rows.push({
        label: 'Период анализа',
        hint: 'Число дней, за которое строится срез.',
        value: `${String(dashboard.period)} дн.`,
      })
    }
    if (dashboard.strategy != null) {
      rows.push({
        label: 'Стратегия',
        hint: 'Фильтр по стратегии (если передан в API).',
        value: String(dashboard.strategy),
      })
    }
    if (dashboard.sector != null) {
      rows.push({
        label: 'Сектор',
        hint: 'Фильтр по сектору (если передан в API).',
        value: String(dashboard.sector),
      })
    }
    return rows
  }, [dashboard])

  const summaryRows = useMemo((): LabeledValueRow[] => {
    const summary = dashboard?.summary
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return []
    const s = summary as Record<string, unknown>
    const rows: LabeledValueRow[] = []
    if (s.requestCount != null) {
      rows.push({
        label: 'Число торговых заявок (в БД)',
        hint: 'Агрегат из слоя производительности: сколько заявок учтено в расчёте.',
        value: String(s.requestCount),
      })
    }
    if ('sharpe' in s) {
      rows.push({
        label: 'Коэффициент Шарпа',
        hint: 'Пока может быть пустым, пока не заполнен расчёт на бэкенде.',
        value: s.sharpe == null ? '—' : String(s.sharpe),
      })
    }
    if ('maxDrawdownPct' in s) {
      rows.push({
        label: 'Макс. просадка, %',
        hint: 'Пока может быть пустым, пока не заполнен расчёт на бэкенде.',
        value: s.maxDrawdownPct == null ? '—' : String(s.maxDrawdownPct),
      })
    }
    return rows
  }, [dashboard])

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1100, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 0.5 }}>
        Производительность
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Срез метрик производительности и заявок. Детальные KPI портфеля по-прежнему на главной — здесь без
        дублирования, только данные API визуализации.
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Paper sx={{ p: 2, mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Период, дней</InputLabel>
          <Select label="Период, дней" value={period} onChange={e => setPeriod(Number(e.target.value))}>
            {[7, 14, 30, 90, 180].map(d => (
              <MenuItem key={d} value={d}>
                {d}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {loading ? <LinearProgress sx={{ mt: 2 }} /> : null}
      </Paper>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Параметры запроса
            </Typography>
            <LabeledValuesTable rows={metaRows} />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Сводка
            </Typography>
            <LabeledValuesTable rows={summaryRows} />
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Полный ответ API
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Ниже — сырой JSON для отладки и полей, ещё не вынесенных в таблицы.
        </Typography>
        <CollapsibleRawJson title="Развернуть сырой JSON" data={dashboard} defaultExpanded={false} maxHeight={400} />
      </Paper>
    </Box>
  )
}
