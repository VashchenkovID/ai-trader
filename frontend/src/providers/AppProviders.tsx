import type { ReactNode } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { appTheme } from '@/theme/appTheme'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline enableColorScheme />
      {children}
    </ThemeProvider>
  )
}
