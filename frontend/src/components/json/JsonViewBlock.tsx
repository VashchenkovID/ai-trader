import JsonView from '@uiw/react-json-view'
import { darkTheme } from '@uiw/react-json-view/dark'
import { lightTheme } from '@uiw/react-json-view/light'
import { Box, Typography, useTheme } from '@mui/material'
import { useMemo } from 'react'

function toViewValue(data: unknown): object {
  if (data === null || data === undefined) {
    return { '(пусто)': data }
  }
  if (Array.isArray(data)) {
    return data as unknown as object
  }
  if (typeof data === 'object') {
    return data as object
  }
  return { value: data }
}

/**
 * Дерево JSON с раскрытием вложенности, копированием и подсветкой (@uiw/react-json-view).
 */
export function JsonViewBlock({
  data,
  maxHeight = 420,
  collapsed = 2,
  displayDataTypes = false,
}: {
  data: unknown
  maxHeight?: number
  collapsed?: boolean | number
  displayDataTypes?: boolean
}) {
  const muiTheme = useTheme()
  const isDark = muiTheme.palette.mode === 'dark'
  const jsonTheme = isDark ? darkTheme : lightTheme

  const { value, plainText, empty } = useMemo(() => {
    if (data === null || data === undefined) {
      return { value: null as object | null, plainText: null as string | null, empty: true }
    }
    if (typeof data === 'string') {
      const t = data.trim()
      if (!t) return { value: null as object | null, plainText: '—', empty: false }
      try {
        const parsed: unknown = JSON.parse(t)
        return { value: toViewValue(parsed), plainText: null as string | null, empty: false }
      } catch {
        return { value: null as object | null, plainText: data, empty: false }
      }
    }
    return { value: toViewValue(data), plainText: null as string | null, empty: false }
  }, [data])

  if (empty) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    )
  }

  if (plainText !== null) {
    return (
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 1.5,
          bgcolor: 'action.hover',
          borderRadius: 1,
          overflow: 'auto',
          maxHeight,
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {plainText}
      </Box>
    )
  }

  if (!value) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    )
  }

  return (
    <Box
      sx={{
        maxHeight,
        overflow: 'auto',
        p: 1,
        borderRadius: 1,
        bgcolor: 'action.hover',
        fontSize: 12,
      }}
    >
      <JsonView
        value={value}
        style={{
          ...jsonTheme,
          backgroundColor: 'transparent',
        }}
        collapsed={collapsed}
        displayDataTypes={displayDataTypes}
        displayObjectSize
        shortenTextAfterLength={72}
        enableClipboard
      />
    </Box>
  )
}
