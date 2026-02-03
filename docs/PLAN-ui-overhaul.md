# Plan: UI Overhaul & Layout Improvements

> **Task:** Implement comprehensive UI layout changes based on `ui-update.md` and design mockups.
> **Goal:** Enhance usability, visual hierarchy, and aesthetics of the Sovereign Watch dashboard.
> **Status:** PLANNING

## 1. Overview

The goal is to refactor the Sovereign Watch UI to match the "Node-01" tactical aesthetic. This involves restructuring both sidebars, improving map interactions (clustering/tooltips), and refining the global design system (typography, spacing, palette).

**Key Drivers:**

- **Clutter Reduction:** Consolidate widgets in the Left Sidebar.
- **Hierarchy:** Organize the Right Sidebar into logical groups (Target, Position, Kinematics).
- **Readability:** Improve data contrast and map tooltips.
- **Performance:** Ensure new visual elements (blur, animations) don't degrade map performance.

## 2. Project Type & Tech Stack

**Project Type:** **WEB**

**Tech Stack:**

- **Framework:** React + Vite
- **Styling:** TailwindCSS (Custom configuration for "Tactical" theme)
- **Map:** Deck.gl + MaplibreGL
- **Icons:** Lucide React
- **New Dependencies (Potential):** `clsx` / `tailwind-merge` for clean class composition.

## 3. Success Criteria

1. **Left Sidebar:**
   - [ ] "Layer Filters" moved to top.
   - [ ] "Track Summary" widgets consolidated into tabbed/accordion "System Status" panel.
   - [ ] "Intelligence Feed" has fixed max-height and internal scroll.
2. **Right Sidebar:**
   - [ ] Data grouped into: Target ID, Position, Kinematics, Metadata.
   - [ ] Custom **Compass Widget** implemented and linked to Course data.
   - [ ] Actions ("Center", "Report") moved to top; "Raw Payload" at bottom.
3. **Map:**
   - [ ] Tooltips updated to glassmorphism style.
   - [ ] Point clustering implemented for dense areas.
4. **General:**
   - [ ] "Node-01" header branding updated.
   - [ ] Typography scale applied consistentley.

## 4. File Structure

```text
frontend/src/
├── components/
│   ├── layouts/
│   │   ├── SidebarLeft.tsx       # New: Consolidated Left Panel
│   │   ├── SidebarRight.tsx      # Refactor: Was DetailsSidebar.tsx
│   │   └── MainHud.tsx           # Wrapper for Top Bar + Sidebars
│   ├── widgets/
│   │   ├── Compass.tsx           # New: SVG Compass visualization
│   │   ├── SystemStatus.tsx      # New: Tabbed summary charts
│   │   └── IntelFeed.tsx         # Refactor: Externalize feed logic
│   └── map/
│       ├── TacticalMap.tsx       # Update: Clustering + Tooltips
│       └── MapTooltip.tsx        # New: Isolated tooltip component
```

## 5. Task Breakdown

### Phase 1: Foundation & Design System (P1)

- [ ] **[Task-1.1] Design Tokens Update**
  - **Input:** `tailwind.config.js`
  - **Action:** Define precise colors (Emerald/Cyan variations), spacing grid (4px base), and typography scale (`mono-xs`, `mono-xl`).
  - **Output:** Updated Tailwind config.
  - **Verify:** Components utilize new utility classes.

- [ ] **[Task-1.2] HUD Shell Refactor**
  - **Input:** `App.tsx`
  - **Action:** Create `MainHud.tsx` layout wrapper to manage sidebar positioning and Z-indexing. Move header logic here.
  - **Output:** Cleaner `App.tsx`.
  - **Verify:** App renders with empty slots for sidebars.

### Phase 2: Left Sidebar Overhaul (P2)

- [ ] **[Task-2.1] Layer Filters Component**
  - **Input:** `filters` state.
  - **Action:** Create prominent toggle switches. Move to top of hierarchy.
  - **Output:** `SidebarLeft.tsx` with top section.
  - **Verify:** Toggles control map layers correctly.

- [ ] **[Task-2.2] System Status Widget**
  - **Input:** `trackCounts`.
  - **Action:** Create tabbed panel (`Overview` | `Stats`). Implement simple CSS-based bar charts for counts.
  - **Output:** `components/widgets/SystemStatus.tsx`.
  - **Verify:** Tabs switch content; bars reflect data.

- [ ] **[Task-2.3] Intel Feed Refactor**
  - **Input:** `events` array.
  - **Action:** Encapsulate feed in `IntelFeed.tsx`. Add specialized scrollbar styling and "New/Alert" filter header.
  - **Output:** Scrollable feed component.
  - **Verify:** Feed scrolls independently of sidebar.

### Phase 3: Right Sidebar & Details (P2)

- [ ] **[Task-3.1] Compass Widget**
  - **Input:** `course` (degrees).
  - **Action:** Build SVG compass. Rotate needle based on prop.
  - **Output:** `components/widgets/Compass.tsx`.
  - **Verify:** Needle points correctly for 0, 90, 180, 270.

- [ ] **[Task-3.2] Details Panel Restructuring**
  - **Input:** `DetailsSidebar.tsx`
  - **Action:** Rename to `SidebarRight.tsx`. Implement new grouping (Target, Position, Kinematics). Add "Center Map" button.
  - **Output:** Reorganized sidebar.
  - **Verify:** Structure matches `ui-update.md`.

### Phase 4: Map Enhancements (P3)

- [ ] **[Task-4.1] Glassmorphism Tooltip**
  - **Input:** `TacticalMap.tsx` hover logic.
  - **Action:** Extract tooltip JSX to `MapTooltip.tsx`. Apply backdrop-blur and green border styling.
  - **Output:** Modern tooltip.
  - **Verify:** Tooltip is legible over map.

- [ ] **[Task-4.2] Point Clustering**
  - **Input:** `TacticalMap.tsx` / `deck.gl`
  - **Action:** Research best clustering approach for current Entity map (IconLayer vs GeoJsonLayer). Implement basic distance-based clustering.
  - **Output:** Clustered points at zoom < 10.
  - **Verify:** Points merge into count circles when zoomed out.

## 6. Phase X: Verification

- [ ] **Lint Check:** `npm run lint`
- [ ] **Build Check:** `npm run build`
- [ ] **Visual Audit:** Compare result with `ui-update.md` requirements.
- [ ] **Ref Check:** Ensure no console errors during map interaction.
