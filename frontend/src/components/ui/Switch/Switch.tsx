import { type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { cn } from '@/utils/cn'
import { Text } from '../Text/Text'
import './Switch.scss'

export type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode
  hint?: ReactNode
}

export function Switch({ className, id, label, hint, ...rest }: SwitchProps) {
  const generatedId = useId()
  const switchId = id ?? generatedId

  return (
    <label className={cn('ui-switch', className)} htmlFor={switchId}>
      <span className="ui-switch__meta">
        <Text as="span" variant="label" className="ui-switch__label">
          {label}
        </Text>
        {hint && (
          <Text as="span" variant="hint" className="ui-switch__hint">
            {hint}
          </Text>
        )}
      </span>
      <span className="ui-switch__track-wrap">
        <input {...rest} id={switchId} type="checkbox" role="switch" className="ui-switch__native" />
        <span className="ui-switch__track" aria-hidden="true">
          <span className="ui-switch__thumb" />
        </span>
      </span>
    </label>
  )
}
