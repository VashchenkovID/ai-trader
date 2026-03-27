import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DashboardTopRecommendations } from '../components/DashboardTopRecommendations'

describe('DashboardTopRecommendations', () => {
  const baseRec = {
    id: '1',
    figi: 'BBG1',
    ticker: 'SBER',
    name: 'Сбер',
    recommendation: 'BUY',
    confidence: 0.8,
    score: 0.9,
  }

  it('shows empty message when not loading', () => {
    render(
      <DashboardTopRecommendations
        recommendations={[]}
        recommendationsTotal={0}
        isLoading={false}
        onOpenAll={() => {}}
        onOpenOne={() => {}}
      />
    )
    expect(screen.getByText('Нет рекомендаций для отображения.')).toBeInTheDocument()
  })

  it('renders list and triggers navigation', async () => {
    const onOpenAll = jest.fn()
    const onOpenOne = jest.fn()
    const user = userEvent.setup()

    render(
      <DashboardTopRecommendations
        recommendations={[baseRec]}
        recommendationsTotal={5}
        isLoading={false}
        onOpenAll={onOpenAll}
        onOpenOne={onOpenOne}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Все рекомендации' }))
    expect(onOpenAll).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Сбер \(SBER\)/ }))
    expect(onOpenOne).toHaveBeenCalledWith('BBG1')
  })
})
