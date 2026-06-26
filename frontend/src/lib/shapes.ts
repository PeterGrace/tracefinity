import type { Point } from '@/types'

// All generators return mm points centered at the origin, matching the
// convention used by saved Tools.

export function rectangle(width: number, height: number, cornerRadius = 0): Point[] {
  const hw = width / 2
  const hh = height / 2
  const r = Math.max(0, Math.min(cornerRadius, hw, hh))
  if (r === 0) {
    return [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ]
  }
  const seg = 8
  const corners = [
    { cx: hw - r, cy: -(hh - r), start: -Math.PI / 2, end: 0 }, // top-right
    { cx: hw - r, cy: hh - r, start: 0, end: Math.PI / 2 }, // bottom-right
    { cx: -(hw - r), cy: hh - r, start: Math.PI / 2, end: Math.PI }, // bottom-left
    { cx: -(hw - r), cy: -(hh - r), start: Math.PI, end: (3 * Math.PI) / 2 }, // top-left
  ]
  const pts: Point[] = []
  for (const c of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = c.start + ((c.end - c.start) * i) / seg
      pts.push({ x: c.cx + r * Math.cos(a), y: c.cy + r * Math.sin(a) })
    }
  }
  return pts
}

export function ellipse(width: number, height: number, segments = 64): Point[] {
  const rx = width / 2
  const ry = height / 2
  const pts: Point[] = []
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments
    pts.push({ x: rx * Math.cos(a), y: ry * Math.sin(a) })
  }
  return pts
}

export function circle(diameter: number, segments = 64): Point[] {
  return ellipse(diameter, diameter, segments)
}

export type ShapeType = 'rectangle' | 'circle' | 'ellipse'

export interface ShapeParams {
  type: ShapeType
  width: number // mm; diameter for circle
  height: number // mm; ignored for circle
  cornerRadius: number // mm; rectangle only
}

export function buildShape(p: ShapeParams): Point[] {
  switch (p.type) {
    case 'rectangle':
      return rectangle(p.width, p.height, p.cornerRadius)
    case 'circle':
      return circle(p.width)
    case 'ellipse':
      return ellipse(p.width, p.height)
  }
}
