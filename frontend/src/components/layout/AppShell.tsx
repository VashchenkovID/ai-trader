import MenuIcon from '@mui/icons-material/Menu'
import {
  AppBar,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useTheme,
} from '@mui/material'
import { motion, useReducedMotion } from 'framer-motion'
import { Suspense, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { APP_SIDEBAR_GROUPS } from '@/navigation/appSidebar'
import { logoutUser } from '@/services/auth'
import { useTradingCoreStore } from '@/store/tradingCoreStore'
import { tokens } from '@/theme/tokens'
import type { SidebarNavItem } from '@/navigation/appSidebar'

const drawerWidth = tokens.drawerWidth

function formatMoneyShort(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value)
}

function isItemSelected(item: SidebarNavItem, pathname: string): boolean {
  if (item.nestedMatch) {
    return pathname === item.path || pathname.startsWith(`${item.path}/`)
  }
  return pathname === item.path
}

export function AppShell() {
  const theme = useTheme()
  const reduceMotion = useReducedMotion()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { tradingMode, portfolioKind, totalBalance, profile } = useTradingCoreStore()
  const displayName = profile?.fullName?.trim() || profile?.username || ''

  const drawer = (
    <Box sx={{ pt: 1, px: 1 }}>
      <Typography
        variant="subtitle2"
        sx={{ px: 1.5, py: 1, color: 'text.secondary', letterSpacing: 0.5 }}
      >
        AI Trader
      </Typography>
      {APP_SIDEBAR_GROUPS.map((group, gi) => (
        <Box key={gi} sx={{ mb: 1.5 }}>
          {group.title ? (
            <Box sx={{ px: 1.5, py: 0.75 }}>
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  color: 'text.secondary',
                  textTransform: 'uppercase',
                }}
              >
                {group.title}
              </Typography>
              {group.caption ? (
                <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', mt: 0.25 }}>
                  {group.caption}
                </Typography>
              ) : null}
            </Box>
          ) : null}
          <List dense disablePadding>
            {group.items.map(item => {
              const Icon = item.icon
              const selected = isItemSelected(item, location.pathname)
              return (
                <ListItem key={item.path} disablePadding sx={{ px: 0.5 }}>
                  <ListItemButton
                    selected={selected}
                    onClick={() => {
                      void navigate(item.path)
                      setMobileOpen(false)
                    }}
                  >
                    <ListItemIcon
                      sx={{ minWidth: 40, color: selected ? 'primary.main' : 'text.secondary' }}
                    >
                      <Icon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      slotProps={{ primary: { variant: 'body2' } }}
                    />
                  </ListItemButton>
                </ListItem>
              )
            })}
          </List>
          {gi < APP_SIDEBAR_GROUPS.length - 1 ? (
            <Divider sx={{ my: 1, borderColor: 'divider' }} />
          ) : null}
        </Box>
      ))}
      <Box sx={{ px: 1, pb: 2 }}>
        <ListItemButton
          onClick={() => {
            void logoutUser().finally(() => {
              navigate('/login', { replace: true })
            })
          }}
          sx={{ color: 'text.secondary' }}
        >
          <ListItemText primary="Выйти" slotProps={{ primary: { variant: 'body2' } }} />
        </ListItemButton>
      </Box>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          display: { md: 'none' },
          zIndex: theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar sx={{ flexWrap: 'wrap', gap: 0.5, py: 1 }}>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(true)}
            aria-label="Открыть меню"
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" noWrap component="div">
              AI Trader
            </Typography>
            <Typography variant="caption" color="inherit" sx={{ opacity: 0.85 }} noWrap component="div" title={displayName}>
              {String(tradingMode?.mode ?? '—').toUpperCase()} · {formatMoneyShort(totalBalance)}
              {displayName ? ` · ${displayName}` : ''}
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: { xs: 7, md: 0 },
          minHeight: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1,
            mb: 2,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Срез
          </Typography>
          <Chip
            size="small"
            label={String(tradingMode?.mode ?? '—').toUpperCase()}
            variant="outlined"
          />
          <Chip
            size="small"
            label={portfolioKind === 'virtual' ? 'Paper / virtual' : 'Брокер'}
            color={portfolioKind === 'virtual' ? 'primary' : 'default'}
            variant="outlined"
          />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {formatMoneyShort(totalBalance)}
          </Typography>
          {displayName ? (
            <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }} noWrap title={displayName}>
              {displayName}
            </Typography>
          ) : null}
        </Box>
        <Suspense
          fallback={
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress color="primary" aria-label="Загрузка страницы" />
            </Box>
          }
        >
          <motion.div
            initial={reduceMotion ? undefined : { opacity: 0.88 }}
            animate={reduceMotion ? undefined : { opacity: 1 }}
            transition={{ duration: 0.2 }}
            style={{ minHeight: 4 }}
          >
            <Outlet />
          </motion.div>
        </Suspense>
      </Box>
    </Box>
  )
}
