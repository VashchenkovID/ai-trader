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
  Link as MuiLink,
  MenuItem,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { SystemService } from '@/api/generated'
import { DashboardAutoPaperCard } from '@/components/dashboard/DashboardAutoPaperCard'
import { DashboardOperationsCard } from '@/components/dashboard/DashboardOperationsCard'
import { DashboardStatCard } from '@/components/dashboard/DashboardStatCard'
import { DashboardTaskList } from '@/components/dashboard/DashboardTaskList'
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

function DashboardPage() {
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
  const [pageToast, setPageToast] = useState<{
    message: string
    severity: 'success' | 'error'
  } | null>(null)

  const showPageToast = useCallback((message: string, severity: 'success' | 'error') => {
    setPageToast({ message, severity })
  }, [])

  const pruneCompletedTasks = useCallback(async () => {
    setPruneBusy(true)
    try {
      const raw = await SystemService.systemTasksPruneCompletedApiV1SystemTasksPruneCompletedPost()
      const inner =
        unwrapEnvelopeData<Record<string, unknown>>(raw) ?? (raw as Record<string, unknown>)
      applyTasksPrunedFromServer(inner)
      const removed = inner.removedCount != null ? String(inner.removedCount) : '0'
      setPageToast({ message: `Удалено завершённых записей: ${removed}`, severity: 'success' })
    } catch (e) {
      setPageToast({ message: apiErrorMessage(e), severity: 'error' })
    } finally {
      setPruneBusy(false)
    }
  }, [])

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { sm: 'flex-start' },
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h1" sx={{ fontWeight: 600, color: 'primary.main' }}>
            Сводка
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
            Режим, капитал и фоновые процессы.
          </Typography>
        </Box>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          <Button
            component={Link}
            to="/trading-requests"
            variant="outlined"
            size="small"
            color="primary"
            endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
          >
            Заявки
          </Button>
          <Button
            component={Link}
            to="/recommendations"
            variant="outlined"
            size="small"
            color="secondary"
            endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
          >
            Рекомендации
          </Button>
          <Button
            component={Link}
            to="/portfolio"
            variant="outlined"
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 16 }} />}
          >
            Портфель
          </Button>
        </Stack>
      </Box>

      {error ? (
        <Alert severity="error" sx={{ py: 0.75 }}>
          {error}
        </Alert>
      ) : null}

      <DashboardOperationsCard />

      <DashboardAutoPaperCard onNotify={showPageToast} />

      <Grid container spacing={1.5}>
        {isLoading && !isLoaded ? (
          <>
            {[0, 1, 2, 3].map(i => (
              <Grid key={i} size={{ xs: 12, sm: 6, md: 3 }}>
                <Skeleton variant="rounded" height={104} sx={{ borderRadius: 1 }} />
              </Grid>
            ))}
          </>
        ) : (
          <>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DashboardStatCard
                label="Режим"
                value={modeLabel}
                footer={
                  <>
                    <Chip
                      size="small"
                      label={portfolioKind === 'virtual' ? 'Виртуальный снимок' : 'Брокер'}
                      sx={{ mt: 0.5 }}
                    />
                    {portfolioKind === 'virtual' ? (
                      <FormControl size="small" fullWidth sx={{ mt: 1.5 }}>
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
                  </>
                }
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DashboardStatCard
                label="Оценка / баланс"
                value={formatMoney(totalBalance)}
                highlight
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DashboardStatCard label="Акции (оценка)" value={formatMoney(stocksValue)} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <DashboardStatCard
                label="P&L (оценка)"
                value={formatMoney(profitLoss)}
                valueColor={profitLoss >= 0 ? 'success.main' : 'error.main'}
              />
            </Grid>
          </>
        )}
      </Grid>

      <Card variant="outlined">
        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 600, color: 'primary.main', letterSpacing: '0.02em', mb: 0.5 }}
          >
            Система
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75, fontSize: 13 }}>
            WebSocket: {connectionStatus}
            {snapshot?.system?.timestamp
              ? ` · снимок ${new Date(snapshot.system.timestamp).toLocaleString('ru-RU')}`
              : null}
          </Typography>
          {snapshot?.system ? (
            <Typography variant="body2" sx={{ mb: 0.75, fontSize: 13 }}>
              CPU {snapshot.system.cpuPercent}% · RAM {snapshot.system.ramPercent}%
            </Typography>
          ) : null}
          {snapshot?.workers ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
              Задачи в памяти: выполняется {snapshot.workers.running}, ошибок{' '}
              {snapshot.workers.failed}, завершено {snapshot.workers.completed}
            </Typography>
          ) : null}
          <Box sx={{ mb: 0.75 }}>
            <Button
              size="small"
              variant="outlined"
              color="secondary"
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
        open={pageToast != null}
        autoHideDuration={4000}
        onClose={() => setPageToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {pageToast ? (
          <Alert
            severity={pageToast.severity}
            onClose={() => setPageToast(null)}
            sx={{ width: '100%' }}
          >
            {pageToast.message}
          </Alert>
        ) : undefined}
      </Snackbar>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pt: 0.5 }}>
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

export { DashboardPage }
export default DashboardPage
