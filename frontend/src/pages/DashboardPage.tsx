import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
  Link as MuiLink,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { SystemService } from '@/api/generated'
import { DashboardOperationsCard } from '@/components/dashboard/DashboardOperationsCard'
import { DashboardTaskList } from '@/components/dashboard/DashboardTaskList'
import { HighlightCard } from '@/components/ui/HighlightCard'
import { PAPER_VIRTUAL_PROFILE_SLUGS } from '@/store/paperVirtualProfile'
import { applyTasksPrunedFromServer, useSystemStatusStore } from '@/store/systemStatusStore'
import { useTradingCoreStore } from '@/store/tradingCoreStore'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import { unwrapEnvelopeData } from '@/utils/unwrapEnvelope'

function formatMoney(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value)
}

export function DashboardPage() {
  const {
    tradingMode,
    portfolioKind,
    paperVirtualProfileSlug,
    setPaperVirtualProfileSlug,
    totalBalance,
    stocksValue,
    profitLoss,
    isLoaded,
    isLoading,
    error,
  } = useTradingCoreStore()

  const { connectionStatus, snapshot, tasks } = useSystemStatusStore()
  const modeLabel = String(tradingMode?.mode ?? '—').toUpperCase()

  const recentTasks = tasks.slice(0, 10)

  const [pruneBusy, setPruneBusy] = useState(false)
  const [pruneSnack, setPruneSnack] = useState<{ message: string; severity: 'success' | 'error' } | null>(
    null,
  )

  const pruneCompletedTasks = useCallback(async () => {
    setPruneBusy(true)
    try {
      const raw = await SystemService.systemTasksPruneCompletedApiV1SystemTasksPruneCompletedPost()
      const inner =
        unwrapEnvelopeData<Record<string, unknown>>(raw) ?? (raw as Record<string, unknown>)
      applyTasksPrunedFromServer(inner)
      const removed = inner.removedCount != null ? String(inner.removedCount) : '0'
      setPruneSnack({ message: `Удалено завершённых записей: ${removed}`, severity: 'success' })
    } catch (e) {
      setPruneSnack({ message: apiErrorMessage(e), severity: 'error' })
    } finally {
      setPruneBusy(false)
    }
  }, [])

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" gutterBottom>
          Сводка
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Режим торговли, оценка капитала и фоновые процессы.
        </Typography>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      {isLoading && !isLoaded ? <LinearProgress /> : null}

      <DashboardOperationsCard />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Режим
              </Typography>
              <Typography variant="h6">{modeLabel}</Typography>
              <Chip
                size="small"
                label={portfolioKind === 'virtual' ? 'Виртуальный снимок' : 'Брокер'}
                sx={{ mt: 1 }}
              />
              {portfolioKind === 'virtual' ? (
                <FormControl size="small" fullWidth sx={{ mt: 2 }}>
                  <InputLabel id="dash-paper-profile-label">Профиль paper</InputLabel>
                  <Select
                    labelId="dash-paper-profile-label"
                    label="Профиль paper"
                    value={paperVirtualProfileSlug}
                    onChange={e => setPaperVirtualProfileSlug(String(e.target.value))}
                  >
                    {PAPER_VIRTUAL_PROFILE_SLUGS.map(slug => (
                      <MenuItem key={slug} value={slug}>
                        {slug}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : null}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <HighlightCard>
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Оценка / баланс
              </Typography>
              <Typography variant="h6">{formatMoney(totalBalance)}</Typography>
            </CardContent>
          </HighlightCard>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Акции (оценка)
              </Typography>
              <Typography variant="h6">{formatMoney(stocksValue)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                P&amp;L (оценка)
              </Typography>
              <Typography variant="h6" color={profitLoss >= 0 ? 'success.main' : 'error.main'}>
                {formatMoney(profitLoss)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" gutterBottom>
            Система
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            WebSocket: {connectionStatus}
            {snapshot?.system?.timestamp
              ? ` · снимок ${new Date(snapshot.system.timestamp).toLocaleString('ru-RU')}`
              : null}
          </Typography>
          {snapshot?.system ? (
            <Typography variant="body2" sx={{ mb: 1 }}>
              CPU {snapshot.system.cpuPercent}% · RAM {snapshot.system.ramPercent}%
            </Typography>
          ) : null}
          {snapshot?.workers ? (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Задачи в памяти: выполняется {snapshot.workers.running}, ошибок {snapshot.workers.failed},
              завершено {snapshot.workers.completed}
            </Typography>
          ) : null}
          <Box sx={{ mb: 1 }}>
            <Button
              size="small"
              variant="outlined"
              disabled={pruneBusy}
              onClick={() => void pruneCompletedTasks()}
            >
              {pruneBusy ? 'Очистка…' : 'Убрать завершённые из списка'}
            </Button>
          </Box>
          <DashboardTaskList tasks={recentTasks} />
        </CardContent>
      </Card>

      <Snackbar
        open={pruneSnack != null}
        autoHideDuration={4000}
        onClose={() => setPruneSnack(null)}
        message={pruneSnack?.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        <Button
          component={Link}
          to="/virtual-trading"
          variant="outlined"
          endIcon={<OpenInNewIcon />}
        >
          Автоторговля
        </Button>
        <Button
          component={Link}
          to="/trading-requests"
          variant="outlined"
          endIcon={<OpenInNewIcon />}
        >
          Заявки
        </Button>
        <Button component={Link} to="/portfolio" variant="outlined" endIcon={<OpenInNewIcon />}>
          Портфель
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary">
        В режиме paper снимок идёт из{' '}
        <MuiLink component={Link} to="/virtual-portfolios" underline="hover">
          виртуальных портфелей
        </MuiLink>
        ; при сбое API — стартовый капитал в{' '}
        <MuiLink component={Link} to="/settings" underline="hover">
          настройках
        </MuiLink>
        .
      </Typography>
    </Stack>
  )
}
