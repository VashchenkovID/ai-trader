import { SurfaceCard } from '@/components/ui'

type RecommendationSkeletonProps = {
  count?: number
}

export function RecommendationSkeleton({ count = 6 }: RecommendationSkeletonProps) {
  return (
    <div className="recommendations-page__list" aria-live="polite" aria-busy="true">
      {Array.from({ length: count }).map((_, index) => (
        <SurfaceCard key={index} className="recommendations-page__card recommendations-page__card--skeleton">
          <div className="recommendations-page__skeleton-line recommendations-page__skeleton-line--lg" />
          <div className="recommendations-page__skeleton-line" />
          <div className="recommendations-page__skeleton-line" />
          <div className="recommendations-page__skeleton-line recommendations-page__skeleton-line--sm" />
        </SurfaceCard>
      ))}
    </div>
  )
}

