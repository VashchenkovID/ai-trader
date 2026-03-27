import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RiskService } from '@/api/generated/services/RiskService'
import { RiskPage } from '../RiskPage'

describe('RiskPage', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('loads risk status and limits', async () => {
    jest.spyOn(RiskService, 'riskStatusApiV1RiskStatusGet').mockResolvedValue({
      success: true,
      data: { emergencyStop: false, limits: { maxPositionSize: 0.1 } },
    } as never)
    jest.spyOn(RiskService, 'riskLimitsApiV1RiskLimitsGet').mockResolvedValue({
      success: true,
      data: { maxDailyLoss: 1000 },
    } as never)

    render(
      <MemoryRouter initialEntries={['/risk']}>
        <RiskPage />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Риск-менеджмент' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/emergencyStop/)).toBeInTheDocument())
    expect(screen.getByText(/maxDailyLoss/)).toBeInTheDocument()
  })
})
