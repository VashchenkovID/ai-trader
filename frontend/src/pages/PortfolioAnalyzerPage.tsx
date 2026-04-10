import {
  Alert,
  Box,
  Button,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  TextField,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { PortfolioAnalyzerService } from '@/api/generated'
import { JsonViewBlock } from '@/components/json'
import { apiErrorMessage } from '@/utils/apiErrorMessage'

type ReportListItem = { id: string; createdAt?: string; queryPreview?: string }

export function PortfolioAnalyzerPage() {
  const [query, setQuery] = useState('Сравни виртуальные профили по риску и диверсификации.')
  const [reports, setReports] = useState<ReportListItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailText, setDetailText] = useState<string | null>(null)
  const [detailMeta, setDetailMeta] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadReports = useCallback(async () => {
    try {
      const env = await PortfolioAnalyzerService.listReportsApiV1PortfolioAnalyzerReportsGet({ limit: 30 })
      const data = env.data as { items?: unknown[] }
      const items = Array.isArray(data.items) ? data.items : []
      const rows: ReportListItem[] = items.map(x => {
        const o = (x ?? {}) as Record<string, unknown>
        return {
          id: String(o.id ?? ''),
          createdAt: o.createdAt != null ? String(o.createdAt) : undefined,
          queryPreview: o.queryPreview != null ? String(o.queryPreview) : undefined,
        }
      })
      setReports(rows.filter(r => r.id))
    } catch (e) {
      setError(apiErrorMessage(e))
    }
  }, [])

  useEffect(() => {
    void loadReports()
  }, [loadReports])

  const runAnalyze = async () => {
    setLoading(true)
    setError(null)
    try {
      const q = query.trim() || 'Краткий обзор виртуальных профилей.'
      const env = await PortfolioAnalyzerService.postAnalyzeApiV1PortfolioAnalyzerAnalyzePost({
        requestBody: { query: q },
      })
      const data = env.data as { reportId?: string; text?: string }
      if (data.reportId) {
        setSelectedId(data.reportId)
        setDetailText(typeof data.text === 'string' ? data.text : null)
        setDetailMeta(null)
      }
      await loadReports()
    } catch (e) {
      setError(apiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const loadDetail = async (id: string) => {
    setSelectedId(id)
    setLoading(true)
    setError(null)
    try {
      const env = await PortfolioAnalyzerService.getReportApiV1PortfolioAnalyzerReportsReportIdGet({
        reportId: id,
      })
      const d = env.data as {
        text?: string
        userQuery?: string
        createdAt?: string
        profilesPayload?: unknown
      }
      setDetailText(typeof d.text === 'string' ? d.text : null)
      setDetailMeta({
        userQuery: d.userQuery,
        createdAt: d.createdAt,
        profilesPayload: d.profilesPayload,
      })
    } catch (e) {
      setError(apiErrorMessage(e))
      setDetailText(null)
      setDetailMeta(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 0.5 }}>
        Анализатор портфеля
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Текстовый отчёт по виртуальным профилям. Группа «Инструменты».
      </Typography>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Paper sx={{ p: 2, mb: 2 }}>
        <TextField
          fullWidth
          multiline
          minRows={3}
          label="Запрос"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <Box sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => void runAnalyze()} disabled={loading}>
            Сгенерировать отчёт
          </Button>
        </Box>
        {loading ? <LinearProgress sx={{ mt: 2 }} /> : null}
      </Paper>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
        <Paper sx={{ p: 0, flex: '1 1 280px', maxWidth: 400 }}>
          <Typography variant="subtitle2" sx={{ p: 2, pb: 0 }}>
            Последние отчёты
          </Typography>
          <List dense>
            {reports.map(r => (
              <ListItemButton
                key={r.id}
                selected={selectedId === r.id}
                onClick={() => void loadDetail(r.id)}
              >
                <ListItemText
                  primary={r.queryPreview || r.id}
                  secondary={r.createdAt}
                  slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
                />
              </ListItemButton>
            ))}
            {reports.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Typography color="text.secondary">Пока нет сохранённых отчётов.</Typography>
              </Box>
            ) : null}
          </List>
        </Paper>

        <Paper sx={{ p: 2, flex: '2 1 480px', minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Текст отчёта
          </Typography>
          <Typography
            component="div"
            sx={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, mb: detailMeta ? 2 : 0 }}
          >
            {detailText ?? 'Выберите отчёт слева или сгенерируйте новый.'}
          </Typography>
          {detailMeta != null ? (
            <>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Мета
              </Typography>
              <JsonViewBlock data={detailMeta} maxHeight={280} collapsed={2} />
            </>
          ) : null}
        </Paper>
      </Box>
    </Box>
  )
}
