import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
  LinearProgress,
  Paper,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CollapsibleRawJson, LabeledValuesTable } from '@/components/ops'
import { PreflightCheckService, RiskService } from '@/api/generated'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import { preflightCheckToRows, riskLimitsToRows, riskStatsToRows } from '@/utils/riskDisplay'
import { unwrapEnvelopeData } from '@/utils/unwrapEnvelope'

function overallChip(status: string | undefined) {
  const s = (status ?? '').toLowerCase()
  if (s === 'passed' || s === 'ok') return <Chip label={status ?? '—'} color="success" size="small" />
  if (s === 'failed' || s === 'fail') return <Chip label={status ?? '—'} color="error" size="small" />
  return <Chip label={status ?? '—'} variant="outlined" size="small" />
}

function RiskPage() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null)
  const [limits, setLimits] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [preflightStatus, setPreflightStatus] = useState<Record<string, unknown> | null>(null)
  const [preflightResults, setPreflightResults] = useState<Record<string, unknown> | null>(null)
  const [preflightBusy, setPreflightBusy] = useState(false)
  const [preflightError, setPreflightError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [s, l] = await Promise.all([
        RiskService.riskStatusApiV1RiskStatusGet(),
        RiskService.riskLimitsApiV1RiskLimitsGet(),
      ])
      const sd = unwrapEnvelopeData<Record<string, unknown>>(s) ?? (s as unknown as Record<string, unknown>)
      const ld = unwrapEnvelopeData<Record<string, unknown>>(l) ?? (l as unknown as Record<string, unknown>)
      setStatus(sd)
      setLimits(ld)
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const refreshPreflight = useCallback(async () => {
    setPreflightBusy(true)
    setPreflightError(null)
    try {
      const [st, res] = await Promise.all([
        PreflightCheckService.preflightStatusApiV1PreflightCheckStatusGet(),
        PreflightCheckService.preflightResultsApiV1PreflightCheckResultsGet(),
      ])
      setPreflightStatus(
        unwrapEnvelopeData<Record<string, unknown>>(st) ??
          (st as unknown as Record<string, unknown>),
      )
      setPreflightResults(
        unwrapEnvelopeData<Record<string, unknown>>(res) ??
          (res as unknown as Record<string, unknown>),
      )
    } catch (e) {
      setPreflightError(apiErrorMessage(e))
    } finally {
      setPreflightBusy(false)
    }
  }, [])

  useEffect(() => {
    void refreshPreflight()
  }, [refreshPreflight])

  const runPreflight = useCallback(async () => {
    setPreflightBusy(true)
    setPreflightError(null)
    try {
      await PreflightCheckService.preflightRunApiV1PreflightCheckRunPost()
      await refreshPreflight()
    } catch (e) {
      setPreflightError(apiErrorMessage(e))
    } finally {
      setPreflightBusy(false)
    }
  }, [refreshPreflight])

  const statsRows = useMemo(
    () => riskStatsToRows((status?.stats as Record<string, unknown>) ?? null),
    [status],
  )
  const statusLimitRows = useMemo(
    () => riskLimitsToRows((status?.limits as Record<string, unknown>) ?? null),
    [status],
  )
  const limitsOnlyRows = useMemo(() => riskLimitsToRows(limits ?? null), [limits])

  const emergency = Boolean(status?.emergencyStop)

  const preflightErrors = preflightResults?.errors
  const preflightWarnings = preflightResults?.warnings
  const preflightChecks = preflightResults?.checks

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 0.5 }}>
        Риск
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Статус риск-менеджмента, лимиты и проверка готовности (preflight) перед торговлей.
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}
      {loading && !status ? <LinearProgress sx={{ mb: 2 }} /> : null}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Preflight (готовность к торговле)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Проверяет режим торговли, auto-paper и срез риск-лимитов. Результат обновляется после запуска.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
          <Button variant="contained" size="small" disabled={preflightBusy} onClick={() => void runPreflight()}>
            Запустить проверку
          </Button>
          <Button variant="outlined" size="small" disabled={preflightBusy} onClick={() => void refreshPreflight()}>
            Обновить статус / результаты
          </Button>
        </Box>
        {preflightError ? (
          <Alert severity="warning" sx={{ mb: 1 }}>
            {preflightError}
          </Alert>
        ) : null}
        {preflightBusy ? <LinearProgress sx={{ mb: 1 }} /> : null}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="body2">Итог последней проверки:</Typography>
          {overallChip(preflightStatus?.overallStatus as string | undefined)}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Время последней проверки:{' '}
          {preflightStatus?.lastCheck
            ? new Date(String(preflightStatus.lastCheck)).toLocaleString('ru-RU')
            : '—'}
        </Typography>

        {Array.isArray(preflightErrors) && preflightErrors.length > 0 ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Ошибки
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {(preflightErrors as unknown[]).map((e, i) => (
                <Typography key={i} component="li" variant="body2">
                  {String(e)}
                </Typography>
              ))}
            </Box>
          </Alert>
        ) : null}

        {Array.isArray(preflightWarnings) && preflightWarnings.length > 0 ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Предупреждения
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {(preflightWarnings as unknown[]).map((w, i) => (
                <Typography key={i} component="li" variant="body2">
                  {String(w)}
                </Typography>
              ))}
            </Box>
          </Alert>
        ) : null}

        {preflightChecks && typeof preflightChecks === 'object' && !Array.isArray(preflightChecks) ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 1 }}>
            {Object.entries(preflightChecks as Record<string, unknown>).map(([name, payload]) => (
              <Paper key={name} variant="outlined" sx={{ p: 1.5 }}>
                <LabeledValuesTable rows={preflightCheckToRows(name, payload)} />
              </Paper>
            ))}
          </Box>
        ) : null}

        <CollapsibleRawJson title="Сырой JSON: статус preflight" data={preflightStatus} />
        <CollapsibleRawJson title="Сырой JSON: результаты preflight" data={preflightResults} />
      </Paper>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Статус риск-менеджмента
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Typography variant="body2">Экстренная остановка:</Typography>
              <Chip
                size="small"
                label={emergency ? 'Активна' : 'Нет'}
                color={emergency ? 'error' : 'success'}
                variant="outlined"
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Текущая статистика
            </Typography>
            <LabeledValuesTable rows={statsRows} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, mb: 0.5 }}>
              Лимиты (срез из статуса)
            </Typography>
            <LabeledValuesTable rows={statusLimitRows} />
            <CollapsibleRawJson title="Сырой JSON: статус" data={status} />
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Лимиты (API)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Эффективные числовые пороги, с которыми работает валидация ордеров.
            </Typography>
            <LabeledValuesTable rows={limitsOnlyRows} />
            <CollapsibleRawJson title="Сырой JSON: лимиты" data={limits} />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export { RiskPage }
export default RiskPage
