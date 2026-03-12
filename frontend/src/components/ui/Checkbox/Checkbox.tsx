import { type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { cn } from '@/utils/cn'
import { Text } from '../Text/Text'
import './Checkbox.scss'

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode
  hint?: ReactNode
}

export function Checkbox({ className, id, label, hint, ...rest }: CheckboxProps) {
  const generatedId = useId()
  const checkboxId = id ?? generatedId

  return (
    <label className={cn('ui-choice', className)} htmlFor={checkboxId}>
      <input {...rest} id={checkboxId} type="checkbox" className="ui-choice__native" />
      <span className="ui-choice__control" aria-hidden="true" />
      <span className="ui-choice__content">
        <Text as="span" variant="label" className="ui-choice__label">
          {label}
        </Text>
        {hint && (
          <Text as="span" variant="hint" className="ui-choice__hint">
            {hint}
          </Text>
        )}
      </span>
    </label>
  )
}
