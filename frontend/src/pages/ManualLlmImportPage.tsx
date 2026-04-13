import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useCallback, useMemo, useState } from 'react'
import { PortfolioAnalysisService, TrainingService } from '@/api/generated'
import { apiErrorMessage } from '@/utils/apiErrorMessage'

function ManualLlmImportPage() {
  const [chunkIndex, setChunkIndex] = useState(0)
  const [chunkTotal, setChunkTotal] = useState<number | null>(null)
  const [batchSize, setBatchSize] = useState<number | null>(null)
  const [figis, setFigis] = useState<string[]>([])
  const [prompt, setPrompt] = useState('')
  const [giga, setGiga] = useState('')
  const [alisa, setAlisa] = useState('')
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultMsg, setResultMsg] = useState<string | null>(null)
  const [snack, setSnack] = useState<string | null>(null)

  const portfolioScopeOptions = useMemo(
    () => [
      { value: 'real', label: 'Реальный счёт' },
      { value: 'virtual:conservative', label: 'Виртуальный · conservative' },
      { value: 'virtual:moderate', label: 'Виртуальный · moderate' },
      { value: 'virtual:aggressive', label: 'Виртуальный · aggressive' },
      { value: 'virtual:experimental', label: 'Виртуальный · experimental' },
    ],
    [],
  )

  const [pfScope, setPfScope] = useState('virtual:moderate')
  const [pfFigiFilterText, setPfFigiFilterText] = useState('')
  const [pfPrompt, setPfPrompt] = useState('')
  const [pfFigis, setPfFigis] = useState<string[]>([])
  const [pfExternalRaw, setPfExternalRaw] = useState('')
  const [pfLoadingPrompt, setPfLoadingPrompt] = useState(false)
  const [pfApplying, setPfApplying] = useState(false)
  const [pfError, setPfError] = useState<string | null>(null)
  const [pfResult, setPfResult] = useState<string | null>(null)

  const parsePfFigiFilter = useCallback((): string[] | undefined => {
    const parts = pfFigiFilterText
      .split(/[\s,;]+/)
      .map(s => s.trim())
      .filter(Boolean)
    return parts.length ? parts : undefined
  }, [pfFigiFilterText])

  const loadPortfolioPrompt = useCallback(async () => {
    setPfLoadingPrompt(true)
    setPfError(null)
    setPfResult(null)
    try {
      const figi = parsePfFigiFilter()
      const res = await PortfolioAnalysisService.getManualPromptApiV1PortfolioAnalysisManualPromptGet({
        portfolioScope: pfScope,
        figi,
      })
      const d = res.data as {
        prompt?: string
        figis?: string[]
        message?: string
        portfolioScope?: string
      }
      if (d.message === 'no_positions') {
        setPfPrompt('')
        setPfFigis([])
        setPfError('В этом портфеле нет открытых позиций — промпт недоступен.')
        return
      }
      setPfPrompt(typeof d.prompt === 'string' ? d.prompt : '')
      setPfFigis(Array.isArray(d.figis) ? d.figis : [])
    } catch (e) {
      setPfError(apiErrorMessage(e))
      setPfFigis([])
      setPfPrompt('')
    } finally {
      setPfLoadingPrompt(false)
    }
  }, [parsePfFigiFilter, pfScope])

  const copyPortfolioPrompt = useCallback(async () => {
    if (!pfPrompt) return
    try {
      await navigator.clipboard.writeText(pfPrompt)
      setSnack('Промпт портфеля скопирован')
    } catch {
      setSnack('Не удалось скопировать')
    }
  }, [pfPrompt])

  const applyPortfolioManual = useCallback(async () => {
    if (!pfFigis.length) {
      setPfError('Сначала загрузите промпт — нужен список FIGI.')
      return
    }
    setPfApplying(true)
    setPfError(null)
    setPfResult(null)
    try {
      const res = await PortfolioAnalysisService.postManualApplyApiV1PortfolioAnalysisManualApplyPost({
        requestBody: {
          portfolio_scope: pfScope,
          figi: pfFigis,
          external_raw: pfExternalRaw,
        },
      })
      const d = res.data as { saved?: number; missingFigisInResponse?: string[]; llmSource?: string }
      const miss = Array.isArray(d.missingFigisInResponse) ? d.missingFigisInResponse : []
      setPfResult(
        `Сохранено записей: ${d.saved ?? 0}. Источник: ${d.llmSource ?? '—'}.` +
          (miss.length ? ` Нет в JSON ответа по FIGI: ${miss.join(', ')}.` : ''),
      )
    } catch (e) {
      setPfError(apiErrorMessage(e))
    } finally {
      setPfApplying(false)
    }
  }, [pfExternalRaw, pfFigis, pfScope])

  const loadPrompt = useCallback(async () => {
    setLoadingPrompt(true)
    setError(null)
    setResultMsg(null)
    try {
      const res = await TrainingService.manualLlmPromptChunkApiV1TrainingLlmManualPromptChunkGet({
        chunkIndex,
      })
      const d = res.data as {
        chunkIndex?: number
        chunkTotal?: number
        batchSize?: number
        figis?: string[]
        prompt?: string
      }
      setChunkTotal(typeof d.chunkTotal === 'number' ? d.chunkTotal : null)
      setBatchSize(typeof d.batchSize === 'number' ? d.batchSize : null)
      setFigis(Array.isArray(d.figis) ? d.figis : [])
      setPrompt(typeof d.prompt === 'string' ? d.prompt : '')
    } catch (e) {
      setError(apiErrorMessage(e))
      setFigis([])
      setPrompt('')
    } finally {
      setLoadingPrompt(false)
    }
  }, [chunkIndex])

  const copyPrompt = useCallback(async () => {
    if (!prompt) return
    try {
      await navigator.clipboard.writeText(prompt)
      setSnack('Промпт скопирован')
    } catch {
      setSnack('Не удалось скопировать')
    }
  }, [prompt])

  const applyBatch = useCallback(async () => {
    if (!figis.length) {
      setError('Сначала загрузите промпт для этого чанка.')
      return
    }
    setApplying(true)
    setError(null)
    setResultMsg(null)
    try {
      const res = await TrainingService.manualLlmApplyChunkApiV1TrainingLlmManualApplyChunkPost({
        requestBody: {
          chunkIndex,
          figi: figis,
          gigachatRaw: giga,
          alisaRaw: alisa,
        },
      })
      const d = res.data as { updated?: string[]; errors?: { figi?: string; message?: string }[] }
      const updated = Array.isArray(d.updated) ? d.updated.length : 0
      const errs = Array.isArray(d.errors) ? d.errors : []
      setResultMsg(
        `Обновлено: ${updated}. Предупреждений/ошибок по FIGI: ${errs.length}` +
          (errs.length
            ? ` — ${errs.map(e => `${e.figi ?? '?'}: ${e.message ?? ''}`).join('; ')}`
            : ''),
      )
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setApplying(false)
    }
  }, [alisa, chunkIndex, figis, giga])

  const batchLabel =
    chunkTotal != null && chunkTotal > 0 ? `Чанк ${chunkIndex + 1} из ${chunkTotal}` : `Чанк #${chunkIndex}`

  const readonlyPromptSx = {
    flex: 1,
    minWidth: 0,
    '& .MuiInputBase-root': {
      fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
      alignItems: 'flex-start',
    },
    '& .MuiInputBase-input': {
      fontSize: { xs: '0.6875rem', sm: '0.75rem' },
      lineHeight: 1.4,
      py: 0.5,
    },
    '& .MuiInputLabel-root': {
      fontSize: { xs: '0.75rem', sm: '0.8125rem' },
    },
  } as const

  /** Поля вставки ответов нейросетей: компактный шрифт, ровно 6 видимых строк, дальше прокрутка. */
  const neuralResponseSx = {
    '& .MuiInputBase-root': {
      fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
      alignItems: 'flex-start',
    },
    '& .MuiInputBase-input': {
      fontSize: { xs: '0.6875rem', sm: '0.75rem' },
      lineHeight: 1.4,
      py: 0.5,
      overflow: 'auto',
    },
    '& .MuiInputLabel-root': {
      fontSize: { xs: '0.75rem', sm: '0.8125rem' },
    },
  } as const

  const neuralResponseRows = { minRows: 5, maxRows: 5 } as const

  const cardContentSx = {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 1,
    py: 1.5,
    px: 1.75,
    '&:last-child': { pb: 1.5 },
  }

  return (
    <Stack spacing={1.5} sx={{ maxWidth: { xs: '100%', md: 1320 }, width: 1 }}>
      <Box>
        <Typography variant="h6" component="h1" sx={{ fontWeight: 600, color: 'primary.main' }}>
          Ручной импорт LLM
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.35, maxWidth: 720 }}>
          Два сценария: <strong>жюри</strong> (батч FIGI, GigaChat + Алиса) и <strong>портфель</strong> (позиции, один
          JSON внешней модели).
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Жюри: один промпт в обе модели → два сырых ответа → «Применить батч». Порядок FIGI как в GET.
        </Typography>
      </Box>

      <Grid container spacing={1.5} sx={{ alignItems: 'stretch' }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ ...cardContentSx, flex: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'secondary.main', letterSpacing: '0.04em' }}>
            ЖЮРИ · РЕКОМЕНДАЦИИ ПО ИНСТРУМЕНТАМ
          </Typography>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {batchLabel}
            {batchSize != null ? (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 400, ml: 1 }}>
                батч: {batchSize}
              </Typography>
            ) : null}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
            <TextField
              label="Индекс чанка (0 …)"
              type="number"
              size="small"
              value={chunkIndex}
              onChange={e => setChunkIndex(Math.max(0, parseInt(e.target.value, 10) || 0))}
              slotProps={{ htmlInput: { min: 0 } }}
              sx={{ width: { xs: '100%', sm: 160 } }}
            />
            <Button variant="contained" onClick={() => void loadPrompt()} disabled={loadingPrompt} size="small">
              {loadingPrompt ? <CircularProgress size={22} color="inherit" /> : 'Загрузить промпт'}
            </Button>
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 1,
              alignItems: { xs: 'stretch', sm: 'flex-start' },
            }}
          >
            <TextField
              label="Промпт (только чтение)"
              value={prompt}
              fullWidth
              multiline
              minRows={3}
              maxRows={16}
              size="small"
              slotProps={{ htmlInput: { readOnly: true } }}
              sx={readonlyPromptSx}
            />
            <Button
              startIcon={<ContentCopyIcon />}
              variant="outlined"
              size="small"
              onClick={() => void copyPrompt()}
              disabled={!prompt}
              sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'flex-start' }, mt: { xs: 0, sm: 0.5 } }}
            >
              Копировать
            </Button>
          </Box>

          <TextField
            label="Ответ GigaChat (сырой текст / JSON)"
            value={giga}
            onChange={e => setGiga(e.target.value)}
            fullWidth
            multiline
            minRows={neuralResponseRows.minRows}
            maxRows={neuralResponseRows.maxRows}
            size="small"
            sx={neuralResponseSx}
          />
          <TextField
            label="Ответ Алиса / YandexGPT (сырой текст / JSON)"
            value={alisa}
            onChange={e => setAlisa(e.target.value)}
            fullWidth
            multiline
            minRows={neuralResponseRows.minRows}
            maxRows={neuralResponseRows.maxRows}
            size="small"
            sx={neuralResponseSx}
          />

          {figis.length > 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35, wordBreak: 'break-all' }}>
              FIGI: {figis.join(', ')}
            </Typography>
          ) : null}

          <Button variant="contained" color="secondary" size="small" onClick={() => void applyBatch()} disabled={applying}>
            {applying ? <CircularProgress size={22} color="inherit" /> : 'Применить батч'}
          </Button>

          {error ? (
            <Alert severity="error" sx={{ py: 0.5 }}>
              {error}
            </Alert>
          ) : null}
          {resultMsg ? (
            <Alert severity="success" sx={{ py: 0.5 }}>
              {resultMsg}
            </Alert>
          ) : null}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ ...cardContentSx, flex: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main', letterSpacing: '0.04em' }}>
            ПОРТФЕЛЬ · ВЕРДИКТ ПО ПОЗИЦИЯМ
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.45 }}>
            Промпт → внешняя модель → один JSON с <code>instruments[]</code> (figi, action, confidence, reasons).
            Порядок FIGI как в GET.
          </Typography>
          <Alert severity="info" variant="outlined" sx={{ py: 0.35, px: 1, '& .MuiAlert-message': { fontSize: 12, lineHeight: 1.4 } }}>
            <strong>Не жюри.</strong> Соседняя колонка — рынок/инструменты; здесь —{' '}
            <code style={{ fontSize: '0.85em' }}>portfolio_position_recommendations</code> (колонка «Портфель» на
            позициях). «Рынок» на FIGI — другой контур.
          </Alert>

          <Divider sx={{ borderColor: 'divider', my: 0.25 }} />

          <FormControl size="small" sx={{ width: { xs: '100%', sm: 'auto' }, maxWidth: { sm: 360 } }}>
            <InputLabel id="pf-scope-label">Портфель</InputLabel>
            <Select
              labelId="pf-scope-label"
              label="Портфель"
              value={pfScope}
              onChange={e => setPfScope(String(e.target.value))}
            >
              {portfolioScopeOptions.map(o => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Только эти FIGI (опционально, через запятую или пробел; порядок важен)"
            value={pfFigiFilterText}
            onChange={e => setPfFigiFilterText(e.target.value)}
            fullWidth
            size="small"
            placeholder="Пусто = все открытые позиции"
          />

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
            <Button variant="contained" onClick={() => void loadPortfolioPrompt()} disabled={pfLoadingPrompt} size="small">
              {pfLoadingPrompt ? <CircularProgress size={22} color="inherit" /> : 'Загрузить промпт'}
            </Button>
          </Box>

          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 1,
              alignItems: { xs: 'stretch', sm: 'flex-start' },
            }}
          >
            <TextField
              label="Промпт (только чтение)"
              value={pfPrompt}
              fullWidth
              multiline
              minRows={3}
              maxRows={16}
              size="small"
              slotProps={{ htmlInput: { readOnly: true } }}
              sx={readonlyPromptSx}
            />
            <Button
              startIcon={<ContentCopyIcon />}
              variant="outlined"
              size="small"
              onClick={() => void copyPortfolioPrompt()}
              disabled={!pfPrompt}
              sx={{ flexShrink: 0, alignSelf: { xs: 'flex-start', sm: 'flex-start' }, mt: { xs: 0, sm: 0.5 } }}
            >
              Копировать
            </Button>
          </Box>

          <TextField
            label="Ответ внешней нейросети (сырой JSON)"
            value={pfExternalRaw}
            onChange={e => setPfExternalRaw(e.target.value)}
            fullWidth
            multiline
            minRows={neuralResponseRows.minRows}
            maxRows={neuralResponseRows.maxRows}
            size="small"
            sx={neuralResponseSx}
          />

          {pfFigis.length > 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.35, wordBreak: 'break-all' }}>
              FIGI: {pfFigis.join(', ')}
            </Typography>
          ) : null}

          <Button
            variant="contained"
            color="secondary"
            size="small"
            onClick={() => void applyPortfolioManual()}
            disabled={pfApplying}
          >
            {pfApplying ? <CircularProgress size={22} color="inherit" /> : 'Применить ответ'}
          </Button>

          {pfError ? (
            <Alert severity="error" sx={{ py: 0.5 }}>
              {pfError}
            </Alert>
          ) : null}
          {pfResult ? (
            <Alert severity="success" sx={{ py: 0.5 }}>
              {pfResult}
            </Alert>
          ) : null}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Snackbar open={Boolean(snack)} autoHideDuration={3000} onClose={() => setSnack(null)} message={snack} />
    </Stack>
  )
}

export { ManualLlmImportPage }
export default ManualLlmImportPage
