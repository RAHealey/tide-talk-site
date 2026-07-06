# Tide Talk — "The Terrace" Ghost theme

A bold, supporters'-culture Ghost theme for **[Tide Talk](https://tidetalkri.com)**, independent Rhode Island FC coverage — content by fans, for fans.

Gig-poster energy: a scrolling scarf-stripe ticker, screen-print texture, heavy stencil headlines, hard drop-shadows, and the Tide Talk navy / tide-blue / gold palette. Built mobile-first (the nav collapses to a hamburger menu).

## Templates

| File | Used for |
| --- | --- |
| `default.hbs` | Base layout (ticker, masthead, footer) |
| `index.hbs` | Homepage — hero, story strip, "The Latest", podcast strip, newsletter |
| `post.hbs` | Article / match report — feature image, prose, tags, author box, comments, related |
| `page.hbs` | Static pages (About, RIFC 101, …) |
| `tag.hbs` / `author.hbs` | Section & writer archives (card grid + pagination) |
| `custom-podcast.hbs` | Podcast page — assign a Page to the **Podcast** template in the editor |
| `partials/` | `header`, `navigation`, `ticker`, `footer`, `newsletter`, `post-card`, `pagination` |

## Setup notes

- **Navigation** is driven by Ghost admin → **Settings → Navigation**. Suggested: Blog, Podcast, About, RIFC 101, Offseason Tracker, Store.
- **Podcast:** tag episodes with the tag slug `podcast` — the homepage strip and the podcast page pull from `tag:podcast`. Create a Page, set its URL to `/podcast/`, and choose the **Podcast** template.
- **Newsletter:** `partials/newsletter.hbs` renders the "Join the Tide" block. If Ghost members are enabled it uses the native Portal; otherwise **paste your Beehiiv embed** where the placeholder form is marked.
- **Sections in the footer** link to `/tag/player-ratings/`, `/tag/rifc-101/`, `/tag/offseason-tracker/` — make sure those tag slugs exist.
- **Fonts:** Libre Franklin + EB Garamond are loaded from Google Fonts in `assets/css/screen.css`. To self-host, drop the `.woff2` files in `assets/fonts/` and swap the `@import` for `@font-face` rules.
- **Brand marks** live in `assets/images/` (`crest.png`, `wordmark.png`, `wordmark-white.png`).

## Local development

```bash
# with the Ghost CLI and a local install
ghost install local
# symlink this theme into content/themes/ and restart, then validate:
npx gscan .
```

## Deploy

Zip the theme and upload via **Settings → Design → Change theme → Upload**, or wire up the official [`TryGhost/action-deploy-theme`](https://github.com/TryGhost/action-deploy-theme) GitHub Action to deploy on push to `main`.

## License

Released under the [MIT License](LICENSE).
