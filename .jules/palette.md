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

## 2024-05-24 - Pass Predictor Polish
**Learning:** Icon-only or minimal buttons often lack tactile feedback, making them feel unresponsive.
**Action:** Adding `hover:bg-white/10`, consistent rounding (`rounded`), and `active:scale-95` dramatically improves the micro-interaction of small utility buttons like CSV exports and menu toggles.

## 2024-05-24 - Accessible Accordion Headers with Nested Actions
**Learning:** This app's design system frequently places quick-toggle icon buttons inside accordion headers (like in SystemStatus.tsx). Converting the entire header to a standard `<button>` causes invalid HTML nesting (button inside button) and accessibility tree confusion.
**Action:** Use the "absolute inset button" pattern: Make the header container `relative`. Add an `absolute inset-0 z-0` main `<button>` for the accordion expansion. Place the text and icons in a `relative z-10 pointer-events-none` container, and the nested interactive quick-toggle buttons in a `relative z-20 pointer-events-auto` container to separate click targets semantically and avoid nesting.

## 2025-03-09 - Accessible Custom Form Controls
**Learning:** Custom form controls (like the spin buttons for the coverage radius in the SaveLocationForm) and modal dismiss actions often lack built-in accessibility features found in native inputs. Without `aria-label`s, screen readers cannot identify the purpose of these icon-only buttons. Without explicit `focus-visible` styles, keyboard users cannot see which control is currently focused, breaking the navigation experience.
**Action:** Always ensure that custom form controls and modal dismiss buttons are fully accessible by adding appropriate `aria-label` attributes and `focus-visible:ring-* outline-none` classes, ensuring they can be confidently used by everyone.

## 2025-03-09 - Accessible Loading and Empty States in Widgets
**Learning:** High-density tactical widgets often fetch data asynchronously, resulting in temporary empty or loading states. If these states only rely on visual text (e.g., "Awaiting Satellite Data..."), screen reader users are left unaware of the widget's status or when the content finally arrives. Furthermore, visually empty areas without an icon can feel broken rather than intentional.
**Action:** Always wrap async widget content areas with `aria-live="polite"` and `aria-busy={isLoading}`. When displaying an empty or loading state, pair the descriptive text with a relevant, low-opacity icon (e.g., `<Satellite className="text-white/10" aria-hidden="true" />`) to provide immediate visual confirmation that the state is intentional.

## 2025-03-09 - Preserving Layout when Converting Divs to Semantic Buttons
**Learning:** When converting a non-semantic block element (like a `div`) to an inline-level semantic `<button>` in Tailwind to improve accessibility, the layout flow can unexpectedly break because buttons behave as inline-blocks by default and center their text.
**Action:** Always remember to append utility classes like `w-full` and `text-left` to the new button to safely preserve the original layout and visual block-level flow while benefiting from the semantic markup.

## 2024-05-18 - Tooltip-Only Icons are Insufficient
**Learning:** Found multiple icon-only buttons (like Play/Pause, News Refresh) that relied entirely on the `title` attribute for accessibility. Screen reader users need explicit `aria-label` attributes because `title` is often ignored or inconsistently read by assistive technologies.
**Action:** Always add explicit `aria-label` to icon-only buttons, even if a `title` tooltip is present. Ensure interactive buttons also have visible focus states (`focus-visible:ring-1 ...`) for keyboard users.

## 2024-03-20 - Clear Search Button Accessibility
**Learning:** Icon-only or symbolic clear buttons (`×`) inside search inputs often lack descriptive labels and focus states because they are visually perceived as part of the input.
**Action:** Always add `aria-label`, `title`, and distinct keyboard focus indicators (`focus-visible:ring-1`) to input clear buttons to ensure they are discoverable and actionable by all users.

## 2026-03-28 - Adding ARIA Labels to Delete Preset Button
**Learning:** Found an accessibility issue where an icon-only button used to delete custom presets lacked an `aria-label`. Screen readers would only announce "button" without context. Adding an `aria-label` that dynamically includes the preset's name (e.g., `Delete preset MyPreset`) greatly improves accessibility and provides immediate context to the user.
**Action:** Always ensure that icon-only interactive elements (like the `Trash2` icon) have descriptive `aria-label` attributes, especially when dynamically generated based on list items, to provide clear context for screen reader users.

## 2024-03-29 - Missing ARIA label on mute button
**Learning:** Found a missing `aria-label` on the audio volume toggle button in `ListeningPost.tsx`. Icon-only buttons handling critical state changes (like muting audio) are particularly important targets for screen reader accessibility to avoid silent states.
**Action:** Always verify icon-only interactive controls (like mute buttons) have state-descriptive `aria-label` and `title` attributes.

## 2024-05-15 - UserManagementPanel Select Accessibility
**Learning:** Dense lists with inline controls (like a dropdown to select a user's role) often lack visual space for a `<label>` element. Without a label, screen readers announce "combo box" without context, confusing the user about whose role they are modifying.
**Action:** When a `<select>` or similar input lacks a corresponding explicit `<label>`, always inject a dynamic `aria-label` (e.g., `aria-label={"Role for user " + username}`) to provide exact contextual identity to assistive technologies.

## 2024-03-31 - Focus-visible and opacity logic for nested actions
**Learning:** Actions that are visually hidden behind a `group-hover` (e.g. `opacity-0 group-hover:opacity-100`) become inaccessible via keyboard because the nested actions lack focus states. While hovering exposes them, tabbing does not automatically reveal them since `focus-visible` needs to trigger opacity.
**Action:** When nesting hidden interactive elements using `group-hover:opacity-100`, also apply `group-focus-within:opacity-100` to the container or `focus-visible:opacity-100` directly on the actionable element to ensure keyboard users can tab into them and make them visible.

## 2026-04-04 - Explicit Form Label Association
**Learning:** Found several forms in the UI where `<label>` elements lacked `htmlFor` attributes and their corresponding inputs/selects lacked `id` attributes. While visually clear, this breaks screen reader association and click-to-focus functionality, reducing accessibility and UX quality.
**Action:** When building or auditing forms, always ensure every label explicitly targets its input using matching `htmlFor` and `id` attributes, even if they appear visually adjacent.

## 2026-04-07 - [ARIA State Anti-pattern on Toggle Buttons]
**Learning:** For accessibility on icon-only toggle buttons, use `aria-pressed` or `aria-expanded` to indicate state alongside a static `aria-label` (e.g., 'Toggle Terminal'). Dynamically changing the `aria-label` when these state attributes are present is an anti-pattern as screen readers already announce the state. Only use dynamic `aria-label`s when state attributes like `aria-pressed` are not applicable (e.g., a 'Copy' button changing to 'Copied'). Dynamic `title` attributes remain useful for visual hover feedback.
**Action:** Avoid combining dynamic `aria-label`s with `aria-pressed` / `aria-expanded`. Verify state handling logic before altering labels.

## 2024-04-14 - User Menu Close Button Accessibility
**Learning:** Icon-only close buttons in dynamic popovers like the `UserMenuWidget` must include descriptive `aria-label` attributes to ensure screen reader users understand their function, along with distinct keyboard focus indicators (`focus-visible:ring-*`) to maintain visibility for keyboard navigation.
**Action:** Always check interactive elements (especially `<button>` with only SVG/Icon children) within custom UI panels to ensure they have an `aria-label` and `focus-visible` classes matching the application's design system.

## 2026-04-15 - Explicit Label Associations
**Learning:** In LinkageAuditView, inputs were nested inside `<label>` tags without `htmlFor` or `id` attributes. While technically valid HTML (implicit labeling), it can be fragile with some assistive technologies and fails strict accessibility audits. Explicitly linking labels using `htmlFor` matching the input's `id` provides a more robust and predictable experience for screen readers without altering the visual design.
**Action:** Always prefer explicit labeling (`htmlFor` + `id`) over implicit labeling (nesting) for forms, even when building rapid internal tools.

## 2025-02-23 - Form Accessibility (htmlFor and id)
**Learning:** Found instances where `<label>` elements were missing the `htmlFor` attribute and their corresponding `<input>` elements were missing `id` attributes. This breaks the semantic association required by screen readers and removes the click-to-focus functionality.
**Action:** When creating or modifying forms, always ensure that every `<label>` has an `htmlFor` attribute that exactly matches the `id` of its corresponding input field.

## 2024-05-18 - Missing ARIA Labels on Icon-Only Close Buttons
**Learning:** Found that custom `Close` buttons (like `<X />` icons) in application popovers or overlay widgets (like System Health and System Settings) frequently omit explicit `aria-label` and `title` attributes if they were implemented without using a standard accessible `Dialog` component.
**Action:** When auditing custom overlays and widgets, explicitly check the structural controls (like 'close', 'minimize', or 'refresh' icon buttons) for `aria-label` attributes to ensure they are accessible to screen readers.

## 2025-03-09 - Accessible Static ARIA Labels with Dynamic States
**Learning:** For accessibility on icon-only toggle buttons, use `aria-pressed` or `aria-expanded` to indicate state alongside a static `aria-label` (e.g., 'Toggle Terminal'). Dynamically changing the `aria-label` when these state attributes are present is an anti-pattern as screen readers already announce the state. Only use dynamic `aria-label`s when state attributes like `aria-pressed` are not applicable (e.g., a 'Copy' button changing to 'Copied'). Dynamic `title` attributes remain useful for visual hover feedback.
**Action:** Avoid combining dynamic `aria-label`s with `aria-pressed` / `aria-expanded`. Ensure toggle buttons have a consistent, descriptive string for their aria-label, delegating state expression to the proper ARIA attributes.

## 2026-04-25 - Dynamic ARIA Labels for State-Dependent Actions
**Learning:** Found that Connect/Disconnect action buttons in JS8Widget.tsx lacked `aria-label` attributes and rendered a lock icon when disabled due to authorization limits. Without dynamic labels, screen readers miss both the intended action and the reason for its unavailability.
**Action:** When implementing buttons with complex state (e.g., authorization-locked vs active), always dynamically construct the `aria-label` to include both the specific target (e.g., `node.host`) and the state context (e.g., `Locked: Connect to...`) so assistive technologies can convey the full meaning without relying on visual icons.

## 2025-04-24 - Interactive Element Keyboard Accessibility
**Learning:** Found multiple interactive `<button>` elements in user-facing components (`UserManagementPanel`, `UserMenuWidget`) that lacked keyboard focus indicators. This makes navigation via keyboard difficult for users relying on alternative inputs.
**Action:** When creating or maintaining new buttons, always append `focus-visible:ring-1 focus-visible:ring-[color] outline-none` to ensure standard keyboard accessibility across the UI.
