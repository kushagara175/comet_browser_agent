# Domain Skill: Smart India Hackathon (SIH) Portal (`sih.gov.in`)

## Overview
Domain playbook and interaction knowledge for navigating and querying the Smart India Hackathon portal.

## Routes
- Problem Statements Directory: `/problem-statements` (aliases: `/sih2026PS`, `/sih2025PS`, `/sih2024PS`)
- SPOC Directory: `/know-your-spoc`
- Evaluator / Team Login: `/signin`
- Results: `/results`
- Homepage: `/`

## Key Landmarks
- `Search`: DataTable filter input (`type="search"` or `aria-controls`)
- `Problem Statements`: Nav bar tab and header link
- `Know Your SPOC`: Header link for university / institute SPOC search
- `Login`: Authentication navigation link

## Metric Extraction Rules
- `total_submissions`: Matches `\b\d+(?:,\d+)*\b` anchored near `submissions` or `ideas submitted`
- `total_problem_statements`: Matches `\b\d+\b` anchored near `problem statements` or `active ps`
