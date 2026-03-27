import { getActiveSidebarItemId, navigateFromSidebar } from './appSidebar'

describe('getActiveSidebarItemId', () => {  it('maps known routes to sidebar ids', () => {
    expect(getActiveSidebarItemId('/dashboard')).toBe('dashboard')
    expect(getActiveSidebarItemId('/dashboard/foo')).toBe('dashboard')
    expect(getActiveSidebarItemId('/recommendations')).toBe('recommendations')
    expect(getActiveSidebarItemId('/recommendations/BBG123')).toBe('recommendations')
    expect(getActiveSidebarItemId('/trading-requests')).toBe('trading-requests')
    expect(getActiveSidebarItemId('/monitoring/alerts')).toBe('monitoring-alerts')
    expect(getActiveSidebarItemId('/settings')).toBe('settings')
    expect(getActiveSidebarItemId('/portfolio')).toBe('portfolio')
  })

  it('defaults unknown paths to dashboard', () => {
    expect(getActiveSidebarItemId('/')).toBe('dashboard')
    expect(getActiveSidebarItemId('/unknown')).toBe('dashboard')
  })
})

describe('navigateFromSidebar', () => {
  it('calls navigate with path for known item', () => {
    const navigate = jest.fn()
    navigateFromSidebar(navigate, 'settings')
    expect(navigate).toHaveBeenCalledWith('/settings')
  })

  it('falls back to dashboard for unknown id', () => {
    const navigate = jest.fn()
    navigateFromSidebar(navigate, 'unknown-id')
    expect(navigate).toHaveBeenCalledWith('/dashboard')
  })
})