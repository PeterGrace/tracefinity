'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTool } from '@/lib/api'
import { buildShape, type ShapeType } from '@/lib/shapes'
import { polygonPathData } from '@/lib/svg'

const SHAPE_LABELS: Record<ShapeType, string> = {
  rectangle: 'Rectangle',
  circle: 'Circle',
  ellipse: 'Ellipse',
}

export function NewShapeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const [type, setType] = useState<ShapeType>('rectangle')
  const [width, setWidth] = useState(80)
  const [height, setHeight] = useState(30)
  const [cornerRadius, setCornerRadius] = useState(0)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const points = useMemo(
    () => buildShape({ type, width, height, cornerRadius }),
    [type, width, height, cornerRadius],
  )

  const previewViewBox = useMemo(() => {
    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const w = Math.max(...xs) - minX || 1
    const h = Math.max(...ys) - minY || 1
    const pad = Math.max(w, h) * 0.1
    return `${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`
  }, [points])

  if (!open) return null

  async function handleCreate() {
    if (points.length < 3) {
      setError('Enter valid dimensions')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const tool = await createTool({
        name: name.trim() || SHAPE_LABELS[type],
        points,
        smoothed: false,
      })
      router.push(`/tools/${tool.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create shape')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="glass-card w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">New shape</h2>

        <div className="flex gap-2">
          {(Object.keys(SHAPE_LABELS) as ShapeType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded text-sm ${type === t ? 'bg-accent text-white' : 'bg-inset'}`}
            >
              {SHAPE_LABELS[t]}
            </button>
          ))}
        </div>

        <svg viewBox={previewViewBox} className="w-full h-40 bg-inset rounded" preserveAspectRatio="xMidYMid meet">
          <path d={polygonPathData(points, [])} fill="var(--color-tool-fill)" stroke="var(--color-tool-stroke)" strokeWidth={0.5} />
        </svg>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            <span className="text-text-muted">{type === 'circle' ? 'Diameter (mm)' : 'Width (mm)'}</span>
            <input type="number" min={1} value={width} onChange={e => setWidth(Number(e.target.value))} className="bg-inset rounded px-2 py-1" />
          </label>
          {type !== 'circle' && (
            <label className="flex flex-col gap-1">
              <span className="text-text-muted">Height (mm)</span>
              <input type="number" min={1} value={height} onChange={e => setHeight(Number(e.target.value))} className="bg-inset rounded px-2 py-1" />
            </label>
          )}
          {type === 'rectangle' && (
            <label className="flex flex-col gap-1">
              <span className="text-text-muted">Corner radius (mm)</span>
              <input type="number" min={0} value={cornerRadius} onChange={e => setCornerRadius(Number(e.target.value))} className="bg-inset rounded px-2 py-1" />
            </label>
          )}
          <label className="flex flex-col gap-1 col-span-2">
            <span className="text-text-muted">Name</span>
            <input type="text" value={name} placeholder={SHAPE_LABELS[type]} onChange={e => setName(e.target.value)} className="bg-inset rounded px-2 py-1" />
          </label>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded text-sm bg-inset">Cancel</button>
          <button type="button" onClick={handleCreate} disabled={saving} className="px-3 py-1.5 rounded text-sm bg-accent text-white disabled:opacity-50">
            {saving ? 'Creating…' : 'Create shape'}
          </button>
        </div>
      </div>
    </div>
  )
}
