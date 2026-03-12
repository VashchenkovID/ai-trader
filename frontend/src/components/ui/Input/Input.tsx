import { type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { cn } from '@/utils/cn'
import { Text } from '../Text/Text'
import './Input.scss'

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
}

export function Input({ className, id, label, hint, error, ...rest }: InputProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const isInvalid = Boolean(error || rest['aria-invalid'])
  const describedBy = [error ? errorId : '', !error && hint ? hintId : ''].filter(Boolean).join(' ')
  const ariaLabel = rest['aria-label'] ?? (typeof label === 'string' ? label : undefined)

  return (
    <label className={cn('ui-field', className)} htmlFor={inputId}>
      {label && (
        <Text as="span" variant="label" className="ui-field__label">
          {label}
        </Text>
      )}
      <input
        {...rest}
        id={inputId}
        className={cn('ui-input', isInvalid && 'is-invalid')}
        aria-label={ariaLabel}
        aria-invalid={isInvalid}
        aria-describedby={describedBy || undefined}
      />
      {hint && !error && (
        <Text id={hintId} as="span" variant="hint" className="ui-field__hint">
          {hint}
        </Text>
      )}
      {error && (
        <Text id={errorId} as="span" variant="hint" tone="danger" className="ui-field__error" role="alert">
          {error}
        </Text>
      )}
    </label>
  )
}
