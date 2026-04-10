import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import type { ReactNode } from 'react'

export type LabeledValueRow = {
  label: string
  value: ReactNode
  hint?: string
}

export function LabeledValuesTable({ rows, dense = true }: { rows: LabeledValueRow[]; dense?: boolean }) {
  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        Нет данных.
      </Typography>
    )
  }
  return (
    <TableContainer>
      <Table size={dense ? 'small' : 'medium'}>
        <TableHead>
          <TableRow>
            <TableCell width="42%">Параметр</TableCell>
            <TableCell>Значение</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.label}>
              <TableCell sx={{ verticalAlign: 'top' }}>
                {row.hint ? (
                  <Tooltip title={row.hint} placement="top" enterDelay={400}>
                    <Typography component="span" variant="body2" sx={{ borderBottom: '1px dotted', cursor: 'help' }}>
                      {row.label}
                    </Typography>
                  </Tooltip>
                ) : (
                  <Typography variant="body2">{row.label}</Typography>
                )}
              </TableCell>
              <TableCell sx={{ verticalAlign: 'top' }}>
                <Typography variant="body2" component="div">
                  {row.value}
                </Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
