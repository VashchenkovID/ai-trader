/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_API_BASE_PATH?: string
  readonly VITE_WS_SYSTEM_STATUS_PATH?: string
  /**
   * Лабораторные маршруты (`/portfolio-analyzer`, `/backtest-sma`).
   * По умолчанию включены; полное отключение: `VITE_ENABLE_LAB_ROUTES=false`.
   */
  readonly VITE_ENABLE_LAB_ROUTES?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
