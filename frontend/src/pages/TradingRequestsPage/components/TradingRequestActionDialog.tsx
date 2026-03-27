import { Button, Input, SurfaceCard, Text, Textarea } from '@/components/ui'

export type TradingRequestActionType = 'approve' | 'reject' | 'execute' | 'cancel'

type TradingRequestActionDialogProps = {
  actionType: TradingRequestActionType | null
  requestId: string | null
  busy: boolean
  onClose: () => void
  onConfirm: (payload: Record<string, unknown> | null) => void
}

const titles: Record<TradingRequestActionType, string> = {
  approve: 'Подтвердить одобрение заявки',
  reject: 'Подтвердить отклонение заявки',
  execute: 'Подтвердить исполнение заявки',
  cancel: 'Подтвердить отмену заявки',
}

const submitLabels: Record<TradingRequestActionType, string> = {
  approve: 'Одобрить',
  reject: 'Отклонить',
  execute: 'Исполнить',
  cancel: 'Отменить заявку',
}

export function TradingRequestActionDialog({
  actionType,
  requestId,
  busy,
  onClose,
  onConfirm,
}: TradingRequestActionDialogProps) {
  if (!actionType || !requestId) return null

  const rootId = `tr-action-dialog-${actionType}-${requestId}`

  return (
    <div className="trading-requests-page__dialog-backdrop" role="presentation">
      <SurfaceCard className="trading-requests-page__dialog" role="dialog" aria-modal="true" aria-labelledby={`${rootId}-title`}>
        <Text as="h3" variant="title" id={`${rootId}-title`}>
          {titles[actionType]}
        </Text>
        <Text as="p" variant="body" tone="muted">
          ID заявки: {requestId}
        </Text>

        {actionType === 'approve' && (
          <Textarea id={`${rootId}-comment`} label="Комментарий (опционально)" rows={3} />
        )}
        {actionType === 'reject' && (
          <Textarea id={`${rootId}-reason`} label="Причина отклонения" rows={3} />
        )}
        {actionType === 'execute' && (
          <div className="trading-requests-page__dialog-grid">
            <Input id={`${rootId}-actual-price`} label="Фактическая цена (опционально)" type="number" step="0.01" />
            <Input id={`${rootId}-actual-amount`} label="Фактическая сумма (опционально)" type="number" step="0.01" />
          </div>
        )}

        <div className="trading-requests-page__dialog-actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Закрыть
          </Button>
          <Button
            loading={busy}
            onClick={() => {
              if (actionType === 'approve') {
                const value = (document.getElementById(`${rootId}-comment`) as HTMLTextAreaElement | null)?.value?.trim() ?? ''
                onConfirm(value ? { comment: value } : null)
                return
              }
              if (actionType === 'reject') {
                const value = (document.getElementById(`${rootId}-reason`) as HTMLTextAreaElement | null)?.value?.trim() ?? ''
                onConfirm(value ? { reason: value } : null)
                return
              }
              if (actionType === 'execute') {
                const priceRaw = (document.getElementById(`${rootId}-actual-price`) as HTMLInputElement | null)?.value ?? ''
                const amountRaw = (document.getElementById(`${rootId}-actual-amount`) as HTMLInputElement | null)?.value ?? ''
                const payload: Record<string, unknown> = {}
                if (priceRaw.trim() !== '') payload.actualPrice = Number(priceRaw)
                if (amountRaw.trim() !== '') payload.actualAmount = Number(amountRaw)
                onConfirm(Object.keys(payload).length > 0 ? payload : null)
                return
              }
              onConfirm(null)
            }}
          >
            {submitLabels[actionType]}
          </Button>
        </div>
      </SurfaceCard>
    </div>
  )
}
