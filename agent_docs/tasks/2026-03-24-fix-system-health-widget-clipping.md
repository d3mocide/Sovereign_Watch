Issue: The System Health widget could extend past the bottom of the viewport, causing the last rows to be cut off on shorter displays.

Solution: Constrain the widget with a viewport-aware max height and let the content area flex and scroll within the remaining space below the header.

Changes:
- Updated frontend/src/components/widgets/SystemHealthWidget.tsx to cap the panel at calc(100vh - 88px).
- Changed the widget body to flex within the panel and own the vertical scrolling instead of relying on a fixed 70vh content cap.

Verification:
- Ran frontend lint.
- Ran frontend tests.

Benefits:
- Prevents the bottom of the System Health panel from being clipped.
- Keeps the header visible while preserving access to all health rows via scrolling.