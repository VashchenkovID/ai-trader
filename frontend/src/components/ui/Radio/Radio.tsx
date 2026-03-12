import { type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { cn } from '@/utils/cn'
import { Text } from '../Text/Text'
import './Radio.scss'

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode
  hint?: ReactNode
}

export function Radio({ className, id, label, hint, ...rest }: RadioProps) {
  const generatedId = useId()
  const radioId = id ?? generatedId

  return (
    <label className={cn('ui-radio', className)} htmlFor={radioId}>
      <input {...rest} id={radioId} type="radio" className="ui-radio__native" />
      <span className="ui-radio__control" aria-hidden="true" />
      <span className="ui-radio__content">
        <Text as="span" variant="label" className="ui-radio__label">
          {label}
        </Text>
        {hint && (
          <Text as="span" variant="hint" className="ui-radio__hint">
            {hint}
          </Text>
        )}
      </span>
    </label>
  )
}
