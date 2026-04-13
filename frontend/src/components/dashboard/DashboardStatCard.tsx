import { Card, CardContent, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { HighlightCard } from '@/components/ui/HighlightCard'

export type DashboardStatCardProps = {
  label: string
  value: ReactNode
  /** Цвет значения (например success.main / error.main для P&L). */
  valueColor?: string
  /** Дополнительный блок под значением (Chip, Select …). */
  footer?: ReactNode
  /** Ключевая метрика — неоновая рамка. */
  highlight?: boolean
}

export function DashboardStatCard({
  label,
  value,
  valueColor,
  footer,
  highlight,
}: DashboardStatCardProps) {
  const content = (
    <CardContent
      sx={{
        py: 1.25,
        px: 1.75,
        '&:last-child': { pb: 1.25 },
        minHeight: 96,
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
        justifyContent: 'flex-start',
      }}
    >
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" color={valueColor}>
        {value}
      </Typography>
      {footer}
    </CardContent>
  )

  if (highlight) {
    return <HighlightCard sx={{ height: '100%' }}>{content}</HighlightCard>
  }
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      {content}
    </Card>
  )
}
