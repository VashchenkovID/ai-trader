import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material'
import { useCallback, useState } from 'react'
import { TrainingService } from '@/api/generated'
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
    <Box sx={{ p: 2, maxWidth: 960, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h5" component="h1">
        Ручной импорт LLM (GigaChat + Алиса)
      </Typography>
      <Typography color="text.secondary" variant="body2">
        Загрузите промпт для чанка, скопируйте его и вставьте один и тот же текст в обе модели. Вставьте
        сюда два сырых ответа и нажмите «Применить батч». Порядок FIGI должен совпадать с ответом GET.
      </Typography>

      <Card variant="outlined">
        <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1">{batchLabel}</Typography>
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

      <Snackbar open={Boolean(snack)} autoHideDuration={3000} onClose={() => setSnack(null)} message={snack} />
    </Box>
  )
}
