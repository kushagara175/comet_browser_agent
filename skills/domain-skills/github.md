# Domain Skill: GitHub (`github.com`)

## Overview
Domain playbook for navigating repositories, pull requests, issues, and code search on GitHub.

## Routes
- Sign In: `/login`
- Global Search: `/search`
- Trending Repositories: `/trending`
- Pull Requests: `/pulls`
- Issues: `/issues`
- User Dashboard: `/`

## Key Landmarks
- `Type / to search`: Global search bar input (`id="search_github"`)
- `New`: Button for repository creation (`id="new_repo"`)
- `Star` / `Unstar`: Repository star toggle button
- `Fork`: Repository fork button
- `Pull requests`: Repository tab
- `Issues`: Repository issues tab

## Metrics
- `stars`: Repository star count (`\b\d+(?:\.\d+)?[kKmM]?\b`)
- `forks`: Repository fork count (`\b\d+(?:\.\d+)?[kKmM]?\b`)
- `open_issues`: Number of open issues (`\b\d+(?:,\d+)*\b`)
