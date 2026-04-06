import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MarketService } from '@/api/generated/services/MarketService'
import { RecommendationsPage } from '../RecommendationsPage'

describe('RecommendationsPage', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders recommendation cards from API payload', async () => {
    jest.spyOn(MarketService, 'marketRecommendationsApiV1MarketRecommendationsGet').mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: 'rec-1',
            ticker: 'SBER',
            name: 'Сбербанк',
            figi: 'BBG004730N88',
            recommendation: 'BUY',
            score: 0.82,
            confidence: 0.74,
            analysisDate: '2026-02-26T10:00:00Z',
            fusionMode: 'NN+LLM',
          },
        ],
        meta: { total: 1 },
      },
    })

    render(
      <MemoryRouter initialEntries={['/recommendations']}>
        <RecommendationsPage />
      </MemoryRouter>
    )

    const heading = await screen.findByRole('heading', { name: 'Сбербанк' })
    expect(heading).toBeInTheDocument()
    const card = heading.closest('.recommendations-page__card')
    if (!card) throw new Error('Recommendation card not found')
    expect(within(card).getByText('ПОКУПАТЬ')).toBeInTheDocument()
    expect(within(card).getByText(/FIGI: BBG004730N88/)).toBeInTheDocument()
  })

  it('applies filters and sort controls', async () => {
    jest.spyOn(MarketService, 'marketRecommendationsApiV1MarketRecommendationsGet').mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: '1',
            ticker: 'GAZP',
            name: 'Газпром',
            figi: 'F1',
            recommendation: 'SELL',
            confidence: 0.4,
            score: 0.2,
          },
          {
            id: '2',
            ticker: 'SBER',
            name: 'Сбербанк',
            figi: 'F2',
            recommendation: 'BUY',
            confidence: 0.9,
            score: 0.6,
          },
        ],
        meta: { total: 2 },
      },
    })

    render(
      <MemoryRouter initialEntries={['/recommendations']}>
        <RecommendationsPage />
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: 'Газпром' })
    await userEvent.type(screen.getByLabelText('Поиск (тикер / FIGI / название)'), 'SBER')
    await userEvent.type(screen.getByLabelText('Мин. confidence (0..1)'), '0.8')

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Газпром' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Сбербанк' })).toBeInTheDocument()
    })
  })

  it('renders empty state', async () => {
    jest.spyOn(MarketService, 'marketRecommendationsApiV1MarketRecommendationsGet').mockResolvedValue({
      success: true,
      data: { items: [], meta: { total: 0 } },
    })

    render(
      <MemoryRouter initialEntries={['/recommendations']}>
        <RecommendationsPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Рекомендации не найдены')).toBeInTheDocument()
  })

  it('renders error state and retries', async () => {
    const apiMock = jest
      .spyOn(MarketService, 'marketRecommendationsApiV1MarketRecommendationsGet')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        success: true,
        data: {
          items: [{ id: '1', ticker: 'SBER', name: 'Сбербанк', figi: 'F2', recommendation: 'BUY' }],
          meta: { total: 1 },
        },
      })

    render(
      <MemoryRouter initialEntries={['/recommendations']}>
        <RecommendationsPage />
      </MemoryRouter>
    )

    expect(await screen.findByText('Ошибка загрузки')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('heading', { name: 'Сбербанк' })).toBeInTheDocument()
    expect(apiMock).toHaveBeenCalledTimes(2)
  })

  it('shows horizon momentum and filters by horizon direction', async () => {
    jest.spyOn(MarketService, 'marketRecommendationsApiV1MarketRecommendationsGet').mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: '1',
            ticker: 'AAA',
            name: 'Alpha',
            figi: 'F1',
            recommendation: 'BUY',
            nnPayload: {
              featureColumns: ['ret1', 'ret5', 'ret20'],
              featureValues: [0.01, -0.05, 0.02],
            },
          },
          {
            id: '2',
            ticker: 'BBB',
            name: 'Beta',
            figi: 'F2',
            recommendation: 'BUY',
            nnPayload: {
              featureColumns: ['ret1', 'ret5', 'ret20'],
              featureValues: [0.01, 0.05, 0.02],
            },
          },
        ],
        meta: { total: 2 },
      },
    })

    render(
      <MemoryRouter initialEntries={['/recommendations']}>
        <RecommendationsPage />
      </MemoryRouter>
    )

    expect(await screen.findAllByText('Динамика по горизонтам')).toHaveLength(2)

    await userEvent.selectOptions(screen.getAllByLabelText('Динамика по горизонту')[0], '5d')
    await userEvent.selectOptions(
      screen.getAllByLabelText('Направление (для выбранного горизонта)')[0],
      'positive'
    )

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Alpha' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Beta' })).toBeInTheDocument()
    })
  })

  it('falls back on incomplete payload fields', async () => {
    jest.spyOn(MarketService, 'marketRecommendationsApiV1MarketRecommendationsGet').mockResolvedValue({
      success: true,
      data: { items: [{ id: '1' }], meta: { total: 1 } },
    })

    render(
      <MemoryRouter initialEntries={['/recommendations']}>
        <RecommendationsPage />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Без названия' })).toBeInTheDocument()
    expect(screen.getByText('НЕИЗВЕСТНО')).toBeInTheDocument()
    expect(screen.getByText(/FIGI: —/)).toBeInTheDocument()
  })

  it('requests next page with offset=20 and updates page label', async () => {
    const apiMock = jest
      .spyOn(MarketService, 'marketRecommendationsApiV1MarketRecommendationsGet')
      .mockResolvedValue({
        success: true,
        data: {
          items: [{ id: '1', ticker: 'SBER', name: 'Сбербанк', figi: 'F2', recommendation: 'BUY' }],
          meta: { total: 41 },
        },
      })

    render(
      <MemoryRouter initialEntries={['/recommendations']}>
        <RecommendationsPage />
      </MemoryRouter>
    )

    await screen.findByRole('heading', { name: 'Сбербанк' })
    expect(screen.getByText('Страница 1 из 3')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Вперед' }))

    await waitFor(() => {
      expect(apiMock).toHaveBeenLastCalledWith({ offset: 20, limit: 20 })
    })
    expect(screen.getByText('Страница 2 из 3')).toBeInTheDocument()
  })

  it('opens recommendation detail by clicking card', async () => {
    jest.spyOn(MarketService, 'marketRecommendationsApiV1MarketRecommendationsGet').mockResolvedValue({
      success: true,
      data: {
        items: [{ id: '1', ticker: 'SBER', name: 'Сбербанк', figi: 'BBG004730N88', recommendation: 'BUY' }],
        meta: { total: 1 },
      },
    })

    render(
      <MemoryRouter initialEntries={['/recommendations']}>
        <Routes>
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="/recommendations/:figi" element={<div>detail-opened</div>} />
        </Routes>
      </MemoryRouter>
    )

    const cardHeading = await screen.findByRole('heading', { name: 'Сбербанк' })
    const clickableCard = cardHeading.closest('.recommendations-page__card-wrap')
    if (!clickableCard) throw new Error('Clickable card wrapper not found')

    await userEvent.click(clickableCard)

    expect(await screen.findByText('detail-opened')).toBeInTheDocument()
  })
})

