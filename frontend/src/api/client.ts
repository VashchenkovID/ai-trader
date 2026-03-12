import axios from 'axios'
import type { AxiosError } from 'axios'
import api from '../services/api'
import { OpenAPI } from './generated/core/OpenAPI'
import { getToken, removeToken } from '../services/storage'
import { resolveApiBaseUrl } from './config'

let hasAuthInterceptor = false

const ensureAuthInterceptor = () => {
  if (hasAuthInterceptor) {
    return
  }
  hasAuthInterceptor = true

  axios.interceptors.response.use(
    response => response,
    error => {
      const shouldSkipAuthRedirect = (axiosError: AxiosError) => {
        if (axiosError.response?.status !== 401) {
          return false
        }

        const requestUrl = axiosError.config?.url ?? ''
        if (!requestUrl.includes('/api/guestHashWithAuth')) {
          return false
        }

        if (typeof window === 'undefined') {
          return false
        }

        return window.location.pathname.startsWith('/j/')
      }

      if (error.response?.status === 401 && !shouldSkipAuthRedirect(error)) {
        removeToken()
        if (typeof window !== 'undefined') {
          window.location.href = '/login'
        }
      }
      return Promise.reject(error)
    }
  )
}

export const configureApiClient = () => {
  OpenAPI.BASE = resolveApiBaseUrl()
  OpenAPI.WITH_CREDENTIALS = true
  OpenAPI.CREDENTIALS = 'include'
  OpenAPI.TOKEN = async () => getToken() || ''
  ensureAuthInterceptor()
}

export * from './generated'
export { api }
