# Drawn / Parametric Shape Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create a Tool from a parametric shape (rectangle with optional rounded corners, circle, ellipse) entered in mm, without tracing a photo — landing in the existing Tool editor.

**Architecture:** A new "New shape" button on the dashboard opens a modal that generates polygon points directly in mm (frontend `shapes.ts`), POSTs them to a new `POST /api/tools` endpoint that persists a normal Tool plus an outline-only thumbnail, then routes to the existing `/tools/{id}` editor. Drawn shapes default to `smoothed=false` so exact corners are preserved.

**Tech Stack:** Backend FastAPI + Pydantic + Pillow; frontend Next.js/React/TypeScript, Vitest + Testing Library for tests.

**Spec:** `docs/superpowers/specs/2026-06-26-drawn-shape-tools-design.md`

---

## File Structure

- `backend/app/services/image_service.py` — **modify**: add `generate_outline_thumbnail()` (draws outline on blank canvas).
- `backend/app/models/schemas.py` — **modify**: add `ToolCreateRequest`.
- `backend/app/api/routes.py` — **modify**: add `POST /tools` endpoint; extend imports.
- `backend/tests/test_outline_thumbnail.py` — **create**: thumbnail unit tests.
- `backend/tests/test_create_tool.py` — **create**: endpoint tests.
- `frontend/src/lib/shapes.ts` — **create**: pure mm shape generators + `buildShape` dispatcher.
- `frontend/src/lib/shapes.test.ts` — **create**: generator unit tests.
- `frontend/src/lib/api.ts` — **modify**: add `createTool()`.
- `frontend/src/components/NewShapeDialog.tsx` — **create**: modal UI.
- `frontend/src/components/NewShapeDialog.test.tsx` — **create**: create-flow test.
- `frontend/src/app/page.tsx` — **modify**: add "New shape" button + dialog wiring.

---

## Task 1: Outline-only thumbnail generator (backend)

**Files:**
- Modify: `backend/app/services/image_service.py`
- Test: `backend/tests/test_outline_thumbnail.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_outline_thumbnail.py`:

```python
from pathlib import Path

from app.models.schemas import Point
from app.services.image_service import generate_outline_thumbnail


def test_outline_thumbnail_created(tmp_path):
    points = [
        Point(x=0, y=0),
        Point(x=20, y=0),
        Point(x=20, y=10),
        Point(x=0, y=10),
    ]
    path = generate_outline_thumbnail(points, "tool-1", tmp_path)
    assert path is not None
    assert Path(path).exists()
    assert path.endswith("tool-1.jpg")


def test_outline_thumbnail_rejects_too_few_points(tmp_path):
    points = [Point(x=0, y=0), Point(x=20, y=0)]
    assert generate_outline_thumbnail(points, "tool-1", tmp_path) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_outline_thumbnail.py -v`
Expected: FAIL with `ImportError: cannot import name 'generate_outline_thumbnail'`.

- [ ] **Step 3: Write minimal implementation**

In `backend/app/services/image_service.py`, change the import line at the top from:

```python
from PIL import Image
```

to:

```python
from PIL import Image, ImageDraw
```

Then append this function to the end of the file:

```python
def generate_outline_thumbnail(
    points, tool_id: str, output_dir: Path
) -> str | None:
    """draw a tool outline (mm points) on a blank canvas. returns path or None."""
    try:
        if len(points) < 3:
            return None
        xs = [p.x for p in points]
        ys = [p.y for p in points]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        w = max_x - min_x
        h = max_y - min_y
        size = 256
        pad = 20
        avail = size - 2 * pad
        span = max(w, h)
        scale = avail / span if span > 0 else 1.0
        off_x = (size - w * scale) / 2
        off_y = (size - h * scale) / 2
        img = Image.new("RGB", (size, size), "white")
        draw = ImageDraw.Draw(img)
        pts = [
            ((p.x - min_x) * scale + off_x, (p.y - min_y) * scale + off_y)
            for p in points
        ]
        draw.polygon(pts, fill="black")
        output_dir.mkdir(parents=True, exist_ok=True)
        thumb_file = output_dir / f"{tool_id}.jpg"
        img.save(thumb_file, "JPEG", quality=80)
        return str(thumb_file)
    except Exception:
        return None
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_outline_thumbnail.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/image_service.py backend/tests/test_outline_thumbnail.py
git commit -m "feat: outline-only tool thumbnail generator"
```

---

## Task 2: Create-tool endpoint (backend)

**Files:**
- Modify: `backend/app/models/schemas.py` (add `ToolCreateRequest` after `ToolUpdateRequest`, ~line 290)
- Modify: `backend/app/api/routes.py` (extend imports; add endpoint near the other tool routes, e.g. after the `update_tool` PUT handler at ~line 971)
- Test: `backend/tests/test_create_tool.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_create_tool.py`:

```python
from fastapi.testclient import TestClient

import app.api.routes as routes
from app.config import ensure_user_dirs, settings
from app.main import app


def _client(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "storage_path", tmp_path)
    monkeypatch.setattr(routes.settings, "storage_path", tmp_path)
    routes._store_cache.clear()
    ensure_user_dirs(tmp_path / "default")
    return TestClient(app)


def test_create_tool_persists_with_thumbnail(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)

    resp = client.post("/api/tools", json={
        "name": "Refill case",
        "points": [
            {"x": -10, "y": -5},
            {"x": 10, "y": -5},
            {"x": 10, "y": 5},
            {"x": -10, "y": 5},
        ],
    })

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Refill case"
    assert data["source_image_path"] is None
    assert data["smoothed"] is False
    assert data["thumbnail_path"] is not None

    _, tools, _ = routes.get_stores("default")
    assert tools.get(data["id"]) is not None


def test_create_tool_rejects_too_few_points(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)

    resp = client.post("/api/tools", json={
        "name": "bad",
        "points": [{"x": 0, "y": 0}, {"x": 1, "y": 1}],
    })

    assert resp.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_create_tool.py -v`
Expected: FAIL — the endpoint does not exist yet (404 / validation error).

- [ ] **Step 3a: Add the request schema**

In `backend/app/models/schemas.py`, directly after the `ToolUpdateRequest` class (ends ~line 289), add:

```python
class ToolCreateRequest(BaseModel):
    name: str
    points: list[Point]
    finger_holes: list[FingerHole] = []
    interior_rings: list[list[Point]] = []
    smoothed: bool = False
    smooth_level: float = 0.5
```

- [ ] **Step 3b: Extend the routes imports**

In `backend/app/api/routes.py`, find the import of `generate_tool_thumbnail` from the image service and add the new function. Change:

```python
from app.services.image_service import generate_tool_thumbnail
```

to:

```python
from app.services.image_service import generate_tool_thumbnail, generate_outline_thumbnail
```

Then find the `from app.models.schemas import (...)` block and add `ToolCreateRequest` to the imported names (alongside `ToolUpdateRequest`).

- [ ] **Step 3c: Add the endpoint**

In `backend/app/api/routes.py`, immediately after the `update_tool` PUT handler (the function ending with `return StatusResponse(status="ok")` at ~line 971), add:

```python
@router.post("/tools", response_model=Tool)
async def create_tool(request: Request, req: ToolCreateRequest, user_id: str = Depends(get_user_id)):
    """create a tool directly from drawn/parametric points (mm, origin-centered)."""
    if len(req.points) < 3:
        raise HTTPException(status_code=400, detail="a tool needs at least 3 points")

    _, user_tools, _ = get_stores(user_id)
    up = _user_path(user_id)

    tool_id = str(uuid.uuid4())
    thumb_abs = generate_outline_thumbnail(req.points, tool_id, up / "tools")
    thumbnail_path = _rel(thumb_abs, up) if thumb_abs else None

    tool = Tool(
        id=tool_id,
        name=req.name,
        points=req.points,
        finger_holes=req.finger_holes,
        interior_rings=req.interior_rings,
        smoothed=req.smoothed,
        smooth_level=req.smooth_level,
        thumbnail_path=thumbnail_path,
        created_at=datetime.utcnow().isoformat(),
    )
    user_tools.set(tool_id, tool)
    return tool
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_create_tool.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/schemas.py backend/app/api/routes.py backend/tests/test_create_tool.py
git commit -m "feat: POST /api/tools create endpoint for drawn shapes"
```

---

## Task 3: Shape generator module (frontend)

**Files:**
- Create: `frontend/src/lib/shapes.ts`
- Test: `frontend/src/lib/shapes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/shapes.test.ts`:

```ts
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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/shapes.test.ts`
Expected: FAIL — `Cannot find module './shapes'`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/shapes.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/shapes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/shapes.ts frontend/src/lib/shapes.test.ts
git commit -m "feat: mm shape generators (rectangle/circle/ellipse)"
```

---

## Task 4: createTool API client (frontend)

**Files:**
- Modify: `frontend/src/lib/api.ts` (add after `getTool`, ~line 193)

- [ ] **Step 1: Add the client method**

In `frontend/src/lib/api.ts`, directly after the `getTool` function (ends ~line 193), add:

```ts
export async function createTool(payload: {
  name: string
  points: Point[]
  finger_holes?: import('@/types').FingerHole[]
  interior_rings?: Point[][]
  smoothed?: boolean
  smooth_level?: number
}): Promise<Tool> {
  return fetchApi('/api/tools', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
```

Note: `Tool` and `Point` are already imported in this file (used by `getTool`/`updateTool`). If a lint error reports `Tool` is not imported, add it to the existing `import type { ... } from '@/types'` line.

- [ ] **Step 2: Verify it typechecks**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors referencing `api.ts`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: createTool API client method"
```

---

## Task 5: New-shape dialog + dashboard wiring (frontend)

**Files:**
- Create: `frontend/src/components/NewShapeDialog.tsx`
- Test: `frontend/src/components/NewShapeDialog.test.tsx`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/NewShapeDialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

const createTool = vi.fn(async () => ({ id: 'new-tool-id' }))
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
    const payload = createTool.mock.calls[0][0] as { points: unknown[]; smoothed: boolean }
    expect(payload.points).toHaveLength(4) // default sharp rectangle
    expect(payload.smoothed).toBe(false)
    await waitFor(() => expect(push).toHaveBeenCalledWith('/tools/new-tool-id'))
  })

  it('renders nothing when closed', () => {
    const { container } = render(<NewShapeDialog open={false} onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/NewShapeDialog.test.tsx`
Expected: FAIL — `Cannot find module './NewShapeDialog'`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/NewShapeDialog.tsx`:

```tsx
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
```

Add the router hook. Insert at the top of the component body, right after the other `useState` calls and before `const points = useMemo(...)`:

```tsx
  const router = useRouter()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/NewShapeDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire into the dashboard**

In `frontend/src/app/page.tsx`:

(a) Add the import near the other component imports (~line 5, by `ImageUploader`):

```tsx
import { NewShapeDialog } from '@/components/NewShapeDialog'
```

(b) Add open-state near the other `useState` declarations (~line 230, by `const [uploading, setUploading] = useState(false)`):

```tsx
  const [showNewShape, setShowNewShape] = useState(false)
```

(c) Replace the upload block (~lines 401-404):

```tsx
      {/* upload */}
      <div data-tour="upload">
        <ImageUploader onUpload={handleUpload} disabled={uploading} />
      </div>
```

with:

```tsx
      {/* upload */}
      <div data-tour="upload">
        <ImageUploader onUpload={handleUpload} disabled={uploading} />
        <div className="flex justify-center mt-3">
          <button
            type="button"
            onClick={() => setShowNewShape(true)}
            className="px-3 py-1.5 rounded text-sm bg-inset hover:bg-inset/70"
          >
            Or draw a shape
          </button>
        </div>
      </div>

      <NewShapeDialog open={showNewShape} onClose={() => setShowNewShape(false)} />
```

- [ ] **Step 6: Verify typecheck and full frontend test suite**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: typecheck clean; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/NewShapeDialog.tsx frontend/src/components/NewShapeDialog.test.tsx frontend/src/app/page.tsx
git commit -m "feat: new-shape dialog and dashboard entry point"
```

---

## Task 6: Full verification

- [ ] **Step 1: Backend test suite**

Run: `cd backend && python -m pytest tests/test_outline_thumbnail.py tests/test_create_tool.py -v`
Expected: all pass.

- [ ] **Step 2: Frontend test suite + typecheck**

Run: `cd frontend && npx tsc --noEmit && npx vitest run`
Expected: all pass, no type errors.

- [ ] **Step 3: Manual smoke test**

Run `make dev`, open the dashboard, click "Or draw a shape", create an 80×30 rounded rectangle named "Markal refill case", confirm it routes to `/tools/{id}`, the outline shows in the editor on the blank grid, then confirm it appears in the Tools section of the dashboard with a thumbnail. Add a finger hole in the editor to confirm normal editing works.

- [ ] **Step 4: Final commit (if any manual fixups were needed)**

```bash
git add -A
git commit -m "chore: drawn-shape tools verification fixups"
```

---

## Self-Review Notes

- **Spec coverage:** rectangle/circle/ellipse + rounded corners (Task 3); quadrilateral via corner-dragging needs no code (existing ToolEditor vertex mode); new-shape panel with live preview (Task 5); `POST /api/tools` (Task 2); outline-only thumbnail (Task 1); `createTool` client (Task 4); `smoothed=false` default (Tasks 2, 5); reuse of ToolEditor (no changes needed); tests for generators + endpoint + create flow (Tasks 1-5).
- **Type consistency:** `buildShape`/`ShapeParams`/`ShapeType` defined in Task 3 and consumed unchanged in Task 5; `createTool` signature defined in Task 4 matches the call in Task 5 and the backend `ToolCreateRequest` fields in Task 2.
- **Out of scope (designed-for):** freeform click-to-draw — reuses the same `createTool` path later, no rework required.
