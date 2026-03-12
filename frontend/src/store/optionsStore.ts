type OptionsStore = {
  fetchOptions: () => Promise<void>
}

const state: OptionsStore = {
  fetchOptions: async () => {},
}

export const useOptionsStore = {
  getState: (): OptionsStore => state,
}
