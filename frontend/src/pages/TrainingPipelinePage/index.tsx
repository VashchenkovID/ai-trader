import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RecommendationPipelineService } from '@/api/generated/services/RecommendationPipelineService'
import { TrainingService } from '@/api/generated/services/TrainingService'
import { Button, Input, PageLayout, Sidebar, SurfaceCard, Text } from '@/components/ui'
import { APP_SIDEBAR_ITEMS, getActiveSidebarItemId, navigateFromSidebar } from '@/navigation/appSidebar'
import '../AppToolPage.scss'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function TrainingPipelinePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [figi, setFigi] = useState('')
  const [epochs, setEpochs] = useState('20')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null)

  const runPipeline = async () => {
    setBusy('pipeline')
    setMessage(null)
    try {
      const res = await RecommendationPipelineService.recommendationPipelineRunApiV1RecommendationPipelineRunPost({
        mode: 'paper',
        limit: 50,
      })
      setLastResult(asRecord(res.data))
      setMessage('Pipeline запущен / поставлен в очередь.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Ошибка pipeline')
      setLastResult(null)
    } finally {
      setBusy(null)
    }
  }

  const runNnFigi = async () => {
    const f = figi.trim()
    if (!f) {
      setMessage('Укажите FIGI')
      return
    }
    setBusy('nn')
    setMessage(null)
    try {
      const ep = Number(epochs) || 20
      const res = await TrainingService.runNnFromFigiApiV1TrainingRunNnFromFigiPost({
        figi: f,
        epochs: ep,
      })
      setLastResult(asRecord(res as unknown))
      setMessage('Задача обучения отправлена.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Ошибка обучения')
      setLastResult(null)
    } finally {
      setBusy(null)
    }
  }

  return (
    <PageLayout
      className="app-tool-page training-pipeline-page"
      header={
        <SurfaceCard className="app-tool-page__hero" tone="elevated">
          <Text as="p" variant="eyebrow" tone="muted">
            ML и фоновые задачи
          </Text>
          <Text as="h1" variant="display">
            Обучение и пайплайн
          </Text>
          <Text as="p" variant="body" tone="muted">
            Быстрые действия поверх API. Полный набор фоновых задач по-прежнему на вкладке «Данные» в настройках.
          </Text>
        </SurfaceCard>
      }
      sidebar={
        <Sidebar
          title="Навигация"
          items={APP_SIDEBAR_ITEMS}
          activeItemId={getActiveSidebarItemId(location.pathname)}
          onSelect={id => navigateFromSidebar(navigate, id)}
        />
      }
    >
      <SurfaceCard className="app-tool-page__section">
        <Text as="h2" variant="title">
          Рекомендационный pipeline
        </Text>
        <Text as="p" variant="body" tone="muted">
          Создание заявок по рекомендациям с фильтрами на сервере.
        </Text>
        <Button variant="primary" loading={busy === 'pipeline'} disabled={busy !== null} onClick={() => void runPipeline()}>
          Запустить pipeline
        </Button>
      </SurfaceCard>

      <SurfaceCard className="app-tool-page__section">
        <Text as="h2" variant="title">
          Обучение NN по FIGI
        </Text>
        <div className="app-tool-page__filters">
          <Input label="FIGI" value={figi} onChange={e => setFigi(e.target.value)} placeholder="BBG..." />
          <Input
            label="Эпохи"
            type="number"
            min={1}
            value={epochs}
            onChange={e => setEpochs(e.target.value)}
          />
        </div>
        <Button variant="secondary" loading={busy === 'nn'} disabled={busy !== null} onClick={() => void runNnFigi()}>
          Запустить обучение
        </Button>
      </SurfaceCard>

      <SurfaceCard className="app-tool-page__section">
        <Button variant="secondary" onClick={() => navigate('/settings')}>
          Открыть настройки (фоновые задачи)
        </Button>
      </SurfaceCard>

      {message && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="p" variant="body" tone={message.includes('Ошиб') ? 'danger' : 'muted'}>
            {message}
          </Text>
        </SurfaceCard>
      )}

      {lastResult && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Последний ответ
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(lastResult, null, 2)}</pre>
        </SurfaceCard>
      )}
    </PageLayout>
  )
}
