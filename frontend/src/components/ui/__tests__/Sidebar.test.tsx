import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar } from '../Sidebar/Sidebar'

describe('Sidebar', () => {
  it('calls onSelect with item id', async () => {
    const onSelect = jest.fn()
    const user = userEvent.setup()

    render(
      <Sidebar
        title="Nav"
        items={[
          { id: 'a', label: 'First' },
          { id: 'b', label: 'Second' },
        ]}
        activeItemId="a"
        onSelect={onSelect}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Second' }))
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('marks active item', () => {
    render(
      <Sidebar
        items={[{ id: 'x', label: 'Active' }]}
        activeItemId="x"
      />
    )
    const btn = screen.getByRole('button', { name: 'Active' })
    expect(btn.className).toContain('is-active')
  })
})
