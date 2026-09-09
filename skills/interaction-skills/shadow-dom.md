# Interaction Skill: Shadow DOM Traversal

## Purpose
Enables perception and interaction with custom Web Components and embedded widgets that encapsulate their DOM inside open shadow roots (`element.shadowRoot`).

## Implementation in PrivaPilot
- Implemented via `collectOpenShadowRoots` in `@privapilot/protocol/src/agent-helpers.ts` and integrated into `ElementExtractor`.
- Recursively walks DOM trees and inspects any element possessing an open `shadowRoot`.
- Candidate interactive elements inside shadow trees are assigned standard local IDs (`el_X`) with their bounding boxes transformed to main viewport coordinates.
- Actions on shadow DOM elements execute seamlessly using their real element references stored in the ephemeral `elementMap`.
