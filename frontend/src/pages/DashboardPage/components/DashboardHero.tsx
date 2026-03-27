import { SurfaceCard, Text } from '@/components/ui'

export function DashboardHero() {
  return (
    <SurfaceCard className="dashboard-page__hero" tone="elevated">
      <Text as="p" variant="eyebrow" tone="muted">
        Система управления
      </Text>
      <Text as="h1" variant="display">
        Главная панель
      </Text>
      <Text as="p" variant="body" tone="muted">
        Краткий обзор системы, риска, портфеля и актуальных рекомендаций.
      </Text>
    </SurfaceCard>
  )
}
