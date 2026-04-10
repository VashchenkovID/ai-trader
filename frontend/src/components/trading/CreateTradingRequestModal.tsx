import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TradingRequestsService } from '@/api/generated'
import { apiErrorMessage } from '@/utils/apiErrorMessage'
import { unwrapEnvelopeData } from '@/utils/unwrapEnvelope'

const PROFILE_SLUGS = ['conservative', 'moderate', 'aggressive', 'experimental'] as const
const MODES = ['paper', 'real', 'micro'] as const

type PreviewOk = {
  ok: true
  figi: string
  action: string
  mode: string
  quantity: number
  price: number
  budget: number
  ticker?: string | null
  name?: string | null
  recommendation?: string | null
  confidence?: number | null
  score?: number | null
  hasActiveRequest: boolean
}

type PreviewErr = { ok: false; errorCode?: string; message?: string }

export type PreviewResult = PreviewOk | PreviewErr

export type CreateTradingRequestModalProps = {
  open: boolean
  onClose: () => void
  recommendationFigi?: string | null
  recommendationData?: Record<string, unknown> | null
  initialAction: 'BUY' | 'SELL'
  /** Только продажа (позиция в портфеле) */
  lockActionToSell?: boolean
  initialMode?: (typeof MODES)[number]
  /** Строка количества; пусто = авто на бэкенде */
  initialQuantity?: string
  /** Стартовое значение селекта виртуального профиля (paper / micro). */
  initialVirtualProfile?: string
  /** Не давать сменить профиль (продажа из конкретного виртуального портфеля). */
  lockVirtualProfile?: boolean
  onSuccess?: () => void
}

function formatRub(n: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(n)
}

function asPreview(raw: Record<string, unknown> | null): PreviewResult | null {
  if (!raw) return null
  if (raw.ok === false) {
    return {
      ok: false,
      errorCode: typeof raw.errorCode === 'string' ? raw.errorCode : undefined,
      message: typeof raw.message === 'string' ? raw.message : undefined,
    }
  }
  if (raw.ok !== true) return null
  return raw as unknown as PreviewOk
}

export function CreateTradingRequestModal({
  open,
  onClose,
  recommendationFigi,
  recommendationData,
  initialAction,
  lockActionToSell = false,
  initialMode,
  initialQuantity = '',
  initialVirtualProfile,
  lockVirtualProfile = false,
  onSuccess,
}: CreateTradingRequestModalProps) {
  const [mode, setMode] = useState<(typeof MODES)[number]>('paper')
  const [virtualProfile, setVirtualProfile] = useState<string>('moderate')
  const [action, setAction] = useState<'BUY' | 'SELL'>('BUY')
  const [quantityInput, setQuantityInput] = useState('')
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hasFigi = Boolean(recommendationFigi?.trim())
  const hasData = Boolean(recommendationData && typeof recommendationData === 'object')
  const validContext = (hasFigi && !recommendationData) || (hasData && !hasFigi)

  const quantityOverride = useMemo(() => {
    const t = quantityInput.trim()
    if (!t) return undefined
    const n = parseInt(t, 10)
    return Number.isFinite(n) && n >= 1 ? n : undefined
  }, [quantityInput])

  const runPreview = useCallback(async () => {
    if (!validContext) return
    setLoadingPreview(true)
    setPreviewError(null)
    try {
      const options = {
        action,
        mode,
        virtualProfile,
        quantity: quantityOverride ?? null,
      }
      const envelope = await TradingRequestsService.tradingRequestPreviewApiV1TradingRequestsPreviewPost({
        requestBody: hasFigi
          ? { recommendationFigi: recommendationFigi!.trim(), options }
          : { recommendationData: recommendationData!, options },
      })
      const raw = unwrapEnvelopeData<Record<string, unknown>>(envelope)
      setPreview(asPreview(raw))
    } catch (e) {
      setPreview(null)
      setPreviewError(apiErrorMessage(e))
    } finally {
      setLoadingPreview(false)
    }
  }, [action, hasFigi, mode, quantityOverride, recommendationData, recommendationFigi, validContext, virtualProfile])

  useEffect(() => {
    if (!open) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      return
    }
    setSubmitError(null)
    setCreatedId(null)
    setPreview(null)
    setPreviewError(null)
    setMode(initialMode ?? (hasFigi ? 'paper' : 'real'))
    const vp = initialVirtualProfile?.trim().toLowerCase()
    setVirtualProfile(
      vp && PROFILE_SLUGS.includes(vp as (typeof PROFILE_SLUGS)[number]) ? vp : 'moderate',
    )
    setAction(lockActionToSell ? 'SELL' : initialAction)
    setQuantityInput(initialQuantity)
  }, [
    open,
    initialAction,
    initialMode,
    initialQuantity,
    initialVirtualProfile,
    hasFigi,
    lockActionToSell,
  ])

  useEffect(() => {
    if (!open || !validContext) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void runPreview()
    }, 350)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [open, validContext, runPreview, quantityInput, mode, virtualProfile, action])

  const handleSubmit = async () => {
    if (!validContext || !preview || preview.ok !== true) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const options = {
        action,
        mode,
        virtualProfile,
        quantity: quantityOverride ?? null,
      }
      const envelope = await TradingRequestsService.tradingRequestCreateApiV1TradingRequestsCreatePost({
        requestBody: hasFigi
          ? { recommendationFigi: recommendationFigi!.trim(), options }
          : { recommendationData: recommendationData!, options },
      })
      const raw = unwrapEnvelopeData<Record<string, unknown>>(envelope)
      const id = raw?.id != null ? String(raw.id) : null
      setCreatedId(id)
      onSuccess?.()
    } catch (e) {
      setSubmitError(apiErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  const previewOk = preview?.ok === true

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Новая торговая заявка</DialogTitle>
      <DialogContent>
        {!validContext ? (
          <Alert severity="error">Некорректный контекст: укажите recommendationFigi или recommendationData.</Alert>
        ) : (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Заявка создаётся со статусом <strong>PENDING</strong> (ожидает одобрения в разделе «Торговые
              заявки»), если не сработало автоисполнение paper-контура.
            </Typography>

            <FormControl size="small" fullWidth>
              <InputLabel id="tr-m-mode">Режим</InputLabel>
              <Select
                labelId="tr-m-mode"
                label="Режим"
                value={mode}
                onChange={e => setMode(String(e.target.value) as (typeof MODES)[number])}
              >
                {MODES.map(m => (
                  <MenuItem key={m} value={m}>
                    {m}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {lockVirtualProfile ? (
              <Alert severity="info" variant="outlined">
                Виртуальный профиль: <strong>{virtualProfile}</strong>
              </Alert>
            ) : (
              <FormControl size="small" fullWidth>
                <InputLabel id="tr-m-vp">Виртуальный портфель</InputLabel>
                <Select
                  labelId="tr-m-vp"
                  label="Виртуальный портфель"
                  value={virtualProfile}
                  onChange={e => setVirtualProfile(String(e.target.value))}
                >
                  {PROFILE_SLUGS.map(s => (
                    <MenuItem key={s} value={s}>
                      {s}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {!lockActionToSell ? (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Направление
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={action}
                  onChange={(_, v) => v != null && setAction(v)}
                >
                  <ToggleButton value="BUY">Купить</ToggleButton>
                  <ToggleButton value="SELL">Продать</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            ) : (
              <Alert severity="info" variant="outlined">
                Продажа позиции с реального портфеля (направление SELL).
              </Alert>
            )}

            <TextField
              size="small"
              fullWidth
              label="Количество (пусто — авто)"
              value={quantityInput}
              onChange={e => setQuantityInput(e.target.value)}
              slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              helperText="Оставьте пустым для расчёта на сервере (BUY: доля капитала; SELL: позиция в виртуальном профиле или из данных)."
            />

            {loadingPreview ? <LinearProgress /> : null}
            {previewError ? <Alert severity="error">{previewError}</Alert> : null}

            {preview && preview.ok === false ? (
              <Alert severity="warning">
                {preview.message || preview.errorCode || 'Предрасчёт не выполнен'}
              </Alert>
            ) : null}

            {previewOk ? (
              <PaperSection
                preview={preview}
                onRecalc={() => void runPreview()}
                recalculating={loadingPreview}
              />
            ) : null}

            {submitError ? <Alert severity="error">{submitError}</Alert> : null}

            {createdId ? (
              <Alert severity="success">
                Заявка создана. ID: <code>{createdId}</code>
                <Box sx={{ mt: 1 }}>
                  <Button component={Link} to="/trading-requests" size="small" variant="outlined">
                    К списку заявок
                  </Button>
                </Box>
              </Alert>
            ) : null}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{createdId ? 'Закрыть' : 'Отмена'}</Button>
        {!createdId ? (
          <Button
            variant="contained"
            disabled={!validContext || !previewOk || submitting || loadingPreview}
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Создание…' : 'Создать заявку'}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  )
}

function PaperSection({
  preview,
  onRecalc,
  recalculating,
}: {
  preview: PreviewOk
  onRecalc: () => void
  recalculating: boolean
}) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'action.hover',
      }}
    >
      <Typography variant="subtitle2" gutterBottom>
        Предрасчёт
      </Typography>
      <Stack spacing={0.5}>
        <Typography variant="body2">
          <strong>FIGI:</strong> {preview.figi}
        </Typography>
        {preview.ticker ? (
          <Typography variant="body2">
            <strong>Тикер:</strong> {preview.ticker}
          </Typography>
        ) : null}
        <Typography variant="body2">
          <strong>Действие:</strong> {preview.action} · <strong>Режим:</strong> {preview.mode}
        </Typography>
        <Typography variant="body2">
          <strong>Количество:</strong> {preview.quantity} · <strong>Цена:</strong>{' '}
          {formatRub(preview.price)}
        </Typography>
        <Typography variant="body2">
          <strong>Бюджет:</strong> {formatRub(preview.budget)}
        </Typography>
        {preview.hasActiveRequest ? (
          <Alert severity="warning" sx={{ mt: 1 }}>
            Уже есть активная заявка по этому FIGI и профилю — создание новой может быть отклонено.
          </Alert>
        ) : null}
      </Stack>
      <Button size="small" sx={{ mt: 1 }} onClick={onRecalc} disabled={recalculating}>
        Обновить расчёт
      </Button>
    </Box>
  )
}

export function parsePositionQuantity(p: Record<string, unknown>): number {
  const q = p.quantity
  if (typeof q === 'number' && Number.isFinite(q)) return Math.max(0, Math.floor(q))
  if (q && typeof q === 'object') {
    const o = q as Record<string, unknown>
    const u = o.units
    const n = o.nano
    if (typeof u === 'string' || typeof u === 'number') {
      const base = typeof u === 'number' ? u : parseInt(String(u), 10)
      if (Number.isFinite(base)) return Math.max(0, Math.floor(Number(base)))
    }
    if (typeof n === 'number' && Number.isFinite(n)) {
      return Math.max(0, Math.floor(n / 1e9))
    }
  }
  const parsed = parseInt(String(q ?? ''), 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}
