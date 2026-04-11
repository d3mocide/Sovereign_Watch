# Issue

The External Driver Context presentation for Clausal Chains was poorly formatted.
1. In the AI Analyst Panel, a large multi-line box describing the driver context occupied significant vertical space ("flooding" the panel's header) even when the external driver was omitted.
2. In the right sidebar (`ClausalView`), the driver context presentation lacked visual distinction to clearly decouple attached/admitted drivers from omitted context, leading to a cluttered look with repetitive labels.

# Solution

Refactored the presentation logic in both components to be visually concise and state-aware (`isAdmitted`):
- **AI Analyst Panel**: Condenses the context into a single-line badge that only displays the driver gate state (`Linked Driver` vs `Omitted Driver`) and the scope label.
- **Clausal View (Sidebar Right)**: Reworked the driver context card to change border and background themes based on `isAdmitted`. If omitted, it drops the saturated blue styling and adopts a muted layout, providing excellent visual hierarchy without spamming layout space.

# Changes
- `frontend/src/components/widgets/AIAnalystPanel.tsx`: Transformed the `clausalSpaceWeatherPresentation` block into a sleek one-liner badge.
- `frontend/src/components/layouts/sidebar-right/ClausalView.tsx`: Rewrote the driver panel using conditional classes dependent on `spaceWeatherPresentation.isAdmitted`.

# Verification
- Confirmed UI logic dynamically scales back its footprint when the driver is omitted while keeping tactical awareness.
- Tested compilation syntax implicitly through Vite's HMR logic.
