import { type ReactNode, type TextareaHTMLAttributes, useId } from 'react'
import { cn } from '@/utils/cn'
import { Text } from '../Text/Text'
import './Textarea.scss'

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
}

export function Textarea({ className, id, label, hint, error, ...rest }: TextareaProps) {
  const generatedId = useId()
  const textareaId = id ?? generatedId
  const hintId = `${textareaId}-hint`
  const errorId = `${textareaId}-error`
  const isInvalid = Boolean(error || rest['aria-invalid'])
  const describedBy = [error ? errorId : '', !error && hint ? hintId : ''].filter(Boolean).join(' ')
  const ariaLabel = rest['aria-label'] ?? (typeof label === 'string' ? label : undefined)

  return (
    <label className={cn('ui-field', className)} htmlFor={textareaId}>
      {label && (
        <Text as="span" variant="label" className="ui-field__label">
          {label}
        </Text>
      )}
      <textarea
        {...rest}
        id={textareaId}
        className={cn('ui-textarea', isInvalid && 'is-invalid')}
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
