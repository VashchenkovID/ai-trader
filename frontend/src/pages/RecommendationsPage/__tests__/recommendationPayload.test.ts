import { normalizeRecommendation, safeRecommendationsPayload } from '../recommendationPayload'

describe('recommendationPayload', () => {
  it('normalizes minimal BUY payload', () => {
    const r = normalizeRecommendation({
      id: '1',
      ticker: 'SBER',
      figi: 'F1',
      recommendation: 'buy',
      score: 0.5,
      confidence: 0.8,
    })
    expect(r.recommendation).toBe('BUY')
    expect(r.ticker).toBe('SBER')
    expect(r.figi).toBe('F1')
    expect(r.fusionMode).toBe('unknown')
  })

  it('detects NN+LLM fusion', () => {
    const r = normalizeRecommendation({
      nnScore: 0.4,
      llmReason: 'ok',
      llmJuryPayload: { x: 1 },
    })
    expect(r.fusionMode).toBe('NN+LLM')
  })

  it('parses horizon momentum from nn payload features', () => {
    const r = normalizeRecommendation({
      ticker: 'X',
      figi: 'F',
      nn_payload: {
        featureColumns: ['ret1', 'ret5'],
        featureValues: [0.01, -0.02],
      },
    })
    expect(r.horizonMomentum.length).toBeGreaterThan(0)
    expect(r.horizonMomentum[0].id).toBe('1d')
  })

  it('safeRecommendationsPayload reads items array', () => {
    const list = safeRecommendationsPayload({
      items: [{ ticker: 'GAZP', figi: 'G1', recommendation: 'HOLD' }],
    })
    expect(list).toHaveLength(1)
    expect(list[0].recommendation).toBe('HOLD')
  })

  it('safeRecommendationsPayload returns empty for invalid', () => {
    expect(safeRecommendationsPayload(null)).toEqual([])
    expect(safeRecommendationsPayload({})).toEqual([])
  })
})
