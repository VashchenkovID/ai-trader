import { useEffect, useRef, useState } from 'react'
import type { ApiError } from '@/api/generated'
import { RequestStatusEnum } from '@/store/constants'

export type RequestFulfilled<R> = {
  status: RequestStatusEnum.FULFILLED
  data: R
}

export type RequestRejected = {
  status: RequestStatusEnum.REJECTED
  data: ApiError
}

type UseRequestOptions<T extends unknown[]> = {
  passSignal?: boolean
  buildArgsWithSignal?: (args: T, signal: AbortSignal) => T
}

export const useRequest = <T extends unknown[], R>(
  request: (...args: T) => Promise<R>,
  successCallback: (data?: R) => void = () => {},
  errorCallback: (err?: ApiError) => void = () => {},
  options: UseRequestOptions<T> = {}
) => {
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isError, setIsError] = useState(false)
  const [data, setData] = useState<R | null>(null)

  const cancelRequest = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const reset = () => {
    setIsLoading(false)
    setIsSuccess(false)
    setIsError(false)
    setData(null)
  }

  const abort = () => {
    cancelRequest.current = true
    abortControllerRef.current?.abort()
    setIsLoading(false)
  }

  const load = async (...args: T): Promise<RequestFulfilled<R> | RequestRejected> => {
    cancelRequest.current = false
    setIsLoading(true)
    setIsSuccess(false)
    setIsError(false)
    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()

    const signal = abortControllerRef.current.signal
    const finalArgs = options.buildArgsWithSignal
      ? options.buildArgsWithSignal(args, signal)
      : options.passSignal
        ? ([...args, signal] as T)
        : args

    return request(...finalArgs)
      .then(response => {
        if (!cancelRequest.current) {
          setData(response)
          setIsSuccess(true)
          successCallback(response)
        }
        const result: RequestFulfilled<R> = {
          status: RequestStatusEnum.FULFILLED,
          data: response,
        }
        return result
      })
      .catch((err: ApiError) => {
        if (!cancelRequest.current) {
          setIsError(true)
          errorCallback(err)
        }
        const result: RequestRejected = {
          status: RequestStatusEnum.REJECTED,
          data: err,
        }
        return result
      })
      .finally(() => {
        if (!cancelRequest.current) {
          setIsLoading(false)
        }
      })
  }

  useEffect(() => {
    return () => {
      cancelRequest.current = true
      abortControllerRef.current?.abort()
    }
  }, [])

  return {
    load,
    reset,
    abort,
    isLoading,
    isSuccess,
    isError,
    data,
  }
}
