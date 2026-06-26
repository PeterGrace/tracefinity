# Drawn / Parametric Shape Tools — Design

**Date:** 2026-06-26
**Status:** Approved (pending spec review)

## Problem

Tools are currently created only by tracing a photo: upload → detect paper →
perspective-correct → AI trace → edit polygon → save. Some cutouts have no good
photo source or are simpler to specify by dimension — e.g. a refill container
that's just a rectangular box. Users want to create a Tool from a drawn or
parametric shape without going through the tracing pipeline.

Immediate need: parametric primitives (rectangle is primary). Longer-term goal:
freeform click-to-draw outlines. This design covers the parametric primitives
and is structured so freeform drawing slots in later without rework.

## Goals

- Create a Tool from a parametric primitive (rectangle, circle, ellipse),
  entered in mm, without a photo.
- Rectangle supports configurable rounded corners; equal width/height = square.
- Rhombus / trapezoid / general quadrilateral are achieved by creating a
  rectangle and dragging its corner vertices in the existing editor (no separate
  primitive).
- The result is a normal Tool: appears in the library, editable in the existing
  ToolEditor (vertices, finger holes, smoothing, naming), placeable in bins,
  exportable to STL/SVG.

## Non-goals (designed for, not built now)

- Freeform click-to-draw outline creation (the eventual "C" mode).
- Dedicated quadrilateral/ellipse-arc primitives beyond the three above.

Both land naturally in the existing editor later and reuse the same
`POST /api/tools` create endpoint.

## Key decisions

1. **Geometry generated in mm on the frontend.** A new pure-function module
   produces polygon points directly in mm, origin-centered — no synthetic
   `scale_factor`. This enables a live preview in the create panel and is
   reusable by the future freeform mode. The backend just persists supplied
   points.
2. **Drawn shapes default to `smoothed=false`.** The STL pipeline applies
   Chaikin smoothing when `smoothed=true`, which would round off a precise
   rectangle's corners and alter exact dimensions. Drawn primitives are exact by
   construction, so smoothing is off by default. The user can toggle it on in
   the editor.

## Architecture

```
Dashboard "New shape" button
        │
        ▼
New-shape panel (modal)         src/components/NewShapeDialog.tsx (new)
  - type: Rectangle | Circle | Ellipse
  - dimensions (mm), corner radius (rectangle)
  - name (defaults to shape type)
  - live SVG preview
        │  generates Point[] in mm via src/lib/shapes.ts (new)
        ▼
createTool({ name, points, smoothed:false, ... })   src/lib/api.ts (new method)
        │
        ▼
POST /api/tools                 backend/app/api/routes.py (new endpoint)
  - id + created_at, source_* = null
  - outline-only thumbnail
  - ToolStore.set(...)
  - returns created Tool
        │
        ▼
navigate to /tools/{id}         existing ToolEditor — unchanged
```

## Components

### 1. Shape generator — `frontend/src/lib/shapes.ts` (new)

Pure functions returning `Point[]` (mm, centered at origin):

- `rectangle(width, height, cornerRadius = 0): Point[]`
  - Four corners centered at origin.
  - If `cornerRadius > 0`, each corner is replaced by an arc approximated with
    ~8 segments. `cornerRadius` is clamped to `min(width, height) / 2`.
- `circle(diameter, segments = 64): Point[]`
  - Regular-polygon approximation of a circle.
- `ellipse(width, height, segments = 64): Point[]`
  - Polygon approximation of an ellipse with the given bounding box.

Winding order matches what the rest of the pipeline expects for outlines (match
existing traced-polygon convention). Unit-tested for point counts, bounding box,
and origin-centering.

### 2. New-shape panel — `frontend/src/components/NewShapeDialog.tsx` (new)

Modal launched from the dashboard tools section, beside the existing photo
upload:

- Shape type selector: Rectangle / Circle / Ellipse.
- Dimension inputs in mm: width/height for rectangle and ellipse; diameter for
  circle. Corner-radius input shown only for rectangle.
- Optional name field, defaulting to the shape type ("Rectangle", etc.).
- A small live SVG preview rendering the generated outline.
- "Create" calls `createTool(...)` then routes to `/tools/{newId}`.
- Basic validation: positive dimensions; radius within bounds.

### 3. Create endpoint — `POST /api/tools` (backend)

`backend/app/api/routes.py` + a request schema in
`backend/app/models/schemas.py`.

Request body:

```
{
  name: str,
  points: list[Point],          # mm, origin-centered
  finger_holes?: list[FingerHole] = [],
  interior_rings?: list[list[Point]] = [],
  smoothed?: bool = False,
  smooth_level?: float = 0.5
}
```

Behavior:

- Generate `id` (UUID) and `created_at`.
- Set all `source_*` fields to null.
- Generate an outline-only thumbnail (component 4); on failure, `thumbnail_path`
  stays null (non-fatal, mirrors existing thumbnail handling).
- Persist via `ToolStore.set(tool_id, tool)`.
- Return the created Tool.

Frontend API client gains `createTool(payload): Promise<Tool>` in
`frontend/src/lib/api.ts`.

### 4. Outline-only thumbnail — `backend/app/services/image_service.py` (new fn)

`generate_outline_thumbnail(points, tool_id, output_dir) -> str | None`:

- Draw the filled outline (black on white) on a blank canvas, scaled to fit
  256px with padding, preserving aspect ratio.
- Save as JPEG `{tool_id}.jpg` in `output_dir`, return the path (or None on
  error).
- Existing `generate_tool_thumbnail` (photo-based) is untouched; the new
  function is used by `POST /api/tools`.

## Reused unchanged

ToolEditor, ToolEditorCanvas, the `/tools/[id]` page, debounced save
(`PUT /api/tools/{id}`), finger-hole and smoothing machinery, auto-rotate, SVG
export, and frontend geometry utilities. The Tool model already accepts null for
all `source_*` and `thumbnail_path` fields and persists with just `name` +
`points`, so no model changes are needed beyond the new request schema.

## Data flow / coordinates

- Generator output is mm, origin-centered — the same convention saved Tools use,
  so no scaling/centering step is required on create (unlike the traced path,
  which scales pixels by `scale_factor` and re-centers).
- Rounded corners and curves are baked into the polygon points; there is no
  parametric record kept. Editing a rounded rectangle therefore edits its
  generated points (acceptable; rectangles are the primary case and corner
  rounding is typically set once at creation).

## Error handling

- Frontend validates dimensions/radius before enabling "Create".
- Backend validates the request schema (Pydantic); rejects empty `points` or
  fewer than 3 points with a 4xx.
- Thumbnail generation failure is non-fatal (logged, `thumbnail_path = null`),
  matching existing behavior.

## Testing

- **Backend:** `POST /api/tools` creates a persisted tool with null source
  fields and a thumbnail; rejects malformed payloads (e.g. < 3 points).
- **Frontend:** unit tests for `shapes.ts` (rectangle incl. rounded corners,
  circle, ellipse — point counts, centering, bounding box); a test that the
  create flow posts the expected points and routes to the editor.

## Future extension: freeform draw (C)

A "blank canvas" draw mode (in the new dialog or the editor) lets the user click
to place points on the mm grid, producing a `Point[]` that flows through the same
`createTool` / `POST /api/tools` path. No backend changes anticipated beyond what
this design already adds.
