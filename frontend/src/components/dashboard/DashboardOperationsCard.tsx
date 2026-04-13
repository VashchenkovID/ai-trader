import {
  Alert,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Box,
  Snackbar,
  Typography,
} from '@mui/material'
import { useCallback, useState } from 'react'
import { SystemService } from '@/api/generated'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import { unwrapEnvelopeData } from '@/utils/unwrapEnvelope'

type OpKind =
  | 'fullSync'
  | 'cache'
  | 'analysis'
  | 'portfolioPositions'
  | 'trainingQuick'
  | 'trainingFull'

const COPY: Record<
  OpKind,
  { title: string; body: string; confirm: string; button: string; heavy: boolean }
> = {
  fullSync: {
    title: 'Полная загрузка данных в БД',
    body: 'Запускается фоновая задача полной синхронизации данных за год (`full_db_sync_year`). Операция может занять много времени и нагрузить API.',
    confirm: 'Запустить полную загрузку',
    button: 'Полная загрузка БД',
    heavy: true,
  },
  cache: {
    title: 'Обновление кеша',
    body: 'Фоновое обновление кеша (`cache_update`) — типичный ежедневный сценарий.',
    confirm: 'Запустить обновление кеша',
    button: 'Обновить кеш',
    heavy: false,
  },
  analysis: {
    title: 'Анализ рынка (NN+LLM)',
    body:
      'Запускается `analysis_market_portfolio`: fusion по инструментам, таблица рекомендаций и при необходимости пайплайн заявок по **рыночным** сигналам. Это **не** анализ открытых позиций с ценой закупки (он — отдельная кнопка ниже).',
    confirm: 'Запустить анализ рынка',
    button: 'Анализ рынка',
    heavy: false,
  },
  portfolioPositions: {
    title: 'Анализ позиций портфелей',
    body:
      'Запускается `analysis_portfolio_positions`: вердикт BUY/SELL/HOLD по каждой открытой позиции для real и всех виртуальных профилей. Автосоздание заявок из этих вердиктов на сервере включается переменной `PPR_AUTO_PIPELINE_ENABLED=true` (иначе только сохранение вердиктов; заявку можно создать вручную на странице виртуальных портфелей).',
    confirm: 'Запустить анализ позиций',
    button: 'Анализ позиций портфелей',
    heavy: false,
  },
  trainingQuick: {
    title: 'Быстрое обучение',
    body: 'Фоновая задача `training_quick` — короткий цикл обучения на свежих данных (ежедневный сценарий). Прогресс — в блоке «Система».',
    confirm: 'Запустить быстрое обучение',
    button: 'Ежедневное обучение',
    heavy: false,
  },
  trainingFull: {
    title: 'Полное обучение',
    body: 'Фоновая задача `training_full` — полный контур (NN, weekly, meta, RL и др.). Очень длительно и ресурсоёмко.',
    confirm: 'Запустить полное обучение',
    button: 'Полное обучение',
    heavy: true,
  },
}

function extractTriggerMessage(payload: Record<string, unknown>): string {
  const taskId = payload.taskId != null ? String(payload.taskId) : ''
  const taskType = payload.taskType != null ? String(payload.taskType) : ''
  const status = payload.status != null ? String(payload.status) : ''
  if (taskId) {
    return `Задача поставлена в очередь${taskType ? ` (${taskType})` : ''}. ID: ${taskId}${status ? `, статус: ${status}` : ''}.`
  }
  return 'Команда принята сервером.'
}

export function DashboardOperationsCard() {
  const [confirmKind, setConfirmKind] = useState<OpKind | null>(null)
  const [busy, setBusy] = useState<OpKind | null>(null)
  const [snack, setSnack] = useState<{ message: string; severity: 'success' | 'error' } | null>(
    null
  )

  const run = useCallback(async (kind: OpKind) => {
    setBusy(kind)
    try {
      let raw: unknown
      if (kind === 'fullSync') {
        raw = await SystemService.systemDataFullSyncYearApiV1SystemDataFullSyncYearPost()
      } else if (kind === 'cache') {
        raw = await SystemService.systemCacheUpdateApiV1SystemCacheUpdatePost()
      } else if (kind === 'trainingQuick') {
        raw = await SystemService.systemTrainingQuickApiV1SystemTrainingQuickPost()
      } else if (kind === 'trainingFull') {
        raw = await SystemService.systemTrainingFullApiV1SystemTrainingFullPost()
      } else if (kind === 'portfolioPositions') {
        raw = await SystemService.analysisPortfolioPositionsApiV1SystemAnalysisPortfolioPositionsPost()
      } else {
        raw = await SystemService.analysisMarketPortfolioApiV1SystemAnalysisMarketPortfolioPost()
      }
      const inner =
        unwrapEnvelopeData<Record<string, unknown>>(raw) ?? (raw as Record<string, unknown>)
      setSnack({ message: extractTriggerMessage(inner), severity: 'success' })
      setConfirmKind(null)
    } catch (e) {
      setSnack({ message: apiErrorMessage(e), severity: 'error' })
    } finally {
      setBusy(null)
    }
  }, [])

  const open = (kind: OpKind) => {
    const c = COPY[kind]
    if (!c.heavy) {
      void run(kind)
      return
    }
    setConfirmKind(kind)
  }

  const pending = confirmKind ? COPY[confirmKind] : null

  return (
    <>
      <Card variant="outlined">
        <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 600, color: 'primary.main', letterSpacing: '0.02em', mb: 0.5 }}
          >
            Операции
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25, fontSize: 13 }}>
            Фоновые задачи планировщика. Статус — в блоке «Система» (WebSocket).
          </Typography>
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              flexWrap: 'wrap',
              gap: 0.75,
            }}
          >
            <Button
              variant="contained"
              color="primary"
              disabled={busy !== null}
              onClick={() => open('fullSync')}
            >
              {busy === 'fullSync' ? 'Запуск…' : COPY.fullSync.button}
            </Button>
            <Button variant="outlined" disabled={busy !== null} onClick={() => open('cache')}>
              {busy === 'cache' ? 'Запуск…' : COPY.cache.button}
            </Button>
            <Button variant="outlined" disabled={busy !== null} onClick={() => open('analysis')}>
              {busy === 'analysis' ? 'Запуск…' : COPY.analysis.button}
            </Button>
            <Button
              variant="outlined"
              disabled={busy !== null}
              onClick={() => open('portfolioPositions')}
            >
              {busy === 'portfolioPositions' ? 'Запуск…' : COPY.portfolioPositions.button}
            </Button>
            <Button variant="outlined" disabled={busy !== null} onClick={() => open('trainingQuick')}>
              {busy === 'trainingQuick' ? 'Запуск…' : COPY.trainingQuick.button}
            </Button>
            <Button variant="outlined" disabled={busy !== null} onClick={() => open('trainingFull')}>
              {busy === 'trainingFull' ? 'Запуск…' : COPY.trainingFull.button}
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(confirmKind)}
        onClose={() => busy === null && setConfirmKind(null)}
        fullWidth
        maxWidth="sm"
      >
        {pending && confirmKind ? (
          <>
            <DialogTitle>{pending.title}</DialogTitle>
            <DialogContent>
              <Alert severity="warning" sx={{ mb: 2 }}>
                {confirmKind === 'trainingFull'
                  ? 'Очень длительная операция (GPU/CPU, диск). Запускайте осознанно.'
                  : 'Длительная операция. Убедитесь, что это уместно для текущего окружения.'}
              </Alert>
              <Typography variant="body2">{pending.body}</Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmKind(null)} disabled={busy !== null}>
                Отмена
              </Button>
              <Button
                variant="contained"
                disabled={busy !== null}
                onClick={() => void run(confirmKind)}
              >
                {busy ? 'Запуск…' : pending.confirm}
              </Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>

      <Snackbar
        open={Boolean(snack)}
        autoHideDuration={8000}
        onClose={() => setSnack(null)}
        message={snack?.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  )
}
