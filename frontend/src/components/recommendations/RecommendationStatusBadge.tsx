import { Chip, type ChipProps, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import {
  parseRecommendationSignal,
  RecommendationSignal,
  ruLabelForKnownRecommendationSignal,
} from './recommendationSignal'

export type RecommendationStatusBadgeProps = {
  value: string | null | undefined
} & Omit<ChipProps, 'label' | 'color' | 'variant'>

export function RecommendationStatusBadge({
  value,
  sx,
  size = 'small',
  ...rest
}: RecommendationStatusBadgeProps) {
  const theme = useTheme()
  const sig = parseRecommendationSignal(value)
  if (sig === RecommendationSignal.Unknown) {
    return null
  }
  const label = ruLabelForKnownRecommendationSignal(sig)

  const neon = (hex: string) => ({
    border: `1px solid ${hex}`,
    color: hex,
    bgcolor: alpha(hex, 0.08),
    boxShadow: `0 0 12px ${alpha(hex, 0.35)}`,
  })

  const cyan = theme.palette.primary.main
  const magenta = theme.palette.secondary.main
  const muted = theme.palette.text.secondary

  const sxBySignal =
    sig === RecommendationSignal.Buy
      ? neon(cyan)
      : sig === RecommendationSignal.Sell
        ? neon(magenta)
        : {
            border: `1px solid ${alpha(muted, 0.45)}`,
            color: muted,
            bgcolor: alpha(muted, 0.08),
          }

  return (
    <Chip
      size={size}
      label={label}
      variant="outlined"
      sx={[
        {
          borderRadius: '6px',
          fontWeight: 600,
          letterSpacing: 0.02,
          ...sxBySignal,
        },
        ...(Array.isArray(sx) ? sx : sx != null ? [sx] : []),
      ]}
      {...rest}
    />
  )
}
