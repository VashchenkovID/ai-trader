import { labRoutesEnabled } from '@/config/labRoutes'
import type { SvgIconComponent } from '@mui/icons-material'
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined'
import AutoGraphOutlinedIcon from '@mui/icons-material/AutoGraphOutlined'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined'
import PieChartOutlineOutlinedIcon from '@mui/icons-material/PieChartOutlineOutlined'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import ShowChartOutlinedIcon from '@mui/icons-material/ShowChartOutlined'
import TextSnippetOutlinedIcon from '@mui/icons-material/TextSnippetOutlined'
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined'
import WalletOutlinedIcon from '@mui/icons-material/WalletOutlined'

export type SidebarNavItem = {
  label: string
  path: string
  icon: SvgIconComponent
  /** Активен при pathname.startsWith(path) — для вложенных маршрутов */
  nestedMatch?: boolean
}

export type SidebarNavGroup = {
  title?: string
  /** Подзаголовок под группой (вторичные экраны, диагностика) */
  caption?: string
  items: SidebarNavItem[]
}

const LAB_PATHS = new Set(['/portfolio-analyzer', '/backtest-sma'])

const RAW_SIDEBAR_GROUPS: SidebarNavGroup[] = [
  {
    items: [
      { label: 'Главная', path: '/dashboard', icon: DashboardOutlinedIcon },
      {
        label: 'Виртуальные портфели',
        path: '/virtual-portfolios',
        icon: PieChartOutlineOutlinedIcon,
      },
      { label: 'Портфель', path: '/portfolio', icon: WalletOutlinedIcon },
      {
        label: 'Рекомендации',
        path: '/recommendations',
        icon: TrendingUpOutlinedIcon,
        nestedMatch: true,
      },
      { label: 'Заявки', path: '/trading-requests', icon: ReceiptLongOutlinedIcon },
    ],
  },
  {
    title: 'Мониторинг',
    caption: 'Диагностика и алерты',
    items: [{ label: 'Алерты', path: '/monitoring/alerts', icon: NotificationsActiveOutlinedIcon }],
  },
  {
    title: 'Аналитика и инструменты',
    caption: 'Вторичный поток, не дублирует KPI главной',
    items: [
      { label: 'Риск', path: '/risk', icon: AssessmentOutlinedIcon },
      { label: 'Производительность', path: '/performance', icon: ShowChartOutlinedIcon },
      { label: 'Анализатор портфеля', path: '/portfolio-analyzer', icon: AutoGraphOutlinedIcon },
      { label: 'Бэктест SMA', path: '/backtest-sma', icon: AssessmentOutlinedIcon },
      {
        label: 'Импорт LLM (ручной)',
        path: '/manual-llm-import',
        icon: TextSnippetOutlinedIcon,
      },
    ],
  },
  {
    items: [{ label: 'Настройки', path: '/settings', icon: SettingsOutlinedIcon }],
  },
]

function filterLabNavItems(items: SidebarNavItem[]): SidebarNavItem[] {
  if (labRoutesEnabled) return items
  return items.filter(i => !LAB_PATHS.has(i.path))
}

/** Меню с учётом `VITE_ENABLE_LAB_ROUTES` (см. `config/labRoutes.ts`). */
export const APP_SIDEBAR_GROUPS: SidebarNavGroup[] = RAW_SIDEBAR_GROUPS.map(group => ({
  ...group,
  items: filterLabNavItems(group.items),
}))
