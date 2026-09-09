# Interaction Skill: Scrolling & Infinite Feeds

## Purpose
Enables directional scrolling (`up`, `down`, `top`, `bottom`) across whole viewports or scrollable sub-containers (e.g. data tables, infinite social media feeds, sidebar navigations).

## Implementation in PrivaPilot
- Controlled via `ActionKind: 'scroll'` with `scrollDirection: 'up' | 'down' | 'top' | 'bottom'`.
- First attempts window/document scroll; falls back to scrolling main scrollable containers (`main, [role="main"], .main-content, #main, .content, .container`) if window scroll does not move the scroll offset.
- Verified using postcondition `{ kind: 'scroll_changed', direction: ... }`.
