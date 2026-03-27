import type { SidebarItem } from '@/components/ui'

export const APP_SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'dashboard', label: 'Главная' },
  { id: 'recommendations', label: 'Рекомендации' },
  { id: 'trading-requests', label: 'Торговые заявки' },
  { id: 'portfolio', label: 'Портфель' },
  { id: 'monitoring-alerts', label: 'Алерты' },
  { id: 'auto-paper', label: 'Автоторговля' },
  { id: 'performance', label: 'Производительность' },
  { id: 'risk', label: 'Риск' },
  { id: 'tinkoff', label: 'Tinkoff' },
  { id: 'training', label: 'ML и задачи' },
  { id: 'settings', label: 'Настройки' },
]

/** Более длинные префиксы выше (например /monitoring/alerts раньше гипотетического /monitoring). */
const SIDEBAR_ROUTE_PREFIXES: readonly { prefix: string; id: string }[] = [
  { prefix: '/monitoring/alerts', id: 'monitoring-alerts' },
  { prefix: '/settings', id: 'settings' },
  { prefix: '/recommendations', id: 'recommendations' },
  { prefix: '/trading-requests', id: 'trading-requests' },
  { prefix: '/portfolio', id: 'portfolio' },
  { prefix: '/auto-paper', id: 'auto-paper' },
  { prefix: '/performance', id: 'performance' },
  { prefix: '/risk', id: 'risk' },
  { prefix: '/tinkoff', id: 'tinkoff' },
  { prefix: '/training', id: 'training' },
  { prefix: '/dashboard', id: 'dashboard' },
]

export function getActiveSidebarItemId(pathname: string): string {
  for (const { prefix, id } of SIDEBAR_ROUTE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return id
    }
  }
  return 'dashboard'
}

export function navigateFromSidebar(navigate: (path: string) => void, itemId: string): void {
  const map: Record<string, string> = {
    dashboard: '/dashboard',
    recommendations: '/recommendations',
    'trading-requests': '/trading-requests',
    portfolio: '/portfolio',
    'monitoring-alerts': '/monitoring/alerts',
    'auto-paper': '/auto-paper',
    performance: '/performance',
    risk: '/risk',
    tinkoff: '/tinkoff',
    training: '/training',
    settings: '/settings',
  }
  navigate(map[itemId] ?? '/dashboard')
}
