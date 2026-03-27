import { render, screen } from '@testing-library/react'
import { DashboardKpiRow } from '../components/DashboardKpiRow'

describe('DashboardKpiRow', () => {
  it('renders KPI values', () => {
    render(
      <DashboardKpiRow totalBalance={1_000_000} profitLoss={5000} taskActiveCount={2} alertsTotal={3} />
    )

    expect(screen.getByText('Баланс портфеля')).toBeInTheDocument()
    expect(screen.getByText('P&L')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })
})
