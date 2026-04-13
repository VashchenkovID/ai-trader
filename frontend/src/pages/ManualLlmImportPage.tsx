import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material'
import { useCallback, useMemo, useState } from 'react'
import { PortfolioAnalysisService, TrainingService } from '@/api/generated'
import { apiErrorMessage } from '@/utils/apiErrorMessage'

export function ManualLlmImportPage() {
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

  return (
    <Box sx={{ p: 2, maxWidth: 1080, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h5" component="h1">
        Ручной импорт LLM
      </Typography>
      <Typography color="text.secondary" variant="body2">
        Ниже два независимых сценария: (1) батч рекомендаций по инструментам — GigaChat и Алиса; (2) вердикт по
        открытым позициям выбранного портфеля — одна внешняя модель и JSON-ответ.
      </Typography>
      <Typography color="text.secondary" variant="body2">
        <strong>Рекомендации по рынку:</strong> загрузите промпт для чанка, скопируйте его и вставьте один и тот же
        текст в обе модели. Вставьте сюда два сырых ответа и нажмите «Применить батч». Порядок FIGI должен совпадать с
        ответом GET.
      </Typography>

      <Card variant="outlined">
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1">Рекомендации по инструментам (жюри) — {batchLabel}</Typography>
          {batchSize != null ? (
            <Typography variant="caption" color="text.secondary">
              Размер батча (настройка сервера): {batchSize}
            </Typography>
          ) : null}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <TextField
              label="Индекс чанка (0 …)"
              type="number"
              size="small"
              value={chunkIndex}
              onChange={e => setChunkIndex(Math.max(0, parseInt(e.target.value, 10) || 0))}
              slotProps={{ htmlInput: { min: 0 } }}
              sx={{ width: 160 }}
            />
            <Button variant="contained" onClick={() => void loadPrompt()} disabled={loadingPrompt}>
              {loadingPrompt ? <CircularProgress size={22} color="inherit" /> : 'Загрузить промпт'}
            </Button>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              label="Промпт (только чтение)"
              value={prompt}
              fullWidth
              multiline
              minRows={6}
              slotProps={{ htmlInput: { readOnly: true } }}
            />
            <Button
              startIcon={<ContentCopyIcon />}
              variant="outlined"
              onClick={() => void copyPrompt()}
              disabled={!prompt}
              sx={{ flexShrink: 0, mt: 1 }}
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
            minRows={8}
          />
          <TextField
            label="Ответ Алиса / YandexGPT (сырой текст / JSON)"
            value={alisa}
            onChange={e => setAlisa(e.target.value)}
            fullWidth
            multiline
            minRows={8}
          />

          {figis.length > 0 ? (
            <Typography variant="caption" color="text.secondary">
              FIGI в батче: {figis.join(', ')}
            </Typography>
          ) : null}

          <Button variant="contained" color="secondary" onClick={() => void applyBatch()} disabled={applying}>
            {applying ? <CircularProgress size={22} color="inherit" /> : 'Применить батч'}
          </Button>
        </CardContent>
      </Card>

      {error ? <Alert severity="error">{error}</Alert> : null}
      {resultMsg ? <Alert severity="success">{resultMsg}</Alert> : null}

      <Card variant="outlined">
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1">Портфель: внешняя нейросеть (вердикт по позициям)</Typography>
          <Typography color="text.secondary" variant="body2">
            Аналогично блоку выше: загрузите промпт, скопируйте в ChatGPT / Claude / Perplexity и т.д., вставьте{' '}
            <strong>один</strong> сырой ответ в формате JSON с массивом{' '}
            <code style={{ fontSize: '0.9em' }}>instruments[]</code> (figi, action, confidence, reasons). Список и
            порядок FIGI должны совпадать с ответом GET (как для рекомендаций по чанку).
          </Typography>

          <FormControl size="small" sx={{ maxWidth: 360 }}>
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

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <Button variant="contained" onClick={() => void loadPortfolioPrompt()} disabled={pfLoadingPrompt}>
              {pfLoadingPrompt ? <CircularProgress size={22} color="inherit" /> : 'Загрузить промпт'}
            </Button>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              label="Промпт (только чтение)"
              value={pfPrompt}
              fullWidth
              multiline
              minRows={6}
              slotProps={{ htmlInput: { readOnly: true } }}
            />
            <Button
              startIcon={<ContentCopyIcon />}
              variant="outlined"
              onClick={() => void copyPortfolioPrompt()}
              disabled={!pfPrompt}
              sx={{ flexShrink: 0, mt: 1 }}
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
            minRows={8}
          />

          {pfFigis.length > 0 ? (
            <Typography variant="caption" color="text.secondary">
              FIGI в запросе: {pfFigis.join(', ')}
            </Typography>
          ) : null}

          <Button
            variant="contained"
            color="secondary"
            onClick={() => void applyPortfolioManual()}
            disabled={pfApplying}
          >
            {pfApplying ? <CircularProgress size={22} color="inherit" /> : 'Применить ответ'}
          </Button>

          {pfError ? <Alert severity="error">{pfError}</Alert> : null}
          {pfResult ? <Alert severity="success">{pfResult}</Alert> : null}
        </CardContent>
      </Card>

      <Snackbar open={Boolean(snack)} autoHideDuration={3000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  )
}
