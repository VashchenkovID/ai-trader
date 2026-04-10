import type { CardProps } from '@mui/material'
import { Card } from '@mui/material'

/** Карточка с неоновой рамкой (референс §1.3). */
export function HighlightCard({ sx, ...props }: CardProps) {
  return (
    <Card
      variant="outlined"
      {...props}
      sx={{
        borderColor: 'secondary.main',
        boxShadow: theme => `0 0 0 1px ${theme.palette.secondary.main}33, 0 0 24px ${theme.palette.secondary.main}22`,
        ...sx,
      }}
    />
  )
}
