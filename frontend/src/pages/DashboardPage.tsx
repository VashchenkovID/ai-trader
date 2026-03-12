import { useState } from 'react'
import {
  Button,
  Checkbox,
  Input,
  PageLayout,
  Radio,
  Select,
  Sidebar,
  SurfaceCard,
  Switch,
  Text,
  Textarea,
  type SelectOption,
  type SidebarItem,
} from '@/components/ui'
import { useSystemStatusStore } from '@/store/systemStatusStore'
import { useTradingCoreStore } from '@/store/tradingCoreStore'
import './DashboardPage.scss'

const strategyOptions: SelectOption[] = [
  { value: 'scalping', label: 'Scalping' },
  { value: 'intraday', label: 'Intraday' },
  { value: 'swing', label: 'Swing' },
]

const sidebarItems: SidebarItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'signals', label: 'Signals' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'settings', label: 'Settings' },
]

export function DashboardPage() {
  const [name, setName] = useState('')
  const [strategy, setStrategy] = useState('intraday')
  const [risk, setRisk] = useState<'conservative' | 'balanced'>('balanced')
  const [autoTrade, setAutoTrade] = useState(true)
  const connectionStatus = useSystemStatusStore(state => state.connectionStatus)
  const lastEventAt = useSystemStatusStore(state => state.lastEventAt)
  const tasksCount = useSystemStatusStore(state => state.tasks.length)
  const schedulerCount = useSystemStatusStore(state => Object.keys(state.scheduler).length)
  const profile = useTradingCoreStore(state => state.profile)
  const tradingMode = useTradingCoreStore(state => state.tradingMode)
  const portfolio = useTradingCoreStore(state => state.portfolio)
  const portfolioKind = useTradingCoreStore(state => state.portfolioKind)
  const totalBalance = useTradingCoreStore(state => state.totalBalance)
  const stocksValue = useTradingCoreStore(state => state.stocksValue)
  const profitLoss = useTradingCoreStore(state => state.profitLoss)
  const lastPortfolioUpdatedAt = useTradingCoreStore(state => state.lastPortfolioUpdatedAt)
  const lastPortfolioUpdateSource = useTradingCoreStore(state => state.lastPortfolioUpdateSource)
  const isCoreLoading = useTradingCoreStore(state => state.isLoading)
  const coreError = useTradingCoreStore(state => state.error)

  return (
    <PageLayout
      className="dashboard-page"
      header={
        <SurfaceCard className="dashboard-page__hero" tone="elevated">
          <Text as="p" variant="eyebrow" tone="muted">
            AI Trader UI Foundation
          </Text>
          <Text as="h1" variant="display">
            Dashboard shell
          </Text>
          <Text as="p" variant="body" tone="muted">
            Переиспользуемый каркас страниц для следующего шага с авторизацией.
          </Text>
        </SurfaceCard>
      }
      sidebar={<Sidebar title="Navigation" items={sidebarItems} activeItemId="overview" />}
    >
      <SurfaceCard
        header={
          <Text as="h2" variant="title">
            Buttons
          </Text>
        }
      >
        <div className="dashboard-page__row">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button loading>Loading</Button>
        </div>
      </SurfaceCard>

      <SurfaceCard
        header={
          <Text as="h2" variant="title">
            Form primitives
          </Text>
        }
      >
        <div className="dashboard-page__grid">
          <Input
            label="Название портфеля"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Например, Smart Growth"
            hint="Используется в отчетах и телеграм-уведомлениях"
          />
          <Select
            label="Стратегия"
            value={strategy}
            onChange={event => setStrategy(event.target.value)}
            options={strategyOptions}
          />
          <Textarea
            label="Комментарий"
            placeholder="Опиши гипотезу, по которой запускается обучение..."
            hint="Полезно для ретроспективы и команды"
          />
        </div>
      </SurfaceCard>

      <SurfaceCard
        header={
          <Text as="h2" variant="title">
            Realtime status
          </Text>
        }
      >
        <div className="dashboard-page__grid">
          <Text as="p" variant="body">
            Socket: <strong>{connectionStatus}</strong>
          </Text>
          <Text as="p" variant="body">
            Scheduler jobs in store: <strong>{schedulerCount}</strong>
          </Text>
          <Text as="p" variant="body">
            Tasks in store: <strong>{tasksCount}</strong>
          </Text>
          <Text as="p" variant="hint" tone="muted">
            Last event: {lastEventAt ?? 'no events yet'}
          </Text>
        </div>
      </SurfaceCard>

      <SurfaceCard
        header={
          <Text as="h2" variant="title">
            Core data (single Zustand store)
          </Text>
        }
      >
        <div className="dashboard-page__grid">
          <Text as="p" variant="body">
            Profile: <strong>{profile ? profile.username : 'not loaded'}</strong>
          </Text>
          <Text as="p" variant="body">
            Trading mode:{' '}
            <strong>
              {tradingMode
                ? JSON.stringify(tradingMode)
                : isCoreLoading
                  ? 'loading...'
                  : 'not loaded'}
            </strong>
          </Text>
          <Text as="p" variant="body">
            Portfolio type: <strong>{portfolioKind ?? 'n/a'}</strong>
          </Text>
          <Text as="p" variant="body">
            Portfolio balance/value:{' '}
            <strong>
              {portfolio ? totalBalance.toFixed(2) : isCoreLoading ? 'loading...' : 'not loaded'}
            </strong>
          </Text>
          <Text as="p" variant="body">
            Stocks value: <strong>{portfolio ? stocksValue.toFixed(2) : 'n/a'}</strong>
          </Text>
          <Text as="p" variant="body">
            Profit / Loss: <strong>{portfolio ? profitLoss.toFixed(2) : 'n/a'}</strong>
          </Text>
          <Text as="p" variant="hint" tone="muted">
            Portfolio updated: {lastPortfolioUpdatedAt ?? 'never'} (
            {lastPortfolioUpdateSource ?? 'n/a'})
          </Text>
          {coreError && (
            <Text as="p" variant="hint" tone="danger">
              Core load error: {coreError}
            </Text>
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard
        header={
          <Text as="h2" variant="title">
            Selection controls
          </Text>
        }
      >
        <div className="dashboard-page__stack">
          <Checkbox label="Включить уведомления о просадке" defaultChecked />
          <Radio
            name="risk-profile"
            label="Консервативный профиль риска"
            checked={risk === 'conservative'}
            onChange={() => setRisk('conservative')}
          />
          <Radio
            name="risk-profile"
            label="Сбалансированный профиль риска"
            checked={risk === 'balanced'}
            onChange={() => setRisk('balanced')}
          />
          <Switch
            label="Auto-trading"
            hint="Разрешить автоматическое исполнение одобренных заявок"
            checked={autoTrade}
            onChange={event => setAutoTrade(event.target.checked)}
          />
        </div>
      </SurfaceCard>
    </PageLayout>
  )
}
