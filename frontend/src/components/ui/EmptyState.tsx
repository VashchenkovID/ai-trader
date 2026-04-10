import { Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <Box sx={{ py: 6, textAlign: 'center' }}>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        {title}
      </Typography>
      {description ? (
        <Typography variant="body2" color="text.disabled" sx={{ mb: action ? 2 : 0 }}>
          {description}
        </Typography>
      ) : null}
      {action}
    </Box>
  )
}
