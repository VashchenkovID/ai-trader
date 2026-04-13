import { Box, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import type { ReactNode } from 'react'

/**
 * Обёртка графика: заголовок, минимальная высота, фон под токены (план §1.3).
 */
export function ChartContainer({
  title,
  subtitle,
  children,
  minHeight = 320,
  titleSx,
  subtitleSx,
}: {
  title?: string
  subtitle?: string
  children: ReactNode
  minHeight?: number
  titleSx?: SxProps<Theme>
  subtitleSx?: SxProps<Theme>
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
            <Typography variant="subtitle2" color="text.primary" sx={titleSx}>
              {title}
            </Typography>
          ) : null}
          {subtitle ? (
            <Typography
              variant="caption"
              sx={
                [
                  { color: 'text.secondary' },
                  ...(subtitleSx != null ? [subtitleSx] : []),
                ] as SxProps<Theme>
              }
            >
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      )}
      <Box sx={{ px: title || subtitle ? 2 : 0, pb: 2, pt: title || subtitle ? 1 : 0 }}>
        {children}
      </Box>
    </Box>
  )
}
