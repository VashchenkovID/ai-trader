import type { SxProps, Theme } from '@mui/material/styles'

/** Ячейка с FIGI / длинным идентификатором. */
export const FIGI_TABLE_CELL_SX: SxProps<Theme> = {
  fontFamily: 'ui-monospace, "Cascadia Code", Consolas, monospace',
  fontSize: '0.75rem',
  wordBreak: 'break-all',
}

/** Числовые колонки (деньги, проценты) — ровное выравнивание цифр. */
export const TABLE_NUMERIC_CELL_SX: SxProps<Theme> = {
  fontVariantNumeric: 'tabular-nums',
}
