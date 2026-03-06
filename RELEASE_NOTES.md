# Release - v0.18.1 - Sovereign Glass Update

Sovereign Watch v0.18.1 is a dedicated UI and aesthetic refinement release. We've taken the "Sovereign Glass" design language introduced in the Orbital mode and applied it universally across the entire Tactical HUD. Expect tighter padding, refined glassmorphism, eliminated harsh drop-shadows, and consistently styled tactical map controls.

### Key Features

- **Project Logo & Favicon**: Added a new cyber-tactical eye and globe motif logo to the README and configured a perfectly symmetrical, text-less version as the application favicon.
- **Global Glassmorphism**: Left sidebar widgets, top navigation bars, and historian controls now feature unified blur, border, and shadow properties.
- **TopBar Streamlining**: A 10px height reduction gives the Tactical Map more vertical real estate while keeping critical indicators crisp and readable.
- **Unified Map Controls**: Every interactive map control (2D/3D, Globe, Zoom, Rotate, Tilt) on both Tactical and Orbital views now glows perfectly with our signature green and indigo active states.
- **Historian Widget Refit**: Fully integrated into the HUD style guide with perfectly padded pill toggles and drop-shadowed tabular typography.

### Upgrade Instructions

To apply the new UI styles:

```bash
git pull origin main
docker compose build frontend
docker compose up -d frontend
```
