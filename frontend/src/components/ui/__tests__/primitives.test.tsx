import { fireEvent, render, screen } from '@testing-library/react'
import { Button, Checkbox, Input, Radio, Select, Switch, Textarea } from '@/components/ui'

describe('UI primitives', () => {
  test('renders button and handles click', () => {
    const onClick = jest.fn()
    render(<Button onClick={onClick}>Run</Button>)

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  test('input renders hint and error semantics', () => {
    render(<Input label="Email" error="Invalid email" />)

    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email')
  })

  test('textarea renders with label', () => {
    render(<Textarea label="Comment" />)
    expect(screen.getByLabelText('Comment')).toBeInTheDocument()
  })

  test('select updates value', () => {
    render(
      <Select
        label="Mode"
        defaultValue="paper"
        options={[
          { value: 'paper', label: 'Paper' },
          { value: 'real', label: 'Real' },
        ]}
      />
    )

    const select = screen.getByLabelText('Mode')
    fireEvent.change(select, { target: { value: 'real' } })
    expect(select).toHaveValue('real')
  })

  test('checkbox and switch change checked state', () => {
    render(
      <>
        <Checkbox label="Notify" />
        <Switch label="Auto trade" />
      </>
    )

    const checkbox = screen.getByLabelText('Notify')
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()

    const switchEl = screen.getByRole('switch', { name: 'Auto trade' })
    fireEvent.click(switchEl)
    expect(switchEl).toBeChecked()
  })

  test('radio group updates selection', () => {
    render(
      <>
        <Radio name="risk" label="Low risk" value="low" />
        <Radio name="risk" label="High risk" value="high" />
      </>
    )

    const high = screen.getByLabelText('High risk')
    fireEvent.click(high)
    expect(high).toBeChecked()
  })
})
