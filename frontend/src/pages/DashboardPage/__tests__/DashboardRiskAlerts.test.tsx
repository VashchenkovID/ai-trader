import { render, screen } from '@testing-library/react'
import { DashboardRiskAlerts } from '../components/DashboardRiskAlerts'

describe('DashboardRiskAlerts', () => {
  it('shows emergency stop and limits', () => {
    render(
      <DashboardRiskAlerts riskEmergencyStop={false} riskMaxPositionSize={0.15} alertsTotal={4} />
    )

    expect(screen.getByText('Риск и предупреждения')).toBeInTheDocument()
    expect(screen.getByText(/выключена/)).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('handles null risk fields', () => {
    render(<DashboardRiskAlerts riskEmergencyStop={null} riskMaxPositionSize={null} alertsTotal={0} />)
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
