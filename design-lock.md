# BAAKI — Design Lock

> **This document locks the visual design for Phase 1.**
> Changing fonts, colors, layout or imagery requires explicit approval.

---

## Approved Screenshots

| Screen | Reference |
|--------|-----------|
| Landing page | Screenshot 2 (light background, left content + right poster) |
| Auth page | Screenshot 1 (compact form left, same poster right) |

---

## Typography

| Role | Family | Weights | Usage |
|------|--------|---------|-------|
| Editorial headings | Frank Ruhl Libre | 700 | `KNOW YOUR CASH…` headline on landing page |
| Interface / body | Inter | 400, 500, 600 | Labels, body copy, buttons, form fields |
| BAAKI wordmark | Inter 700 (letter-spaced) | 700 | Brand name next to rupee logo |
| Decorative | Wanaraseta | Regular | Available as `--font-wordmark`; use sparingly where stylistically appropriate |

---

## Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--color-bg` | `#fafaf8` | Page background (warm white) |
| `--color-text-primary` | `#0f0f0f` | Headlines, primary text |
| `--color-text-secondary` | `#4a4a4a` | Body copy, labels |
| `--color-text-muted` | `#888888` | Placeholders, footer text |
| `--color-accent-green` | `#2d7a2d` | Brand green — CTA, active states, resource planning tag |
| `--color-accent-green-light` | `#3a9a3a` | Hover state for green elements |
| `--color-accent-green-subtle` | `#e8f5e8` | Subtle green background |
| `--color-border` | `#e2e2dc` | Feature-list dividers |
| `--color-border-input` | `#d0d0ca` | Form field borders |
| `--color-black` | `#0f0f0f` | GET STARTED button background |
| `--color-error` | `#c0392b` | Validation error text |

---

## Layout

- **Grid**: Two-column, `1fr 1fr`, centered vertically, full viewport height.
- **Left column padding**: `48px 40px 48px 60px` (desktop).
- **Poster padding**: `var(--space-6)` on all sides, right panel only.
- **Poster radius**: `18px` rounded corners.

---

## Assets — Locked

| Asset | Path | Rule |
|-------|------|------|
| Rupee logo | `/assets/brand/rupee_logo.png` | **Never substitute or redraw.** |
| Opening poster | `/assets/illustrations/Opening.png` | **Display as-is. No overlays, cropping beyond CSS border-radius, or background use.** |
| Wanaraseta | `/assets/fonts/wanaraseta/WANARASETA.*` | Load via `@font-face`. Do not use for body text. |

---

## What Is Locked

- White warm-white background only.
- Black editorial headline font (Frank Ruhl Libre 700).
- Green accent `#2d7a2d` for brand elements only.
- Thin `1px` grey dividers between feature rows.
- Minimal two-column layout — no cards, no shadows, no gradients on page bg.
- Compact form fields — no extra fields, no social login providers.
- `GET STARTED` → navigates to `/auth`.

## What Is Forbidden

- Full-page background images.
- Generic SaaS dashboard templates.
- Social login buttons (Google, GitHub, etc.) unless explicitly added.
- Fake/mocked authentication responses.
- Service-role keys in frontend code.
- Redesigning or redrawing any supplied image or logo.
