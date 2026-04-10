import { Paper, Typography } from '@mui/material'

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        {title}
      </Typography>
      <Typography color="text.secondary">Раздел в разработке — маршрут подключён.</Typography>
    </Paper>
  )
}
