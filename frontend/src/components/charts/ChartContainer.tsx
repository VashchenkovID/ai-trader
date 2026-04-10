import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'

/**
 * Обёртка графика: заголовок, минимальная высота, фон под токены (план §1.3).
 */
export function ChartContainer({
  title,
  subtitle,
  children,
  minHeight = 320,
}: {
  title?: string
  subtitle?: string
  children: ReactNode
  minHeight?: number
}) {
  return (
    <Box
      sx={{
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'action.hover',
        overflow: 'hidden',
        minHeight,
      }}
    >
      {(title || subtitle) && (
        <Box sx={{ px: 2, pt: 1.5, pb: title ? 0.5 : 0 }}>
          {title ? (
            <Typography variant="subtitle2" color="text.primary">
              {title}
            </Typography>
          ) : null}
          {subtitle ? (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      )}
      <Box sx={{ px: title || subtitle ? 2 : 0, pb: 2, pt: title || subtitle ? 1 : 0 }}>{children}</Box>
    </Box>
  )
}
