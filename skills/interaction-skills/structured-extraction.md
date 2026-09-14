---
name: structured-extraction
description: Schema-driven tabular and list data extraction with automated pagination, adapted from Stagehand and Skyvern.
version: 1.0.0
---

# Structured Extraction Skill

## Architectural Concept
Autonomous agents frequently need to extract collections of records from web pages (e.g. hackathon problem statements, e-commerce products, search results, or GitHub issues). Rather than dumping raw HTML or asking the VLM to copy-paste unstructured text, the `structured-extraction` skill executes client-side schema extraction with automated multi-page pagination.

---

## 1. Core Primitives

### A. Table Detection & Header Normalization
- Automatically maps `<table>`, `<thead>`, and `<tbody>` elements into structured JavaScript dictionaries.
- Strips trailing whitespace, sorts columns, and cleans up nested button text.
- Fallback for CSS Grid / Flexbox list containers (`[role="table"]`, `[role="row"]`, `.card-list`, `.results-container`).

### B. Declarative Record Schemas
Extracts fields mapped to strongly typed primitives:
```typescript
interface ExtractedProblemStatement {
  id: string;              // e.g. "SIH171"
  title: string;           // e.g. "Automated Payload Telemetry Decoder"
  organization: string;    // e.g. "ISRO"
  category: 'Software' | 'Hardware';
  domainBucket: string;    // e.g. "Space Technology"
  detailsUrl?: string;     // Clickable detail modal or link
}
```

### C. Multi-Page Pagination Loop
1. Extract current page records.
2. Locate the "Next" pagination button (`.pagination .next`, `button:has-text("Next")`, `[aria-label="Next page"]`, `a.page-link:contains("›")`).
3. If next button is enabled and not disabled:
   - Click next button.
   - Await DOM settling (`table tbody tr` updated or network idle).
   - Re-extract and concatenate records.
4. If next button is disabled or target count reached, terminate and output structured JSON.

---

## 2. Framework Compatibility
- **ASP.NET DataTables** (SIH Portal): Listens for `draw.dt` event or table row replace before advancing.
- **React / Next.js Infinite Scroll**: Triggers directional scroll down until sentinel footer ceases emitting new nodes.
- **Angular / PrimeNG**: Resolves virtual scroll viewports by caching unique primary keys (`id` or title).
