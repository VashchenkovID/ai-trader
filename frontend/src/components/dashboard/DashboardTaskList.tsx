import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Link,
  Stack,
  Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import { JsonViewBlock } from '@/components/json'
import type { TaskRecord } from '@/store/systemStatusStore'
import {
  formatTaskDuration,
  formatTaskResultSummary,
  formatTaskTypeLabel,
  formatTaskWhen,
} from '@/utils/formatTaskRecord'

function statusColor(
  status: string,
): 'default' | 'primary' | 'success' | 'error' | 'warning' {
  const s = status.toLowerCase()
  if (s === 'completed' || s === 'success') return 'success'
  if (s === 'failed' || s === 'error') return 'error'
  if (s === 'running') return 'primary'
  if (s === 'queued' || s === 'scheduled' || s === 'pending') return 'warning'
  return 'default'
}

export function DashboardTaskList({ tasks }: { tasks: TaskRecord[] }) {
  if (tasks.length === 0) {
    return (
      <Box>
        <Typography variant="body2" color="text.secondary">
          Нет недавних задач в снимке.
        </Typography>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.75 }}>
          Задачи появятся после фоновых операций (анализ портфеля, пайплайн рекомендаций и т.д.).
        </Typography>
      </Box>
    )
  }

  return (
    <Stack spacing={1}>
      {tasks.map(t => {
        const duration = formatTaskDuration(t)
        const summary = formatTaskResultSummary(t.result ?? undefined)
        return (
          <Box
            key={t.taskId || `${t.taskType}-${t.queuedAt}`}
            sx={{
              p: 1,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'action.hover',
            }}
          >
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 0.75 }}>
              <Typography variant="subtitle2" component="span">
                {formatTaskTypeLabel(t.taskType)}
              </Typography>
              <Chip size="small" label={t.status} color={statusColor(t.status)} variant="outlined" />
              {t.source ? (
                <Typography variant="caption" color="text.secondary">
                  источник: {t.source}
                </Typography>
              ) : null}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Очередь: {formatTaskWhen(t.queuedAt)} · старт: {formatTaskWhen(t.startedAt)} · завершение:{' '}
              {formatTaskWhen(t.finishedAt)}
              {duration ? ` · длительность: ${duration}` : null}
            </Typography>
            {t.error ? (
              <Typography variant="body2" color="error.main" sx={{ mt: 0.75 }}>
                {t.error}
              </Typography>
            ) : null}
            {!t.error && summary ? (
              <Typography variant="body2" sx={{ mt: 0.75 }}>
                Результат: {summary}
              </Typography>
            ) : null}
            {t.result && Object.keys(t.result).length > 0 ? (
              <Accordion
                disableGutters
                sx={{ mt: 1, bgcolor: 'transparent', boxShadow: 'none', '&:before': { display: 'none' } }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 36 }}>
                  <Typography variant="caption" color="text.secondary">
                    Подробнее (результат задачи)
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 0, pt: 0 }}>
                  <JsonViewBlock data={t.result} maxHeight={220} collapsed={3} />
                </AccordionDetails>
              </Accordion>
            ) : null}
          </Box>
        )
      })}
      <Typography variant="caption" color="text.secondary">
        <Link component={RouterLink} to="/monitoring/alerts" underline="hover">
          Мониторинг и алерты
        </Link>
        {' — '}расширенный обзор при необходимости.
      </Typography>
    </Stack>
  )
}
