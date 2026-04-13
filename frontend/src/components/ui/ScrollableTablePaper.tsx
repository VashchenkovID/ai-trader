import { Paper, TableContainer, type PaperProps, type TableContainerProps } from '@mui/material'
import type { ReactNode } from 'react'

export type ScrollableTablePaperProps = {
  children: ReactNode
  maxHeight?: string
  paperProps?: Omit<PaperProps, 'children'>
} & Omit<TableContainerProps, 'children' | 'component'>

/** Paper + прокрутка; внутри — `<Table stickyHeader>` при необходимости. */
export function ScrollableTablePaper({
  children,
  maxHeight = 'min(70vh, 560px)',
  paperProps,
  sx,
  ...tableContainerProps
}: ScrollableTablePaperProps) {
  return (
    <Paper variant="outlined" {...paperProps} sx={{ overflow: 'hidden', ...paperProps?.sx }}>
      <TableContainer
        {...tableContainerProps}
        sx={[
          {
            maxHeight: { xs: 'min(50vh, 420px)', sm: maxHeight },
            overflow: 'auto',
          },
          ...(Array.isArray(sx) ? sx : sx != null ? [sx] : []),
        ]}
      >
        {children}
      </TableContainer>
    </Paper>
  )
}
