import { useOptionsStore } from '../optionsStore'

describe('optionsStore', () => {
  it('exposes fetchOptions', async () => {
    await expect(useOptionsStore.getState().fetchOptions()).resolves.toBeUndefined()
  })
})
