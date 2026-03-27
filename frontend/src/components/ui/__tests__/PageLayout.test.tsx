import { render, screen } from '@testing-library/react'
import { PageLayout } from '../PageLayout/PageLayout'
import { Text } from '../Text/Text'

describe('PageLayout', () => {
  it('renders header, sidebar and children', () => {
    render(
      <PageLayout
        header={<Text as="h1">Title</Text>}
        sidebar={<nav aria-label="Side">Nav</nav>}
      >
        <p>Body</p>
      </PageLayout>
    )

    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Side' })).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('renders children only when no header', () => {
    render(
      <PageLayout>
        <div>Only</div>
      </PageLayout>
    )
    expect(screen.getByText('Only')).toBeInTheDocument()
  })
})
