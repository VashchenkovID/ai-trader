import { SurfaceCard, Text } from '@/components/ui'
import type { DashboardTask } from '../types'

type DashboardTasksPanelProps = {
  tasks: DashboardTask[]
}

export function DashboardTasksPanel({ tasks }: DashboardTasksPanelProps) {
  return (
    <SurfaceCard className="dashboard-page__section">
      <Text as="h2" variant="title">
        Фоновые задачи
      </Text>
      {tasks.length === 0 ? (
        <Text as="p" variant="body" tone="muted">
          Нет активных/недавних задач.
        </Text>
      ) : (
        <ul className="dashboard-page__list">
          {tasks.map(task => (
            <li key={task.taskId} className="dashboard-page__list-item">
              <Text as="p" variant="label">
                {task.taskType}
              </Text>
              <Text as="p" variant="hint" tone="muted">
                status: {task.status} · taskId: {task.taskId}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </SurfaceCard>
  )
}
