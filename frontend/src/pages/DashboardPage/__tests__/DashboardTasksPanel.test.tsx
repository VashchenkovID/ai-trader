import { render, screen } from '@testing-library/react'
import { DashboardTasksPanel } from '../components/DashboardTasksPanel'

describe('DashboardTasksPanel', () => {
  it('shows empty state', () => {
    render(<DashboardTasksPanel tasks={[]} />)
    expect(screen.getByText('Нет активных/недавних задач.')).toBeInTheDocument()
  })

  it('lists tasks', () => {
    render(
      <DashboardTasksPanel
        tasks={[
          { taskId: 't1', taskType: 'weekly_update', status: 'running' },
        ]}
      />
    )
    expect(screen.getByText('weekly_update')).toBeInTheDocument()
    expect(screen.getByText(/taskId: t1/)).toBeInTheDocument()
  })
})
