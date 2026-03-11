## 2024-05-15 - [ARIA State Attributes for Icon Toggles]
**Learning:** Icon-only toggle buttons (like those used for map layers and filters) provide zero context to screen readers about their current state (on/off, expanded/collapsed) unless explicitly told. `aria-pressed` is crucial for binary toggle buttons (like "Show Air"), while `aria-expanded` is essential for buttons that reveal additional content (like "Show Filters"). Relying solely on visual changes (like text color or background) leaves visually impaired users guessing.
**Action:** Always include `aria-label`, and pair it with `aria-pressed={boolean}` for stateful toggles or `aria-expanded={boolean}` for disclosure buttons. Add `focus-visible:ring-*` to ensure keyboard navigation is visibly obvious.
## 2024-03-22 - Added ARIA labels and focus styles to close buttons
**Learning:** Icon-only close buttons in the sidebar lacked accessibility attributes and focus indicators, making them difficult for screen reader users to understand and keyboard users to navigate. Applying the `focus-visible:ring-1 focus-visible:ring-hud-green outline-none` classes ensures consistent, high-visibility keyboard focus matching the tactical theme.
**Action:** Always add `aria-label` and `title` to icon-only buttons, and use `focus-visible` utility classes to provide clear keyboard focus states without disrupting pointer interactions.

## 2025-03-05 - Interactive List Items Hiding Actions
**Learning:** Found a pattern where interactive lists (like the saved missions list in `MissionNavigator.tsx`) use `div` elements with `onClick` handlers and hide supplementary actions (like delete) behind CSS `group-hover`. This is inaccessible to keyboard navigation and screen readers because `div`s aren't natively focusable, and hover states don't trigger on keyboard focus by default.
**Action:** Always refactor interactive list items to use semantic `<button>` elements. Ensure secondary actions within a list item have an explicit `aria-label` and use `focus-visible:opacity-100` alongside `group-hover:opacity-100` so that keyboard users can discover and access them when tabbing through the interface.

## 2025-03-06 - Accessible Clipboard Actions in High-Density Views
**Learning:** In high-density widgets like `PayloadInspector` where raw hex dumps or JSON are displayed, users frequently need to extract the data for external analysis. While a copy function might exist in code, failing to render a distinct, accessible button forces manual text selection, which is poor UX. Furthermore, clipboard actions need clear, immediate visual feedback (e.g., swapping a "Copy" icon for a "Check" icon) and must be keyboard-accessible to support power users and assistive technologies.
**Action:** Always verify that intended features like "copy to clipboard" have a visible, keyboard-accessible UI element (`<button>` with `focus-visible`), appropriate ARIA labels (`aria-label`, `title`), and stateful visual feedback upon interaction.
## 2025-03-08 - Added Accessible Tab Pattern to Widgets
**Learning:** Icon-only view tabs in dynamic widgets (like JS8Widget) can be confusing for screen readers if not properly marked up. Adding `role="tablist"` to the container, and `role="tab"`, `aria-selected`, `aria-controls`, `id`, `title`, and `aria-label` to the buttons ensures robust accessibility. Additionally, hiding the inner icon with `aria-hidden="true"` prevents redundant announcements. Keyboard support is crucial via `focus-visible` outline styles.
**Action:** Always apply this comprehensive ARIA pattern to any future icon-only tab groups or segment controls within widgets.

## 2024-03-09 - Ensure Custom Focus Rings Hide Default Outlines
**Learning:** When using custom `focus-visible:ring-1` classes for accessibility styling on buttons and inputs, the default browser focus ring (usually a thick blue outline) often still appears alongside it, looking unpolished.
**Action:** Always pair `focus-visible:ring-1` with `outline-none` so that only the custom focus styling is shown to keyboard users.

## 2025-03-09 - Icon-Only TopBar Toggle Buttons Require Explicit ARIA
**Learning:** Icon-only buttons in global navigation elements (like `TopBar.tsx` view modes and toggle switches) provide visual feedback (e.g., color changes, shadows) but are invisible to screen readers without explicit `aria-label` and `aria-pressed` or `title` attributes. Furthermore, without `focus-visible:ring-*` and `outline-none`, keyboard navigation lacks clear indicators in high-density tactical interfaces.
**Action:** Always ensure that icon-only toggle buttons in navigation bars include `aria-label`, `title`, and stateful attributes like `aria-pressed` or `aria-expanded`. Apply `aria-hidden="true"` to internal SVG icons to prevent redundant announcements, and use consistent `focus-visible:ring-1` styling.
