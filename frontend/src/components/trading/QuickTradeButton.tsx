import { useState } from 'react'
import { Button } from '@/components/ui'
import { useTradingCoreStore } from '@/store/tradingCoreStore'
import { QuickTradeModal, type QuickTradeSource } from './QuickTradeModal'
import './QuickTrade.scss'

export type { QuickTradeSource }

export type QuickTradeButtonProps = {
  intent: 'buy' | 'sell'
  source: QuickTradeSource
  confidence: number
  score: number
  mode?: string
  portfolioTotalValue?: number | null
  onSuccess?: () => void
  disabled?: boolean
  className?: string
}

export function QuickTradeButton({
  intent,
  source,
  confidence,
  score,
  mode: modeProp,
  portfolioTotalValue,
  onSuccess,
  disabled,
  className,
}: QuickTradeButtonProps) {
  const [open, setOpen] = useState(false)
  const tradingMode = useTradingCoreStore(s => s.tradingMode)
  const mode = (modeProp ?? String(tradingMode?.mode ?? 'paper')).toLowerCase()

  const label = intent === 'buy' ? 'Купить' : 'Продать'
  const variant = intent === 'buy' ? 'primary' : 'secondary'

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={className}
        disabled={disabled}
        onClick={e => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {label}
      </Button>
      <QuickTradeModal
        open={open}
        onClose={() => setOpen(false)}
        intent={intent}
        source={source}
        confidence={confidence}
        score={score}
        mode={mode}
        portfolioTotalValue={portfolioTotalValue}
        onSuccess={onSuccess}
      />
    </>
  )
}
