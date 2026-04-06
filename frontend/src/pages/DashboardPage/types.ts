export type DashboardRecommendation = {
  id: string
  figi: string
  ticker: string
  name: string
  recommendation: string
  confidence: number | null
  score: number | null
  paperRecommendation: string | null
  paperConfidence: number | null
  paperScore: number | null
}

export type DashboardTask = {
  taskId: string
  taskType: string
  status: string
}
