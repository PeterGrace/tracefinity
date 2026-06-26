import { describe, it, expect } from 'vitest'
import { rectangle, circle, ellipse, buildShape } from './shapes'

function bbox(pts: { x: number; y: number }[]) {
  const xs = pts.map(p => p.x)
  const ys = pts.map(p => p.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

describe('rectangle', () => {
  it('sharp rectangle has 4 points, centered at origin', () => {
    const pts = rectangle(20, 10)
    expect(pts).toHaveLength(4)
    const b = bbox(pts)
    expect(b.minX).toBeCloseTo(-10)
    expect(b.maxX).toBeCloseTo(10)
    expect(b.minY).toBeCloseTo(-5)
    expect(b.maxY).toBeCloseTo(5)
  })

  it('rounded rectangle adds arc points but keeps the bounding box', () => {
    const pts = rectangle(20, 10, 3)
    expect(pts.length).toBeGreaterThan(4)
    const b = bbox(pts)
    expect(b.minX).toBeCloseTo(-10)
    expect(b.maxX).toBeCloseTo(10)
    expect(b.minY).toBeCloseTo(-5)
    expect(b.maxY).toBeCloseTo(5)
  })

  it('clamps the corner radius to half the shorter side', () => {
    const pts = rectangle(10, 10, 999)
    const b = bbox(pts)
    expect(b.maxX).toBeCloseTo(5)
    expect(b.maxY).toBeCloseTo(5)
  })

  it('emits no zero-length edges when fully rounded (radius clamped)', () => {
    const pts = rectangle(10, 10, 999)
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1e-6)
    }
  })

  it('emits no zero-length edges for a rounded non-square rectangle', () => {
    const pts = rectangle(20, 10, 5) // radius clamps to 5 = height/2
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1e-6)
    }
  })
})

describe('circle', () => {
  it('has the requested segment count and radius', () => {
    const pts = circle(20, 32)
    expect(pts).toHaveLength(32)
    pts.forEach(p => expect(Math.hypot(p.x, p.y)).toBeCloseTo(10))
  })
})

describe('ellipse', () => {
  it('matches the requested bounding box', () => {
    const b = bbox(ellipse(40, 20, 64))
    expect(b.maxX).toBeCloseTo(20)
    expect(b.maxY).toBeCloseTo(10)
  })
})

describe('buildShape', () => {
  it('dispatches to the right generator', () => {
    expect(buildShape({ type: 'rectangle', width: 20, height: 10, cornerRadius: 0 })).toHaveLength(4)
    expect(buildShape({ type: 'circle', width: 20, height: 20, cornerRadius: 0 }).length).toBeGreaterThan(4)
  })

  it('dispatches ellipse', () => {
    const pts = buildShape({ type: 'ellipse', width: 40, height: 20, cornerRadius: 0 })
    expect(pts.length).toBeGreaterThan(4)
  })
})
