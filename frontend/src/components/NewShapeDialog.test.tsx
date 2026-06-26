// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

const createTool = vi.fn(async (..._args: unknown[]) => ({ id: 'new-tool-id' }))
vi.mock('@/lib/api', () => ({
  createTool: (...args: unknown[]) => createTool(...args),
}))

import { NewShapeDialog } from './NewShapeDialog'

describe('NewShapeDialog', () => {
  beforeEach(() => {
    push.mockClear()
    createTool.mockClear()
  })

  it('creates a tool from the default rectangle and routes to the editor', async () => {
    render(<NewShapeDialog open onClose={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: /create shape/i }))

    await waitFor(() => expect(createTool).toHaveBeenCalledTimes(1))
    const payload = createTool.mock.calls[0]![0] as { points: unknown[]; smoothed: boolean }
    expect(payload.points).toHaveLength(4) // default sharp rectangle
    expect(payload.smoothed).toBe(false)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/tools/new-tool-id'))
  })

  it('renders nothing when closed', () => {
    const { container } = render(<NewShapeDialog open={false} onClose={() => {}} />)
    // jest-dom's toBeEmptyDOMElement is not configured in this repo; assert
    // equivalently that the closed dialog renders no DOM children.
    expect(container.innerHTML).toBe('')
  })
})
