import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Divider,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, MarketService } from '@/api/generated'
import { ChartContainer } from '@/components/charts/ChartContainer'
import { RecommendationStatusBadge } from '@/components/recommendations/RecommendationStatusBadge'
import { recommendationSignalLabelRu } from '@/components/recommendations/recommendationSignal'
import { CreateTradingRequestModal } from '@/components/trading'
import { LabeledValuesTable } from '@/components/ops'
import { CandlesChart, type CandleRow } from '@/components/recommendations/CandlesChart'
import { VolumeHistogramChart } from '@/components/recommendations/VolumeHistogramChart'
import type { RecommendationRecord } from '@/utils/recommendationFormat'
import { formatPrice, formatScoreConfidence, recNum, recString } from '@/utils/recommendationFormat'
import {
  parseExplain,
  summarizeLlmJuryForUser,
  summarizeNnPayloadForUser,
  tradePlanToRows,
} from '@/utils/recommendationPayloadHumanize'
import { apiErrorMessage } from '@/utils/apiErrorMessage'

function tradeActionFromRecommendation(r: RecommendationRecord): 'BUY' | 'SELL' {
  const s = recString(r, 'recommendation').toUpperCase()
  return s === 'SELL' ? 'SELL' : 'BUY'
}

function tradeButtonLabel(action: 'BUY' | 'SELL') {
  return action === 'SELL' ? 'Продать' : 'Купить'
}

function RecommendationDetailPage() {
  const { figi: figiParam } = useParams<{ figi: string }>()
  const figi = figiParam ? decodeURIComponent(figiParam) : ''

  const [rec, setRec] = useState<RecommendationRecord | null>(null)
  const [candles, setCandles] = useState<CandleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [candlesNote, setCandlesNote] = useState<string | null>(null)
  const [tradeOpen, setTradeOpen] = useState(false)
  const [analystItems, setAnalystItems] = useState<Record<string, unknown>[]>([])
  const [analystLoading, setAnalystLoading] = useState(false)

  const formatSyncedAt = useCallback((v: unknown) => {
    if (v == null || v === '') return '—'
    const d = new Date(String(v))
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('ru-RU')
  }, [])

  const load = useCallback(async () => {
    if (!figi) {
      setError('Не указан FIGI')
      setLoading(false)
      setAnalystItems([])
      setAnalystLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setCandlesNote(null)
    try {
      const env = await MarketService.marketRecommendationByFigiApiV1MarketRecommendationsFigiGet({
        figi,
      })
      const data = env.data as RecommendationRecord
      setRec(data)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setError('Рекомендация не найдена для этого FIGI.')
      } else {
        setError(apiErrorMessage(e))
      }
      setRec(null)
      setCandles([])
      setAnalystItems([])
      setAnalystLoading(false)
      setLoading(false)
      return
    }

    setAnalystLoading(true)
    setAnalystItems([])
    try {
      const [candlesOutcome, analystOutcome] = await Promise.allSettled([
        MarketService.marketStockCandlesApiV1MarketStockFigiCandlesGet({
          figi,
          offset: 0,
          limit: 365,
        }),
        MarketService.marketStockAnalystSignalsApiV1MarketStockFigiAnalystSignalsGet({ figi }),
      ])

      if (candlesOutcome.status === 'fulfilled') {
        const cData = candlesOutcome.value.data as { items?: unknown[]; meta?: { total?: number } }
        const raw = Array.isArray(cData.items) ? cData.items : []
        setCandles(raw.filter(Boolean) as CandleRow[])
        const t = cData.meta?.total
        if (typeof t === 'number' && t === 0) {
          setCandlesNote('В базе нет свечей по этому инструменту.')
        }
      } else {
        setCandles([])
        setCandlesNote('Не удалось загрузить свечи.')
      }

      if (analystOutcome.status === 'fulfilled') {
        const aData = analystOutcome.value.data as { items?: unknown[] }
        const list = Array.isArray(aData.items) ? aData.items : []
        setAnalystItems(
          list.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
        )
      } else {
        setAnalystItems([])
      }
    } finally {
      setAnalystLoading(false)
      setLoading(false)
    }
  }, [figi])

  useEffect(() => {
    void load()
  }, [load])

  const signal = rec ? recString(rec, 'recommendation') : ''

  const explainBlock = useMemo(() => parseExplain(rec?.explain), [rec?.explain])

  const horizonLine = useMemo(() => {
    const hm = rec?.horizonMomentum
    if (!Array.isArray(hm)) return ''
    const parts = hm
      .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object')
      .map((x, i) => {
        const label = String(x.label ?? x.id ?? `Период ${i + 1}`)
        const ret =
          x.returnPct != null
            ? `${typeof x.returnPct === 'number' ? x.returnPct.toFixed(2) : String(x.returnPct)}%`
            : '—'
        const hint = x.kind != null ? String(x.kind) : ''
        return hint ? `${label}: ${ret} (${hint})` : `${label}: ${ret}`
      })
    return parts.join(' · ')
  }, [rec?.horizonMomentum])

  const llmCard = useMemo(() => summarizeLlmJuryForUser(rec?.llmJuryPayload), [rec?.llmJuryPayload])

  const nnHints = useMemo(() => summarizeNnPayloadForUser(rec?.nnPayload), [rec?.nnPayload])

  const tradePlanRows = useMemo(
    () => (rec?.tradePlan != null ? tradePlanToRows(rec.tradePlan) : []),
    [rec?.tradePlan]
  )

  const hasExplainContent = Boolean(
    explainBlock && (explainBlock.summaryText || explainBlock.detailRows.length > 0)
  )
  const hasModelsSection =
    tradePlanRows.length > 0 ||
    rec?.llmJuryPayload != null ||
    rec?.nnPayload != null ||
    Boolean(llmCard) ||
    nnHints.length > 0
  const hasHorizonContent = Boolean(horizonLine)
  const showReasoningAndPlanPaper = hasExplainContent || hasModelsSection || hasHorizonContent

  if (!figi) {
    return (
      <Alert severity="warning">
        Некорректный маршрут.{' '}
        <Button component={Link} to="/recommendations">
          К списку
        </Button>
      </Alert>
    )
  }

  return (
    <Stack spacing={3}>
      <Breadcrumbs aria-label="Навигация" sx={{ color: 'text.secondary' }}>
        <Typography
          component={Link}
          to="/dashboard"
          variant="body2"
          sx={{
            color: 'text.secondary',
            textDecoration: 'none',
            '&:hover': { color: 'primary.main', textDecoration: 'underline' },
          }}
        >
          Главная
        </Typography>
        <Typography
          component={Link}
          to="/recommendations"
          variant="body2"
          sx={{
            color: 'text.secondary',
            textDecoration: 'none',
            '&:hover': { color: 'primary.main', textDecoration: 'underline' },
          }}
        >
          Рекомендации
        </Typography>
        <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 600 }}>
          {recString(rec ?? {}, 'ticker') || figi.slice(0, 12) || 'Карточка'}
        </Typography>
      </Breadcrumbs>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        <Button
          component={Link}
          to="/recommendations"
          startIcon={<ArrowBackIcon />}
          variant="outlined"
          size="small"
        >
          Все рекомендации
        </Button>
        <Typography
          variant="h5"
          component="span"
          sx={{ ml: { sm: 1 }, color: 'text.primary', fontWeight: 700 }}
        >
          {recString(rec ?? {}, 'ticker') || 'Инструмент'}
        </Typography>
        <RecommendationStatusBadge value={signal} />
        {rec && !error ? (
          <Button
            variant="contained"
            size="small"
            sx={{ ml: 'auto' }}
            color={tradeActionFromRecommendation(rec) === 'SELL' ? 'secondary' : 'primary'}
            onClick={() => setTradeOpen(true)}
          >
            {tradeButtonLabel(tradeActionFromRecommendation(rec))}
          </Button>
        ) : null}
      </Box>

      <CreateTradingRequestModal
        open={tradeOpen}
        onClose={() => setTradeOpen(false)}
        recommendationFigi={figi}
        initialAction={rec ? tradeActionFromRecommendation(rec) : 'BUY'}
        onSuccess={() => void load()}
      />

      {loading ? <LinearProgress /> : null}

      {error ? (
        <Alert severity="error" action={<Button onClick={() => void load()}>Повторить</Button>}>
          {error}
        </Alert>
      ) : null}

      {rec && !error ? (
        <>
          <Grid container spacing={2} sx={{ alignItems: 'flex-start' }}>
            <Grid size={{ xs: 12, lg: 4 }}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Box>
                    <Typography variant="h6" component="h1" sx={{ color: 'primary.main' }}>
                      {recString(rec, 'name') || recString(rec, 'ticker')}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      <Box component="span" sx={{ color: 'secondary.main', fontWeight: 600 }}>
                        Тикер:
                      </Box>{' '}
                      {recString(rec, 'ticker') || '—'}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: 'monospace',
                        color: 'text.disabled',
                        display: 'block',
                        mt: 0.25,
                      }}
                    >
                      FIGI {figi}
                    </Typography>
                  </Box>

                  <Box sx={{ pt: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{ color: 'secondary.main', fontWeight: 600 }}
                      >
                        Сигналы аналитиков
                      </Typography>
                      {analystLoading ? (
                        <CircularProgress size={18} color="secondary" aria-label="Загрузка" />
                      ) : null}
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.disabled', display: 'block', mb: 1 }}
                    >
                      Данные из БД (синхронизация Tinkoff Invest API). Могут отсутствовать, если
                      задача обновления сигналов ещё не подтянула инструмент.
                    </Typography>
                    {!analystLoading && analystItems.length === 0 ? (
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Нет записей по этому FIGI.
                      </Typography>
                    ) : null}
                    {!analystLoading && analystItems.length > 0 ? (
                      <Stack spacing={1}>
                        {analystItems.map((row, idx) => {
                          const uid = row.signalUid != null ? String(row.signalUid) : `sig-${idx}`
                          const dir = row.direction != null ? String(row.direction) : ''
                          return (
                            <Box
                              key={uid}
                              sx={{
                                p: 1,
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: 'background.paper',
                              }}
                            >
                              <Box
                                sx={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  alignItems: 'center',
                                  gap: 1,
                                }}
                              >
                                <RecommendationStatusBadge value={dir} />
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                  обновлено: {formatSyncedAt(row.syncedAt)}
                                </Typography>
                              </Box>
                              {row.signalUid != null ? (
                                <Typography
                                  variant="caption"
                                  sx={{
                                    fontFamily: 'monospace',
                                    color: 'text.disabled',
                                    display: 'block',
                                    mt: 0.5,
                                  }}
                                >
                                  uid: {String(row.signalUid)}
                                </Typography>
                              ) : null}
                            </Box>
                          )
                        })}
                      </Stack>
                    ) : null}
                  </Box>

                  <Divider flexItem />
                  <Stack spacing={0.75}>
                    <Typography variant="body1" sx={{ color: 'text.primary' }}>
                      <Box component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>
                        Сигнал:
                      </Box>{' '}
                      {recommendationSignalLabelRu(signal)} ·{' '}
                      <Box component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>
                        Уверенность и оценка:
                      </Box>{' '}
                      {formatScoreConfidence(recNum(rec, 'score'), recNum(rec, 'confidence'))}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      <Box component="span" sx={{ color: 'secondary.main', fontWeight: 600 }}>
                        Цена на момент анализа:
                      </Box>{' '}
                      <Box component="span" sx={{ color: 'text.primary' }}>
                        {formatPrice(rec.lastPrice)}
                      </Box>
                    </Typography>
                    {(() => {
                      const ns = recNum(rec, 'nnScore')
                      const nc = recNum(rec, 'nnConfidence')
                      if (ns == null && nc == null) return null
                      return (
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          <Box component="span" sx={{ color: 'primary.main', fontWeight: 600 }}>
                            Нейросеть:
                          </Box>{' '}
                          {formatScoreConfidence(ns, nc)}
                        </Typography>
                      )
                    })()}
                    {recString(rec, 'paperRecommendation') ? (
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        <Box component="span" sx={{ color: 'secondary.main', fontWeight: 600 }}>
                          Paper:
                        </Box>{' '}
                        {recommendationSignalLabelRu(recString(rec, 'paperRecommendation'))} ·{' '}
                        {formatScoreConfidence(
                          recNum(rec, 'paperScore'),
                          recNum(rec, 'paperConfidence')
                        )}
                      </Typography>
                    ) : null}
                    {recString(rec, 'analysisDate') ? (
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        Дата анализа: {formatSyncedAt(recString(rec, 'analysisDate'))}
                      </Typography>
                    ) : null}
                  </Stack>
                </Stack>
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, lg: 8 }}>
              <Stack spacing={2}>
                <ChartContainer
                  title="Свечи (закрытия)"
                  minHeight={280}
                  titleSx={{ color: 'primary.main', fontWeight: 600 }}
                >
                  {candlesNote ? (
                    <Typography sx={{ mb: 1, color: 'text.secondary', fontSize: '0.8125rem' }}>
                      {candlesNote}
                    </Typography>
                  ) : null}
                  <CandlesChart candles={candles} emptyLabel="Нет данных свечей." />
                </ChartContainer>
                <ChartContainer
                  title="Объём торгов"
                  minHeight={280}
                  titleSx={{ color: 'secondary.main', fontWeight: 600 }}
                >
                  {candlesNote ? (
                    <Typography sx={{ mb: 1, color: 'text.secondary', fontSize: '0.8125rem' }}>
                      {candlesNote}
                    </Typography>
                  ) : null}
                  <VolumeHistogramChart
                    candles={candles}
                    emptyLabel="В свечах нет поля volume или оно нулевое."
                  />
                </ChartContainer>
              </Stack>
            </Grid>
          </Grid>

          {showReasoningAndPlanPaper ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography
                variant="subtitle1"
                gutterBottom
                sx={{ color: 'primary.main', fontWeight: 600, mb: 2 }}
              >
                Обоснование, план сделки и мнение моделей
              </Typography>
              <Stack spacing={2.5}>
                {hasExplainContent && explainBlock ? (
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: tradePlanRows.length > 0 ? 6 : 12 }}>
                      <Box>
                        <Typography
                          variant="subtitle2"
                          gutterBottom
                          sx={{ color: 'secondary.main', fontWeight: 600 }}
                        >
                          Краткое обоснование
                        </Typography>
                        {explainBlock.summaryText ? (
                          <Typography
                            variant="body1"
                            sx={{
                              whiteSpace: 'pre-wrap',
                              mb: explainBlock.detailRows.length ? 2 : 0,
                              color: 'text.primary',
                            }}
                          >
                            {explainBlock.summaryText}
                          </Typography>
                        ) : null}
                        {explainBlock.detailRows.length > 0 ? (
                          <LabeledValuesTable
                            rows={explainBlock.detailRows.map(r => ({
                              label: r.label,
                              value: r.value,
                            }))}
                          />
                        ) : null}
                      </Box>
                    </Grid>
                    {tradePlanRows.length > 0 ? (
                      <Grid size={{ xs: 12, md: hasExplainContent ? 6 : 12 }}>
                        <Box>
                          <Typography
                            variant="subtitle2"
                            gutterBottom
                            sx={{ color: 'primary.main', fontWeight: 600 }}
                          >
                            Торговый план
                          </Typography>
                          <LabeledValuesTable rows={tradePlanRows} />
                        </Box>
                      </Grid>
                    ) : null}
                  </Grid>
                ) : tradePlanRows.length > 0 ? (
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 12 }}>
                      <Box>
                        <Typography
                          variant="subtitle2"
                          gutterBottom
                          sx={{ color: 'primary.main', fontWeight: 600 }}
                        >
                          Торговый план
                        </Typography>
                        <LabeledValuesTable rows={tradePlanRows} />
                      </Box>
                    </Grid>
                  </Grid>
                ) : null}

                {(hasExplainContent || tradePlanRows.length > 0) &&
                (llmCard != null ||
                  rec.llmJuryPayload != null ||
                  nnHints.length > 0 ||
                  rec.nnPayload != null) ? (
                  <Divider flexItem />
                ) : null}

                {llmCard != null ||
                rec.llmJuryPayload != null ||
                nnHints.length > 0 ||
                rec.nnPayload != null ? (
                  <Grid container spacing={2} sx={{ alignItems: 'flex-start' }}>
                    {llmCard != null || rec.llmJuryPayload != null ? (
                      <Grid
                        size={{
                          xs: 12,
                          md: nnHints.length > 0 || rec.nnPayload != null ? 6 : 12,
                        }}
                      >
                        <Box>
                          <Typography
                            variant="subtitle2"
                            gutterBottom
                            sx={{ color: 'secondary.main', fontWeight: 600 }}
                          >
                            Мнение LLM-жюри
                          </Typography>
                          {llmCard ? (
                            <Stack spacing={1}>
                              <Typography
                                variant="body1"
                                sx={{ fontWeight: 600, color: 'text.primary' }}
                              >
                                {llmCard.title}
                              </Typography>
                              {llmCard.lines.map((line, i) => (
                                <Typography
                                  key={i}
                                  variant="body2"
                                  sx={{ color: 'text.secondary' }}
                                >
                                  {line}
                                </Typography>
                              ))}
                              {llmCard.providers.length > 0 ? (
                                <Stack component="ul" spacing={0.5} sx={{ pl: 2.25, m: 0 }}>
                                  {llmCard.providers.map(p => (
                                    <Typography
                                      key={p.name}
                                      component="li"
                                      variant="body2"
                                      sx={{ color: 'text.secondary' }}
                                    >
                                      <Box
                                        component="span"
                                        sx={{ color: 'primary.main', fontWeight: 600 }}
                                      >
                                        {p.name}
                                      </Box>{' '}
                                      — {p.text}
                                    </Typography>
                                  ))}
                                </Stack>
                              ) : null}
                            </Stack>
                          ) : (
                            <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                              Данные жюри сохранены в нестандартном формате — краткое резюме
                              недоступно.
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                    ) : null}
                    {nnHints.length > 0 || rec.nnPayload != null ? (
                      <Grid
                        size={{
                          xs: 12,
                          md: llmCard != null || rec.llmJuryPayload != null ? 6 : 12,
                        }}
                      >
                        <Box>
                          <Typography
                            variant="subtitle2"
                            gutterBottom
                            sx={{ color: 'primary.main', fontWeight: 600 }}
                          >
                            Нейросеть
                          </Typography>
                          {nnHints.length > 0 ? (
                            <Stack spacing={0.5}>
                              {nnHints.map((t, i) => (
                                <Typography
                                  key={i}
                                  variant="body2"
                                  sx={{ color: 'text.secondary' }}
                                >
                                  {t}
                                </Typography>
                              ))}
                            </Stack>
                          ) : (
                            <Typography variant="body2" sx={{ color: 'text.disabled' }}>
                              Дополнительное текстовое резюме по признакам недоступно.
                            </Typography>
                          )}
                        </Box>
                      </Grid>
                    ) : null}
                  </Grid>
                ) : null}

                {(hasExplainContent ||
                  tradePlanRows.length > 0 ||
                  llmCard != null ||
                  rec.llmJuryPayload != null ||
                  nnHints.length > 0 ||
                  rec.nnPayload != null) &&
                hasHorizonContent ? (
                  <Divider flexItem />
                ) : null}

                {hasHorizonContent ? (
                  <Box>
                    <Typography
                      variant="subtitle2"
                      gutterBottom
                      sx={{ color: 'primary.main', fontWeight: 600 }}
                    >
                      Доходность до даты анализа
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 1, color: 'text.secondary' }}>
                      Фактические изменения цены за 1 / 5 / ~20 дней до точки анализа (признаки
                      модели, не прогноз).
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.primary' }}>
                      {horizonLine}
                    </Typography>
                  </Box>
                ) : null}
              </Stack>
            </Paper>
          ) : null}
        </>
      ) : null}
    </Stack>
  )
}

export { RecommendationDetailPage }
export default RecommendationDetailPage
