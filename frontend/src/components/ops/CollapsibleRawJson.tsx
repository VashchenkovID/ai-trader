import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { Accordion, AccordionDetails, AccordionSummary, Typography } from '@mui/material'
import { JsonViewBlock } from '@/components/json/JsonViewBlock'

export function CollapsibleRawJson({
  title = 'Сырой JSON (отладка)',
  data,
  defaultExpanded = false,
  maxHeight = 320,
}: {
  title?: string
  data: unknown
  defaultExpanded?: boolean
  maxHeight?: number
}) {
  return (
    <Accordion defaultExpanded={defaultExpanded} disableGutters sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 40 }}>
        <Typography variant="caption" color="text.secondary">
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0, pt: 0 }}>
        <JsonViewBlock data={data} maxHeight={maxHeight} collapsed={2} />
      </AccordionDetails>
    </Accordion>
  )
}
