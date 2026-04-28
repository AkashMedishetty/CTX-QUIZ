# CTX Quiz — Brand Guidelines

## Identity

| Field       | Value                                      |
| ----------- | ------------------------------------------ |
| App Name    | **CTX Quiz**                               |
| Tagline     | Real-time synchronized quiz platform       |
| Website     | [ctx.works](https://ctx.works)             |
| Creator     | CTX                                        |

---

## Logo Usage

- **Header:** Top-left, links to ctx.works
- **Loading screens:** Centered with animation
- **Footer:** "Powered by CTX Quiz" with link to ctx.works
- **Favicon:** `/favicon.svg`

### Event/Conference Theming

When a quiz has custom branding:

- Event logo replaces CTX logo in header
- Event colors can override the primary palette
- CTX Quiz branding moves to footer
- "Powered by CTX Quiz" must always be visible

---

## Color Palette

### Primary — CTX Teal

| Token           | Hex       | Usage                          |
| --------------- | --------- | ------------------------------ |
| `primary`       | `#275249` | Main brand color               |
| `primary-light` | `#3a7a6d` | Hover states, lighter variants |
| `primary-dark`  | `#1a3832` | Pressed states, darker variants|

**Extended scale:**

```
50:  #f0f9f7    100: #d9f0eb    200: #b3e1d7
300: #80cbbe    400: #4dab9c    500: #275249
600: #22493f    700: #1d3f36    800: #18352d
900: #132b24
```

### Accent (Use Sparingly)

| Token          | Hex       | Usage                  |
| -------------- | --------- | ---------------------- |
| `accent`       | `#6B3093` | Rare highlights        |
| `accent-light` | `#8a4db8` | Hover states           |
| `accent-dark`  | `#4d2269` | Pressed states         |

**Extended scale:**

```
50:  #f9f5fc    100: #f0e6f7    200: #e0ccef
300: #c9a3e2    400: #a86dcf    500: #6B3093
600: #5c2a7f    700: #4d236b    800: #3e1d57
900: #2f1643
```

### Semantic Colors

| Token     | Hex       | Usage                              |
| --------- | --------- | ---------------------------------- |
| `success` | `#22C55E` | Correct answers, positive feedback |
| `error`   | `#EF4444` | Wrong answers, errors              |
| `warning` | `#F59E0B` | Warnings, time running low         |
| `info`    | `#3B82F6` | Information, hints                 |

Each semantic color has `light` and `dark` variants (see UI System doc).

### Neumorphism Surface Colors

**Light Mode:**

| Token          | Hex       | Role                  |
| -------------- | --------- | --------------------- |
| `neu-bg`       | `#E8ECEF` | Main surface          |
| `neu-surface`  | `#F0F4F7` | Elevated elements     |
| `shadow-dark`  | `#C8CCD0` | Bottom-right shadows  |
| `shadow-light` | `#FFFFFF` | Top-left highlights   |

**Dark Mode:**

| Token          | Hex       | Role                  |
| -------------- | --------- | --------------------- |
| `neu-bg`       | `#1A1D21` | Main surface          |
| `neu-surface`  | `#22262B` | Elevated elements     |
| `shadow-dark`  | `#0F1114` | Bottom-right shadows  |
| `shadow-light` | `#2A2F35` | Top-left highlights   |

### Text Colors

| Token            | Light Mode | Dark Mode |
| ---------------- | ---------- | --------- |
| `text-primary`   | `#1a1d21`  | `#f9fafb` |
| `text-secondary` | `#4b5563`  | `#d1d5db` |
| `text-muted`     | `#9ca3af`  | `#6b7280` |

### Theme Colors (Browser Chrome)

| Scheme | Color     |
| ------ | --------- |
| Light  | `#E8ECEF` |
| Dark   | `#1A1D21` |

---

## Typography

### Font Stack

| Role      | Family                                                  | Usage                        |
| --------- | ------------------------------------------------------- | ---------------------------- |
| Primary   | `Inter, -apple-system, BlinkMacSystemFont, sans-serif`  | Body text, UI                |
| Display   | `Space Grotesk, sans-serif`                             | Large numbers, timers        |
| Monospace | `JetBrains Mono, monospace`                             | Join codes, code             |

### Type Scale

| Token        | Size  | Line Height | Usage                          |
| ------------ | ----- | ----------- | ------------------------------ |
| `display-xl` | 72px  | 1.0         | Big screen timer, final scores |
| `display`    | 48px  | 1.1         | Question numbers, ranks        |
| `h1`         | 36px  | 1.2         | Page titles                    |
| `h2`         | 28px  | 1.3         | Section headers                |
| `h3`         | 22px  | 1.4         | Card titles                    |
| `body-lg`    | 18px  | 1.5         | Question text                  |
| `body`       | 16px  | 1.5         | Default text                   |
| `body-sm`    | 14px  | 1.5         | Secondary text                 |
| `caption`    | 12px  | 1.4         | Labels, timestamps             |

### Font Weights

| Weight   | Value | Usage              |
| -------- | ----- | ------------------ |
| Light    | 300   | Subtle labels      |
| Regular  | 400   | Body text          |
| Medium   | 500   | Emphasis           |
| Semibold | 600   | Headings           |
| Bold     | 700   | Strong emphasis    |

---

## Metadata & SEO

```json
{
  "title": "CTX Quiz",
  "titleTemplate": "%s | CTX Quiz",
  "description": "Real-time synchronized quiz platform for live events",
  "keywords": ["quiz", "live quiz", "real-time", "events", "conference", "game show"],
  "openGraph": {
    "type": "website",
    "locale": "en_US",
    "siteName": "CTX Quiz"
  }
}
```
