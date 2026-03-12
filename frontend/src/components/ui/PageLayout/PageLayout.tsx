import { type ReactNode } from 'react'
import { cn } from '@/utils/cn'
import './PageLayout.scss'

export type PageLayoutProps = {
  header?: ReactNode
  sidebar?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
}

export function PageLayout({
  header,
  sidebar,
  children,
  className,
  contentClassName,
}: PageLayoutProps) {
  return (
    <main className={cn('ui-page-layout', className)}>
      {header && <header className="ui-page-layout__header">{header}</header>}
      <div className="ui-page-layout__body">
        {sidebar && <aside className="ui-page-layout__sidebar">{sidebar}</aside>}
        <section className={cn('ui-page-layout__content', contentClassName)}>{children}</section>
      </div>
    </main>
  )
}
