import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { BacktestingService } from '@/api/generated'
import { JsonViewBlock } from '@/components/json'
import { apiErrorMessage } from '@/utils/apiErrorMessage'

function BacktestSmaPage() {
  const [figi, setFigi] = useState('')
  const [smaPeriod, setSmaPeriod] = useState('20')
  const [candleLimit, setCandleLimit] = useState('500')
  const [cash, setCash] = useState('100000')
  const [commission, setCommission] = useState('0.001')
  const [result, setResult] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const env = await BacktestingService.postSmaBacktestApiV1BacktestingSmaPost({
        requestBody: {
          figi: figi.trim(),
          sma_period: smaPeriod === '' ? undefined : Number(smaPeriod),
          candle_limit: candleLimit === '' ? undefined : Number(candleLimit),
          cash: cash === '' ? undefined : Number(cash),
          commission: commission === '' ? undefined : Number(commission),
        },
      })
      setResult(env.data ?? env)
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 0.5 }}>
        Бэктест SMA
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Кросс по SMA на исторических свечах. Требуется optional-зависимость quant на бэкенде.
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 440 }}>
          <TextField label="FIGI" size="small" value={figi} onChange={e => setFigi(e.target.value)} required />
          <TextField
            label="SMA period"
            size="small"
            value={smaPeriod}
            onChange={e => setSmaPeriod(e.target.value)}
          />
          <TextField
            label="Candle limit"
            size="small"
            value={candleLimit}
            onChange={e => setCandleLimit(e.target.value)}
          />
          <TextField label="Cash" size="small" value={cash} onChange={e => setCash(e.target.value)} />
          <TextField
            label="Commission"
            size="small"
            value={commission}
            onChange={e => setCommission(e.target.value)}
          />
          <Button variant="contained" onClick={() => void run()} disabled={loading || !figi.trim()}>
            Запустить
          </Button>
        </Box>
        {loading ? <LinearProgress sx={{ mt: 2 }} /> : null}
      </Paper>

      {result != null ? (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Результат
          </Typography>
          <JsonViewBlock data={result} maxHeight={520} collapsed={2} />
        </Paper>
      ) : null}
    </Box>
  )
}

export { BacktestSmaPage }
export default BacktestSmaPage
