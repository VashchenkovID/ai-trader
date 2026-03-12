import { type ElementType, type HTMLAttributes } from 'react'
import { cn } from '@/utils/cn'
import './Text.scss'

export type TextVariant = 'display' | 'title' | 'body' | 'label' | 'hint' | 'button' | 'eyebrow'
export type TextTone = 'default' | 'muted' | 'danger'

export type TextProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType
  variant?: TextVariant
  tone?: TextTone
}

export function Text({
  as: Component = 'span',
  className,
  variant = 'body',
  tone = 'default',
  children,
  ...rest
}: TextProps) {
  return (
    <Component
      {...rest}
      className={cn(
        'ui-text',
        `ui-text--${variant}`,
        tone !== 'default' && `ui-text--${tone}`,
        className
      )}
    >
      {children}
    </Component>
  )
}
