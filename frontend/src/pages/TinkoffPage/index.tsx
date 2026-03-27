import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { TinkoffService } from '@/api/generated/services/TinkoffService'
import { Button, PageLayout, Sidebar, SurfaceCard, Text } from '@/components/ui'
import { APP_SIDEBAR_ITEMS, getActiveSidebarItemId, navigateFromSidebar } from '@/navigation/appSidebar'
import '../AppToolPage.scss'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function TinkoffPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userInfo, setUserInfo] = useState<Record<string, unknown> | null>(null)
  const [accounts, setAccounts] = useState<Record<string, unknown> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [u, a] = await Promise.all([
        TinkoffService.userInfoApiV1TinkoffUserInfoGet(),
        TinkoffService.accountsApiV1TinkoffAccountsGet(),
      ])
      setUserInfo(asRecord(u.data))
      setAccounts(asRecord(a.data))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка Tinkoff API')
      setUserInfo(null)
      setAccounts(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <PageLayout
      className="app-tool-page tinkoff-page"
      header={
        <SurfaceCard className="app-tool-page__hero" tone="elevated">
          <Text as="p" variant="eyebrow" tone="muted">
            Брокер
          </Text>
          <Text as="h1" variant="display">
            Tinkoff Invest
          </Text>
          <Text as="p" variant="body" tone="muted">
            Профиль и счета из подключённого API. Синхронизация портфеля — на странице «Портфель».
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
      <div className="app-tool-page__section-header">
        <Button variant="secondary" loading={loading} onClick={() => void load()}>
          Обновить
        </Button>
        <Button variant="primary" onClick={() => navigate('/portfolio')}>
          Открыть портфель
        </Button>
      </div>

      {error && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="p" variant="body" tone="danger">
            {error}
          </Text>
        </SurfaceCard>
      )}

      {userInfo && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Пользователь
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(userInfo, null, 2)}</pre>
        </SurfaceCard>
      )}

      {accounts && (
        <SurfaceCard className="app-tool-page__section">
          <Text as="h2" variant="title">
            Счета
          </Text>
          <pre className="app-tool-page__json">{JSON.stringify(accounts, null, 2)}</pre>
        </SurfaceCard>
      )}
    </PageLayout>
  )
}
