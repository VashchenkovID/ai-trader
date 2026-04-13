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
import { alpha } from '@mui/material/styles'
import { motion, useReducedMotion } from 'framer-motion'
import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { APP_SIDEBAR_GROUPS } from '@/navigation/appSidebar'
import { logoutUser } from '@/services/auth'
import { useTradingCoreStore } from '@/store/tradingCoreStore'
import { tokens } from '@/theme/tokens'
import type { SidebarNavItem } from '@/navigation/appSidebar'

const drawerWidth = tokens.drawerWidth

type AmbientDrift = {
  /** Смещение в долях ширины/высоты вьюпорта — заметное движение по экрану. */
  xVw: number
  yVh: number
  scale: number
  opacity: number
  /** Длительность перехода к этой точке (сек), совпадает с setTimeout до следующей цели. */
  durationSec: number
}

function randomAmbientDrift(opts?: { scaleMin?: number; scaleMax?: number; opacityMin?: number; opacityMax?: number }) {
  const smin = opts?.scaleMin ?? 0.82
  const smax = opts?.scaleMax ?? 1.22
  const omin = opts?.opacityMin ?? 0.34
  const omax = opts?.opacityMax ?? 0.72
  return {
    xVw: (Math.random() - 0.5) * 100,
    yVh: (Math.random() - 0.5) * 92,
    scale: smin + Math.random() * (smax - smin),
    opacity: omin + Math.random() * (omax - omin),
    durationSec: 5.5 + Math.random() * 12,
  } satisfies AmbientDrift
}

/** Слой градиента: каждые N секунд новая случайная позиция (плавный CSS transition). */
function AmbientRandomBlob({
  reduceMotion,
  initialDelayMs,
  background,
  sxBase,
}: {
  reduceMotion: boolean
  initialDelayMs: number
  background: string
  sxBase: Record<string, unknown>
}) {
  const [drift, setDrift] = useState<AmbientDrift>(() => randomAmbientDrift())

  useEffect(() => {
    if (reduceMotion) return
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout>

    const step = () => {
      if (cancelled) return
      const next = randomAmbientDrift()
      setDrift(next)
      timeoutId = setTimeout(step, Math.max(900, next.durationSec * 1000))
    }

    timeoutId = setTimeout(step, initialDelayMs)
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [reduceMotion, initialDelayMs])

  const d = reduceMotion
    ? { xVw: 0, yVh: 0, scale: 1, opacity: 0.48, durationSec: 0 }
    : drift

  return (
    <Box
      sx={{
        position: 'absolute',
        borderRadius: '50%',
        pointerEvents: 'none',
        background,
        willChange: 'transform, opacity',
        ...sxBase,
        transform: `translate3d(${d.xVw}vw, ${d.yVh}vh, 0) scale(${d.scale})`,
        opacity: d.opacity,
        transition: reduceMotion
          ? undefined
          : `transform ${d.durationSec}s cubic-bezier(0.42, 0, 0.18, 1), opacity ${d.durationSec * 0.9}s ease-in-out`,
      }}
    />
  )
}

function MainAmbientLayer({
  drawerWidthPx,
  reduceMotion,
}: {
  drawerWidthPx: number
  reduceMotion: boolean
}) {
  const theme = useTheme()
  const p = theme.palette.primary.main
  const s = theme.palette.secondary.main

  return (
    <Box
      aria-hidden
      sx={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: { xs: 0, md: `${drawerWidthPx}px` },
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <AmbientRandomBlob
        reduceMotion={reduceMotion}
        initialDelayMs={120}
        background={`radial-gradient(circle at 42% 42%, ${alpha(p, 0.24)}, transparent 66%)`}
        sxBase={{
          width: 'min(88vw, 760px)',
          height: 'min(88vw, 760px)',
          top: '-20%',
          left: '-15%',
          filter: 'blur(58px)',
        }}
      />
      <AmbientRandomBlob
        reduceMotion={reduceMotion}
        initialDelayMs={2400}
        background={`radial-gradient(circle at 50% 50%, ${alpha(s, 0.2)}, transparent 68%)`}
        sxBase={{
          width: 'min(78vw, 600px)',
          height: 'min(78vw, 600px)',
          bottom: '-12%',
          right: '-12%',
          filter: 'blur(54px)',
        }}
      />
      <AmbientRandomBlob
        reduceMotion={reduceMotion}
        initialDelayMs={4800}
        background={`radial-gradient(circle, ${alpha(p, 0.12)}, transparent 72%)`}
        sxBase={{
          width: 'min(58vw, 460px)',
          height: 'min(58vw, 460px)',
          top: '32%',
          left: '22%',
          filter: 'blur(44px)',
        }}
      />
    </Box>
  )
}

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
          position: 'relative',
          isolation: 'isolate',
          flexGrow: 1,
          p: { xs: 1.75, sm: 2.5 },
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: { xs: 7, md: 0 },
          minHeight: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <MainAmbientLayer drawerWidthPx={drawerWidth} reduceMotion={Boolean(reduceMotion)} />

        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            display: { xs: 'none', md: 'flex' },
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1,
            mb: 1.5,
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
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Suspense
            fallback={
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress color="primary" aria-label="Загрузка страницы" />
              </Box>
            }
          >
            <motion.div
              key={location.pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : {
                      duration: 1.15,
                      ease: [0.18, 0.75, 0.4, 1],
                    }
              }
              style={{ minHeight: 4 }}
            >
              <Outlet />
            </motion.div>
          </Suspense>
        </Box>
      </Box>
    </Box>
  )
}
