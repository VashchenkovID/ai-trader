import { FormHelperText, Stack, Typography, type SxProps, type Theme } from '@mui/material'
import type { ReactNode } from 'react'

/**
 * Обёртка поля: label, hint, error — единый контракт для форм (план §1.3).
 * Дочерний инпут без собственного `label` (передаётся `id` для связи).
 */
export function FormField({
  id,
  label,
  hint,
  error,
  children,
  sx,
}: {
  id?: string
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
  sx?: SxProps<Theme>
}) {
  const showError = Boolean(error)
  return (
    <Stack spacing={0.5} sx={sx}>
      <Typography component="label" variant="body2" htmlFor={id} sx={{ fontWeight: 500 }}>
        {label}
      </Typography>
      {children}
      {(hint || showError) && (
        <FormHelperText error={showError} id={id ? `${id}-helper` : undefined} sx={{ mx: 0 }}>
          {showError ? error : hint}
        </FormHelperText>
      )}
    </Stack>
  )
}
