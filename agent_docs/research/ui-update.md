UI Layout Improvements for "SOVEREIGN WATCH // NODE-01"
Overview
This document outlines layout and structural changes intended to improve the usability, visual hierarchy, and data clarity of the current dashboard interface. The goal is to make the dense information more digestible for the operator without losing the established aesthetic.

1. Left Sidebar: Data & Controls Refinement
   The current left sidebar is cluttered with repetitive headings and widgets. The goal is to consolidate and organize this information.

Action Items:
Consolidate "TRACK SUMMARY" Widgets:

Current State: There are three separate "TRACK SUMMARY" sections with different chart types (progress bar, bar chart, toggle switches).

Change: Combine these into a single, cohesive "SYSTEM STATUS & SUMMARY" panel.

Implementation: Use a tabbed interface (e.g., [ OVERVIEW ] [ HISTORY ] [ CONTROLS ]) or collapsible accordion sections to house the different visualizations. This saves vertical space and groups related data.

Reposition & Enhance "LAYER FILTERS":

Current State: Filters are at the bottom and relatively small.

Change: Move the "LAYER FILTERS" section to the top of the sidebar, just below the main title.

Implementation: Make the toggles larger and more prominent. Group them logically (e.g., "Entity Type", "Status"). This ensures global controls are always accessible.

Streamline "INTELLIGENCE FEED":

Current State: The feed takes up a significant portion of the space.

Change: Keep the feed but ensure it has a fixed max-height with an internal scrollbar. Add a small header with filter icons (e.g., filter by alert type) to make it more functional.

2. Right Sidebar: Details Panel Hierarchy
   The right sidebar contains critical information but lacks a strong visual hierarchy, making it difficult to scan quickly.

Action Items:
Establish Clear Information Architecture:

Current State: Data is listed sequentially with minimal grouping.

Change: Introduce distinct sections with clear headers to categorize the data.

Recommended Structure:

TARGET IDENTIFICATION (Name, ID, Status)

POSITIONAL DATA (Latitude, Longitude, etc.)

KINEMATICS (Speed, Heading, Course)

METADATA (Last Update, Source, etc.)

Improve Data Presentation:

Change: Use a clear Label: Value two-column grid layout for data points.

Implementation: Increase the font size and weight of critical values (e.g., Coordinates, Speed) to make them stand out. Use a slightly dimmer color for labels.

Integrate Compass Visualization:

Current State: The compass is isolated at the bottom.

Change: Move the Compass Widget directly below the new "KINEMATICS" section.

Implementation: This creates a direct visual link between the numerical heading/speed data and its graphical representation.

Reposition Actions:

Current State: "RAW PAYLOAD" is a button at the bottom.

Change: Place primary actions (like "Center on Map" or "Detailed Report") at the top near the target identity. Keep "RAW PAYLOAD" at the bottom but make it a full-width, distinct button to signify it opens a separate view.

3. Main Content Area: Map & Interaction Enhancements
   The map is the central focus, but data presentation on it can be improved for better readability.

Action Items:
Redesign Map Tooltips:

Current State: The tooltip is a solid, dark block that obscures the map and has poor internal contrast.

Change: Create a more modern, semi-transparent tooltip.

Implementation: Use a dark, frosted-glass background with a bright green border. Organize the content inside with clear labels and values, similar to the right sidebar improvements. Ensure it doesn't block the point it's describing.

Implement Point Clustering:

Current State: In dense areas (like the city center), points overlap and become indistinguishable.

Change: Implement a clustering algorithm.

Implementation: Replace closely grouped points with a single cluster icon (e.g., a larger circle with a number inside indicating the count of items). Clicking the cluster should either zoom in to reveal individual points or open a summary list.

4. General Styling & Consistency
   Standardize Spacing: Define and apply a consistent grid system for padding and margins across all sidebars and widgets to create a sense of order.

Typography Hierarchy: Create a strict type scale for H1, H2, H3, labels, and data values. Ensure this scale is applied consistently throughout the UI.

Color Palette refinement: While maintaining the core green-on-black theme, introduce slightly different shades of green or a subtle secondary color (e.g., a muted cyan) to differentiate between static labels, dynamic data, and interactive elements (buttons, toggles).
