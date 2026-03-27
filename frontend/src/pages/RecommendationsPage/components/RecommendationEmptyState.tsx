import { Text } from '@/components/ui'

type RecommendationEmptyStateProps = {
  title?: string
  description?: string
}

export function RecommendationEmptyState({
  title = 'Рекомендации не найдены',
  description = 'Измените фильтры или попробуйте обновить список позже.',
}: RecommendationEmptyStateProps) {
  return (
    <div className="recommendations-page__empty">
      <Text as="h3" variant="title">
        {title}
      </Text>
      <Text as="p" variant="body" tone="muted">
        {description}
      </Text>
    </div>
  )
}

