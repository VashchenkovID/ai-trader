import { type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/utils/cn'
import './SurfaceCard.scss'

export type SurfaceCardTone = 'default' | 'elevated'

export type SurfaceCardProps = HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'article' | 'div'
  header?: ReactNode
  tone?: SurfaceCardTone
}

export function SurfaceCard({
  as: Component = 'section',
  className,
  header,
  tone = 'default',
  children,
  ...rest
}: SurfaceCardProps) {
  return (
    <Component {...rest} className={cn('ui-surface-card', `ui-surface-card--${tone}`, className)}>
      {header && <header className="ui-surface-card__header">{header}</header>}
      <div className="ui-surface-card__body">{children}</div>
    </Component>
  )
}
