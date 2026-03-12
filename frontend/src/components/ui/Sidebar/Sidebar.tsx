import { type ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { Text } from '../Text/Text'
import './Sidebar.scss'

export type SidebarItem = {
  id: string
  label: ReactNode
  icon?: ReactNode
}

export type SidebarProps = {
  title?: ReactNode
  items: SidebarItem[]
  activeItemId?: string
  onSelect?: (itemId: string) => void
  footer?: ReactNode
  className?: string
}

export function Sidebar({ title, items, activeItemId, onSelect, footer, className }: SidebarProps) {
  return (
    <nav
      className={cn('ui-sidebar', className)}
      aria-label={typeof title === 'string' ? title : 'Sidebar'}
    >
      {title && (
        <Text as="p" variant="eyebrow" className="ui-sidebar__title">
          {title}
        </Text>
      )}

      <ul className="ui-sidebar__list">
        {items.map(item => {
          const isActive = item.id === activeItemId
          return (
            <li key={item.id}>
              <button
                type="button"
                className={cn('ui-sidebar__item', isActive && 'is-active')}
                onClick={() => onSelect?.(item.id)}
              >
                {item.icon && <span className="ui-sidebar__item-icon">{item.icon}</span>}
                <Text as="span" variant="label">
                  {item.label}
                </Text>
              </button>
            </li>
          )
        })}
      </ul>

      {footer && <div className="ui-sidebar__footer">{footer}</div>}
    </nav>
  )
}
