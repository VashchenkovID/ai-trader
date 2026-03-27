import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RecommendationPipelineService } from '@/api/generated/services/RecommendationPipelineService'
import { TrainingService } from '@/api/generated/services/TrainingService'
import { TrainingPipelinePage } from '../TrainingPipelinePage'

describe('TrainingPipelinePage', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('runs recommendation pipeline', async () => {
    const pipeSpy = jest
      .spyOn(RecommendationPipelineService, 'recommendationPipelineRunApiV1RecommendationPipelineRunPost')
      .mockResolvedValue({ success: true, data: { ok: true } } as never)

    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/training']}>
        <TrainingPipelinePage />
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: 'Обучение и пайплайн' })
    await user.click(screen.getByRole('button', { name: 'Запустить pipeline' }))
    await waitFor(() =>
      expect(pipeSpy).toHaveBeenCalledWith({
        mode: 'paper',
        limit: 50,
      })
    )
    expect(await screen.findByText(/Pipeline запущен/)).toBeInTheDocument()
  })

  it('runs NN training when FIGI provided', async () => {
    const nnSpy = jest.spyOn(TrainingService, 'runNnFromFigiApiV1TrainingRunNnFromFigiPost').mockResolvedValue({
      success: true,
      data: { taskId: 't1' },
    } as never)

    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/training']}>
        <TrainingPipelinePage />
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: 'Обучение и пайплайн' })
    await user.type(screen.getByLabelText('FIGI'), 'BBG004730N88')
    await user.click(screen.getByRole('button', { name: 'Запустить обучение' }))
    await waitFor(() =>
      expect(nnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          figi: 'BBG004730N88',
          epochs: 20,
        })
      )
    )
  })

  it('shows validation when FIGI empty', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/training']}>
        <TrainingPipelinePage />
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: 'Обучение и пайплайн' })
    await user.click(screen.getByRole('button', { name: 'Запустить обучение' }))
    expect(await screen.findByText('Укажите FIGI')).toBeInTheDocument()
  })

  it('navigates to settings', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/training']}>
        <Routes>
          <Route path="/training" element={<TrainingPipelinePage />} />
          <Route path="/settings" element={<div data-testid="st">settings</div>} />
        </Routes>
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: 'Обучение и пайплайн' })
    await user.click(screen.getByRole('button', { name: 'Открыть настройки (фоновые задачи)' }))
    expect(await screen.findByTestId('st')).toBeInTheDocument()
  })
})
