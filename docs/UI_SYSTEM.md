# CTX Quiz — UI Design System

A deep neumorphic, minimalistic, and tactile design system. Elements appear physically extruded from or pressed into the surface — not flat with shadows, but truly 3D and tactile.

---

## Neumorphism

### Core Principle

Every interactive element has a physical presence. Buttons are raised knobs you press down. Inputs are carved grooves. Cards float above the surface.

### Shadow Definitions

```css
/* Raised (default state) */
--neu-raised:    8px 8px 16px var(--shadow-dark), -8px -8px 16px var(--shadow-light);

/* Deeply raised (cards, containers) */
--neu-raised-lg: 12px 12px 24px var(--shadow-dark), -12px -12px 24px var(--shadow-light);

/* Subtle raise (buttons, small elements) */
--neu-raised-sm: 4px 4px 8px var(--shadow-dark), -4px -4px 8px var(--shadow-light);

/* Pressed/inset (active state) */
--neu-pressed:    inset 4px 4px 8px var(--shadow-dark), inset -4px -4px 8px var(--shadow-light);
--neu-pressed-sm: inset 2px 2px 4px var(--shadow-dark), inset -2px -2px 4px var(--shadow-light);
```

### Tailwind Utility Classes

| Class            | Effect                          |
| ---------------- | ------------------------------- |
| `.neu-raised`    | Standard raised element         |
| `.neu-raised-lg` | Deeply raised (cards)           |
| `.neu-raised-sm` | Subtle raise (small elements)   |
| `.neu-pressed`   | Inset/pressed (active, inputs)  |
| `.neu-pressed-sm`| Subtle inset                    |
| `.neu-surface`   | Elevated card surface           |
| `.neu-flat`      | Flat (hover transition target)  |

### Border Radius

| Token          | Value    | Usage                              |
| -------------- | -------- | ---------------------------------- |
| `--radius-sm`  | `8px`    | Small buttons, tags                |
| `--radius-md`  | `12px`   | Cards, inputs                      |
| `--radius-lg`  | `16px`   | Large cards, modals                |
| `--radius-xl`  | `24px`   | Hero sections                      |
| `--radius-full`| `9999px` | Circular (timer dial, avatars)     |

---

## Component Patterns

### Buttons

- **Primary:** Raised neumorphic with primary color tint
- **Secondary:** Raised neumorphic, neutral
- **Ghost:** Flat with subtle border, hover raises
- **Pressed state:** Inset shadow (physically pressed)
- **Min touch target:** 44px height for mobile
- **Disabled:** 50% opacity, `cursor-not-allowed`

```html
<!-- Base button classes -->
<button class="btn-base neu-raised-sm rounded-md px-6 py-3 font-medium">
  Click me
</button>
```

### Cards

- Deeply raised from surface (`.neu-raised-lg`)
- Generous padding (24px+)
- Subtle inner glow on hover
- `rounded-lg` to `rounded-xl`

```html
<div class="card">Content</div>      <!-- Standard -->
<div class="card-lg">Content</div>   <!-- Large -->
```

### Inputs

- Inset/pressed appearance (`.neu-pressed`)
- Focus: subtle glow ring in primary color
- Large touch targets on mobile
- 16px minimum font size (prevents iOS zoom)

```html
<input class="input-base" placeholder="Type here..." />
```

### Answer Options (Quiz-Specific)

- Large raised buttons, full width on mobile
- Clear A/B/C/D indicators
- Selected: pressed inset + primary color
- Correct: success color transition + bounce
- Incorrect: error color + subtle shake

### Timer/Clock

- Circular dial with raised bezel
- Analog clock hands for visual appeal
- Digital readout below
- Pulsing glow at 10s, urgent shake at 5s

---

## Animation System

### Principles

1. Subtle but purposeful — every animation serves a function
2. Physics-based — spring animations, natural easing
3. 60fps minimum — GPU-accelerated transforms only
4. Respect `prefers-reduced-motion`

### Timing Tokens

| Token               | Duration | Usage                |
| ------------------- | -------- | -------------------- |
| `--duration-instant` | 100ms   | Micro-interactions   |
| `--duration-fast`    | 200ms   | Button states        |
| `--duration-normal`  | 300ms   | Page transitions     |
| `--duration-slow`    | 500ms   | Complex animations   |
| `--duration-slower`  | 800ms   | Dramatic reveals     |

### Easing Curves

| Token              | Value                              | Usage             |
| ------------------ | ---------------------------------- | ----------------- |
| `--ease-out`       | `cubic-bezier(0.0, 0.0, 0.2, 1)`  | Enter animations  |
| `--ease-in`        | `cubic-bezier(0.4, 0.0, 1, 1)`    | Exit animations   |
| `--ease-in-out`    | `cubic-bezier(0.4, 0.0, 0.2, 1)`  | Transitions       |
| `--ease-spring`    | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Bouncy feel     |

### Built-in Animations (Tailwind)

| Class                  | Effect                              |
| ---------------------- | ----------------------------------- |
| `animate-fade-in`      | Fade in (300ms ease-out)            |
| `animate-fade-out`     | Fade out (300ms ease-in)            |
| `animate-slide-up`     | Slide up + fade (300ms)             |
| `animate-slide-down`   | Slide down + fade (300ms)           |
| `animate-scale-in`     | Scale up + fade (200ms)             |
| `animate-scale-out`    | Scale down + fade (200ms)           |
| `animate-bounce-subtle`| Subtle bounce (500ms spring)        |
| `animate-shake`        | Horizontal shake (500ms)            |
| `animate-pulse-slow`   | Slow pulse (3s)                     |
| `animate-spin-slow`    | Slow spin (3s)                      |

### Key Interaction Animations

| Interaction            | Animation                                    |
| ---------------------- | -------------------------------------------- |
| Question transition    | Slide + fade, Typeform-style one-at-a-time   |
| Answer selection       | Press down, color fill from center           |
| Timer countdown        | Smooth rotation, pulse at 10s, shake at 5s   |
| Leaderboard update     | Cards physically shuffle, ranks animate      |
| Score increment        | Number counter rolls up                      |
| Correct answer         | Satisfying bounce + confetti burst           |
| Wrong answer           | Subtle shake + color fade                    |

### Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Responsive Breakpoints

| Name        | Range             | Primary Use              |
| ----------- | ----------------- | ------------------------ |
| Mobile      | 320px – 639px     | Participant app          |
| Tablet      | 640px – 1023px    | Controller panel         |
| Desktop     | 1024px – 1279px   | Admin panel              |
| Large       | 1280px – 1535px   | Full dashboard           |
| Big Screen  | 1536px+           | Projector display        |

### Mobile-First Rules

- Touch targets: minimum 44px (`touch-target` / `touch-target-44`)
- Thumb-friendly bottom navigation
- Full-width buttons
- 16px minimum font size on inputs (prevents iOS zoom)
- Safe area insets for notched devices
- Dynamic viewport height (`100dvh`)

### Mobile Utility Classes

| Class                    | Effect                                |
| ------------------------ | ------------------------------------- |
| `.touch-target`          | Min 44×44px                           |
| `.touch-target-48`       | Min 48×48px                           |
| `.touch-active`          | Scale 0.98 + opacity 0.9 on `:active` |
| `.tap-highlight-none`    | Remove tap highlight                  |
| `.h-screen-mobile`       | `100dvh` (dynamic viewport)           |
| `.safe-area-inset-*`     | Safe area padding (top/bottom/x/y)    |
| `.overscroll-none`       | Prevent pull-to-refresh               |
| `.select-none-touch`     | Prevent text selection on interactive |
| `.text-mobile-body`      | 16px body (prevents iOS zoom)         |
| `.gpu-accelerated`       | `translateZ(0)` + `will-change`       |

### Small Screen Overrides

```css
/* 320px–428px */
.mobile-px-compact  { padding-left: 12px; padding-right: 12px; }
.mobile-py-compact  { padding-top: 12px; padding-bottom: 12px; }
.mobile-gap-compact { gap: 8px; }

/* ≤360px */
.xs-text-sm   { font-size: 14px; }
.xs-px-tight  { padding-left: 8px; padding-right: 8px; }
```

---

## Screen-Specific Guidelines

### Participant App (Mobile-First)

- Single-column layout
- Large touch targets
- Minimal chrome, maximum content
- Bottom-anchored actions
- Offline-capable with queued answers

### Controller Panel (Tablet/Desktop)

- Dashboard layout with sidebar
- Real-time stats prominently displayed
- Quick action buttons always visible
- Preview of Big Screen

### Big Screen (Projector)

- 16:9 optimized, scales to 4:3
- Maximum readability from distance
- Dramatic animations and transitions
- QR code prominent in lobby
- Leaderboard with celebration effects

### Admin Panel (Desktop)

- Full dashboard experience
- Data tables with sorting/filtering
- Form-heavy, needs good UX
- Preview capabilities

---

## Performance Targets

| Metric      | Target   |
| ----------- | -------- |
| LCP         | < 2.5s   |
| FID         | < 100ms  |
| CLS         | < 0.1    |
| Bundle size | < 200KB initial JS |

### Optimization Strategies

- CSS-based neumorphism (no images for shadows)
- GPU-accelerated animations (`transform`, `opacity` only)
- Code splitting per route
- Image optimization (`next/image`, WebP/AVIF)
- Font subsetting
- Lazy loading below-fold content
- CSS containment (`.contain-layout`, `.contain-paint`, `.contain-strict`)

---

## CSS Variables Reference (Quick Copy)

```css
:root {
  /* Colors */
  --primary: #275249;
  --primary-light: #3a7a6d;
  --primary-dark: #1a3832;
  --accent: #6B3093;
  --accent-light: #8a4db8;
  --accent-dark: #4d2269;
  --success: #22C55E;
  --error: #EF4444;
  --warning: #F59E0B;
  --info: #3B82F6;

  /* Surfaces */
  --neu-bg: #E8ECEF;
  --neu-surface: #F0F4F7;
  --shadow-dark: #C8CCD0;
  --shadow-light: #FFFFFF;

  /* Text */
  --text-primary: #1a1d21;
  --text-secondary: #4b5563;
  --text-muted: #9ca3af;

  /* Fonts */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-display: 'Space Grotesk', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Timing */
  --duration-instant: 100ms;
  --duration-fast: 200ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;
  --duration-slower: 800ms;

  /* Easing */
  --ease-out: cubic-bezier(0.0, 0.0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0.0, 1, 1);
  --ease-in-out: cubic-bezier(0.4, 0.0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* Radii */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;
}
```

---

## Tech Stack

| Layer       | Tool                                          |
| ----------- | --------------------------------------------- |
| Framework   | Next.js 14 (App Router) + React 18            |
| Language    | TypeScript (strict)                            |
| Styling     | Tailwind CSS + CSS Variables                   |
| Primitives  | Radix UI / shadcn/ui (heavily customized)      |
| Animation   | Framer Motion (gestures, layout, transitions)  |
| Motion GFX  | Remotion (Big Screen video-like effects)       |
| 3D (opt.)   | React Three Fiber, Lottie                      |
