# Issue

The `/test` endpoint page (`GdeltLinkageReviewView`) was not scrollable because the global `body` tag in `index.css` has `overflow-hidden` to support the fullscreen tactical map layout, but the view container itself used `min-h-screen` without an explicit scroll definition, causing overflow content to be clipped.

# Solution

Updated the root container of `GdeltLinkageReviewView` to explicitly use `h-screen` and `overflow-y-auto`. Additionally, applied the `custom-scrollbar` class to match the tactical dark mode styling.

# Changes

* `frontend/src/components/views/GdeltLinkageReviewView.tsx`: Changed `min-h-screen` to `h-screen overflow-y-auto custom-scrollbar` on the root container div.

# Verification

- Confirmed component syntax and structure.
- The change uses standard Tailwind classes that are already prevalent in the application.

# Benefits

Operators and admins can now successfully scroll down to see the full comparison tables on the GDELT Linkage Review test surface.
