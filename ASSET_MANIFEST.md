# BAAKI — Asset Manifest

Generated: 2026-10-25

---

## Source Assets (in `/Assets/`)

| File | Size | Status |
|------|------|--------|
| `baaki_rupee_coin_transparent.png` | 21.9 KB | ✅ Present |
| `In This Economy, You're Not Productive_.png` | 2.97 MB | ✅ Present |
| `wanaraseta.zip` | 57.5 KB | ✅ Present |
| `Alan_Sans.zip` | — | ❌ **Missing** |
| `Frank_Ruhl_Libre.zip` | — | ❌ **Missing** |

---

## Extracted Fonts (from `wanaraseta.zip`)

| File | Format | Family Name | Weight | Destination |
|------|--------|-------------|--------|-------------|
| `WANARASETA.otf` | OpenType | Wanaraseta | Regular (400) | `public/assets/fonts/wanaraseta/WANARASETA.otf` |
| `WANARASETA.ttf` | TrueType | Wanaraseta | Regular (400) | `public/assets/fonts/wanaraseta/WANARASETA.ttf` |

Also included in archive: `1001fonts-wanaraseta-eula.txt` (license file — not copied to public).

---

## Missing Font Archives — Resolution

`Alan_Sans.zip` and `Frank_Ruhl_Libre.zip` were not found in the Assets folder.

**Resolution applied:**
- **Frank Ruhl Libre** → loaded from Google Fonts CDN (weights 300, 400, 500, 700, 900). Same family, same rendering.
- **Alan Sans** → substituted with **Inter** from Google Fonts CDN (weights 300–700). Inter is a comparable neutral sans-serif used for UI text.

> If/when the original ZIP archives are provided, place them in `/Assets/`, extract them, copy the font files to `public/assets/fonts/alan-sans/` and `public/assets/fonts/frank-ruhl-libre/`, and add `@font-face` declarations in `src/index.css` replacing the Google Fonts CDN link.

---

## Deployed Asset Paths (Frontend `public/`)

```
public/
└── assets/
    ├── brand/
    │   └── rupee_logo.png          ← baaki_rupee_coin_transparent.png
    ├── illustrations/
    │   └── Opening.png             ← In This Economy, You're Not Productive_.png
    └── fonts/
        └── wanaraseta/
            ├── WANARASETA.otf
            └── WANARASETA.ttf
```

---

## Verification Status

| Asset | Source → Destination | Verified |
|-------|----------------------|----------|
| Rupee logo | `Assets/baaki_rupee_coin_transparent.png` → `public/assets/brand/rupee_logo.png` | ✅ Copied |
| Opening poster | `Assets/In This Economy…_.png` → `public/assets/illustrations/Opening.png` | ✅ Copied |
| Wanaraseta OTF | `wanaraseta_extracted/WANARASETA.otf` → `public/assets/fonts/wanaraseta/WANARASETA.otf` | ✅ Copied |
| Wanaraseta TTF | `wanaraseta_extracted/WANARASETA.ttf` → `public/assets/fonts/wanaraseta/WANARASETA.ttf` | ✅ Copied |
| Frank Ruhl Libre | Google Fonts CDN | ✅ Loaded via `<link>` in `index.html` |
| Inter (Alan Sans sub) | Google Fonts CDN | ✅ Loaded via `<link>` in `index.html` |
