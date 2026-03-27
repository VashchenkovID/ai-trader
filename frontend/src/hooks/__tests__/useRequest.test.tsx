import { act, renderHook } from '@testing-library/react'
import { useRequest } from '../useRequest'

describe('useRequest', () => {
  it('loads data and sets success state', async () => {
    const request = jest.fn().mockResolvedValue({ id: 1 })
    const onSuccess = jest.fn()
    const { result } = renderHook(() => useRequest(request, onSuccess))

    await act(async () => {
      await result.current.load()
    })

    expect(request).toHaveBeenCalled()
    expect(result.current.data).toEqual({ id: 1 })
    expect(result.current.isSuccess).toBe(true)
    expect(onSuccess).toHaveBeenCalledWith({ id: 1 })
  })

  it('handles rejection', async () => {
    const err = { message: 'fail' }
    const request = jest.fn().mockRejectedValue(err)
    const onError = jest.fn()
    const { result } = renderHook(() => useRequest(request, () => {}, onError))

    await act(async () => {
      await result.current.load()
    })

    expect(result.current.isError).toBe(true)
    expect(onError).toHaveBeenCalledWith(err)
  })

  it('reset clears state', async () => {
    const request = jest.fn().mockResolvedValue(1)
    const { result } = renderHook(() => useRequest(request))

    await act(async () => {
      await result.current.load()
    })
    act(() => {
      result.current.reset()
    })
    expect(result.current.data).toBeNull()
    expect(result.current.isSuccess).toBe(false)
  })

  it('abort stops loading for pending request', () => {
    const request = jest.fn(() => new Promise(() => {}))
    const { result } = renderHook(() => useRequest(request))

    act(() => {
      void result.current.load()
    })
    expect(result.current.isLoading).toBe(true)
    act(() => {
      result.current.abort()
    })
    expect(result.current.isLoading).toBe(false)
  })
})
