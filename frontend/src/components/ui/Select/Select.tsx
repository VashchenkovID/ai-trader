import {
  type ChangeEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { cn } from '@/utils/cn'
import { Text } from '../Text/Text'
import './Select.scss'

export type SelectOption = {
  label: string
  value: string
  disabled?: boolean
}

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  options: SelectOption[]
  placeholder?: string
}

export function Select({
  className,
  id,
  label,
  hint,
  error,
  options,
  placeholder,
  ...rest
}: SelectProps) {
  const {
    onChange,
    value,
    defaultValue,
    name,
    disabled,
    required,
    onBlur,
    onFocus,
    ...selectRest
  } = rest
  const generatedId = useId()
  const selectId = id ?? generatedId
  const triggerId = `${selectId}-trigger`
  const listboxId = `${selectId}-listbox`
  const hintId = `${selectId}-hint`
  const errorId = `${selectId}-error`
  const isInvalid = Boolean(error || selectRest['aria-invalid'])
  const describedBy = [error ? errorId : '', !error && hint ? hintId : ''].filter(Boolean).join(' ')
  const ariaLabel = selectRest['aria-label'] ?? (typeof label === 'string' ? label : undefined)
  const isControlled = value !== undefined
  const [isOpen, setIsOpen] = useState(false)
  const [internalValue, setInternalValue] = useState<string>(() => {
    if (defaultValue !== undefined && defaultValue !== null) return String(defaultValue)
    if (placeholder) return ''
    return options[0]?.value ?? ''
  })
  const wrapRef = useRef<HTMLSpanElement>(null)
  const selectedValue = isControlled ? String(value ?? '') : internalValue
  const selectedOption = useMemo(
    () => options.find(option => option.value === selectedValue),
    [options, selectedValue]
  )

  useEffect(() => {
    const onOutsideMouseDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', onOutsideMouseDown)
    return () => document.removeEventListener('mousedown', onOutsideMouseDown)
  }, [])

  const emitChange = (nextValue: string) => {
    const syntheticEvent = {
      target: { value: nextValue, name: name ?? '' },
      currentTarget: { value: nextValue, name: name ?? '' },
    } as ChangeEvent<HTMLSelectElement>
    onChange?.(syntheticEvent)
  }

  const handleNativeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (!isControlled) setInternalValue(event.target.value)
    onChange?.(event)
  }

  const handleOptionSelect = (nextValue: string, optionDisabled?: boolean) => {
    if (disabled || optionDisabled) return
    if (!isControlled) setInternalValue(nextValue)
    emitChange(nextValue)
    setIsOpen(false)
  }

  return (
    <label className={cn('ui-field', className)} htmlFor={selectId}>
      {label && (
        <Text as="span" variant="label" className="ui-field__label">
          {label}
        </Text>
      )}
      <span
        ref={wrapRef}
        className={cn('ui-select-wrap', isOpen && 'is-open', disabled && 'is-disabled')}
      >
        <select
          {...selectRest}
          id={selectId}
          name={name}
          className="ui-select__native"
          aria-label={ariaLabel}
          aria-invalid={isInvalid}
          aria-describedby={describedBy || undefined}
          value={selectedValue}
          required={required}
          disabled={disabled}
          onBlur={onBlur}
          onFocus={onFocus}
          onChange={handleNativeChange}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map(option => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          id={triggerId}
          type="button"
          className={cn('ui-select', isInvalid && 'is-invalid')}
          aria-label={ariaLabel}
          aria-invalid={isInvalid}
          aria-describedby={describedBy || undefined}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          disabled={disabled}
          onClick={() => setIsOpen(prev => !prev)}
        >
          <Text
            as="span"
            variant="body"
            className={cn('ui-select__value', !selectedOption && 'is-placeholder')}
          >
            {selectedOption?.label ?? placeholder ?? 'Select option'}
          </Text>
        </button>
        <span className="ui-select-wrap__chevron" aria-hidden="true">
          ▾
        </span>
        {isOpen && !disabled && (
          <ul
            id={listboxId}
            className="ui-select-wrap__menu"
            role="listbox"
            aria-labelledby={triggerId}
          >
            {options.map(option => {
              const isSelected = option.value === selectedValue
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    className={cn(
                      'ui-select-wrap__option',
                      isSelected && 'is-selected',
                      option.disabled && 'is-disabled'
                    )}
                    onClick={() => handleOptionSelect(option.value, option.disabled)}
                  >
                    <Text as="span" variant="body">
                      {option.label}
                    </Text>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </span>
      {hint && !error && (
        <Text id={hintId} as="span" variant="hint" className="ui-field__hint">
          {hint}
        </Text>
      )}
      {error && (
        <Text
          id={errorId}
          as="span"
          variant="hint"
          tone="danger"
          className="ui-field__error"
          role="alert"
        >
          {error}
        </Text>
      )}
    </label>
  )
}
