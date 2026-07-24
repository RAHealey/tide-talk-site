# Site Search — Design

**Date:** 2026-07-23
**Status:** Approved by Ryan

## Goal

Let readers search tidetalkri.com (597 posts) from the site header.

## Approach

Use Ghost's native **Sodo Search**. Ghost 6 auto-injects the search script via
`{{ghost_head}}` on every page — no backend, config, or third-party service.
Any element with a `data-ghost-search` attribute opens the search modal, which
indexes post titles, excerpts, tags, and authors via the Content API and stays
current automatically.

Rejected alternatives: custom `/search/` page (real build/maintenance cost for
no reader benefit) and third-party index (Pagefind/Algolia — heavyweight for a
fan blog).

## Changes

### 1. `partials/header.hbs`

Add a search button inside the `.rhs` div, **before** the Subscribe stamp:

```hbs
<button class="searchbtn" data-ghost-search aria-label="Search">
    <svg><!-- inline magnifier icon --></svg>
</button>
```

Inline SVG magnifier — not an emoji — so the icon renders identically on all
platforms and fits the Terrace aesthetic.

### 2. `assets/css/screen.css`

Style `.searchbtn`:

- Transparent button, no border; brand light-blue icon (`#5fb2e2`) on the navy
  masthead, hover to gold (`#fbad18`).
- Sized/aligned with the ✉ Subscribe stamp in the `.rhs` row.
- Visible on desktop **and** mobile (outside the hamburger, like Subscribe).

## Deploy

Same pipeline as prior theme deploys: branch → PR → zip named exactly
`tide-talk.zip` → `POST /ghost/api/admin/themes/upload/` → activate.

## Verification

On the live site: click the icon → Sodo modal opens → searching
"player ratings" returns posts. Check desktop and mobile widths.

## Out of scope

- Styling the modal interior (Ghost-controlled).
- Full post-body text search (Sodo indexes titles/excerpts/tags/authors only).
