# CTX Quiz Design System & Style Guide

## Overview

This document defines the complete design system for CTX Quiz - a live quiz platform built for conferences and events. The design follows a **deep neumorphic, minimalistic, and tactile** aesthetic inspired by premium physical interfaces.

**App Name:** CTX Quiz  
**Website:** [ctx.works](https://ctx.works)

---

## Brand Colors

### Primary Palette
```
Primary (CTX Teal):     #275249  - Main brand color, used prominently
Primary Light:          #3a7a6d  - Hover states, lighter variants
Primary Dark:           #1a3832  - Pressed states, darker variants
```

### Accent Palette (Use Sparingly)
```
Accent:       #6B3093  - Rare highlights, special emphasis
Accent Light: #8a4db8  - Hover states
Accent Dark:  #4d2269  - Pressed states
```

### Neutral Palette (Neumorphism Base)
```
Light Mode Background:  #E8ECEF  - Main surface color
Light Mode Surface:     #F0F4F7  - Elevated elements
Light Mode Shadow Dark: #C8CCD0  - Bottom-right shadows
Light Mode Shadow Light:#FFFFFF  - Top-left highlights

Dark Mode Background:   #1A1D21  - Main surface color
Dark Mode Surface:      #22262B  - Elevated elements  
Dark Mode Shadow Dark:  #0F1114  - Bottom-right shadows
Dark Mode Shadow Light: #2A2F35  - Top-left highlights
```

### Semantic Colors
```
Success:    #22C55E  - Correct answers, positive feedback
Error:      #EF4444  - Wrong answers, errors
Warning:    #F59E0B  - Warnings, time running low
Info:       #3B82F6  - Information, hints
```

---

## Typography

### Font Family
```css
--font-primary: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--font-display: 'Space Grotesk', sans-serif;  /* For large numbers, timers */
--font-mono: 'JetBrains Mono', monospace;     /* For join codes */
```

### Type Scale
```
Display XL:   72px / 1.0  - Big screen timer, final scores
Display:      48px / 1.1  - Question numbers, leaderboard ranks
Heading 1:    36px / 1.2  - Page titles
Heading 2:    28px / 1.3  - Section headers
Heading 3:    22px / 1.4  - Card titles
Body Large:   18px / 1.5  - Question text
Body:         16px / 1.5  - Default text
Body Small:   14px / 1.5  - Secondary text
Caption:      12px / 1.4  - Labels, timestamps
```

### Font Weights
```
Light:    300  - Subtle labels
Regular:  400  - Body text
Medium:   500  - Emphasis
Semibold: 600  - Headings
Bold:     700  - Strong emphasis, CTAs
```

---

## Neumorphism System

### Core Principle
Elements appear **physically extruded** from or **pressed into** the surface. Not flat with shadows - truly 3D tactile feel.

### Shadow Definitions (Light Mode)
```css
/* Raised element (default state) */
--neu-raised: 
  8px 8px 16px var(--shadow-dark),
  -8px -8px 16px var(--shadow-light);

/* Deeply raised (cards, containers) */
--neu-raised-lg:
  12px 12px 24px var(--shadow-dark),
  -12px -12px 24px var(--shadow-light);

/* Pressed/inset element (active state) */
--neu-pressed:
  inset 4px 4px 8px var(--shadow-dark),
  inset -4px -4px 8px var(--shadow-light);

/* Subtle raise (buttons, small elements) */
--neu-raised-sm:
  4px 4px 8px var(--shadow-dark),
  -4px -4px 8px var(--shadow-light);
```

### Border Radius
```
--radius-sm:   8px   - Small buttons, tags
--radius-md:   12px  - Cards, inputs
--radius-lg:   16px  - Large cards, modals
--radius-xl:   24px  - Hero sections
--radius-full: 9999px - Circular elements (timer dial, avatars)
```

---

## Component Patterns

### Buttons
- **Primary:** Raised neumorphic with primary color tint
- **Secondary:** Raised neumorphic, neutral
- **Ghost:** Flat with subtle border, hover raises
- **Pressed State:** Inset shadow (physically pressed)
- **Min touch target:** 44px height for mobile

### Cards
- Deeply raised from surface
- Generous padding (24px+)
- Subtle inner glow on hover
- Content hierarchy with clear spacing

### Inputs
- Inset/pressed appearance (like carved into surface)
- Focus state: subtle glow ring in primary color
- Large touch targets on mobile

### Timer/Clock
- Circular dial with raised bezel
- Analog clock hands for visual appeal
- Digital readout below
- Pulsing glow as time runs low

### Answer Options
- Large raised buttons (full width on mobile)
- Clear A/B/C/D indicators
- Selected state: pressed inset + primary color
- Correct/incorrect: color transition with subtle animation

---

## Animation Guidelines

### Principles
1. **Subtle but perfect** - Every animation serves a purpose
2. **Physics-based** - Spring animations, natural easing
3. **60fps minimum** - GPU-accelerated transforms only
4. **Reduced motion** - Respect prefers-reduced-motion

### Timing
```
--duration-instant: 100ms  - Micro-interactions
--duration-fast:    200ms  - Button states
--duration-normal:  300ms  - Page transitions
--duration-slow:    500ms  - Complex animations
--duration-slower:  800ms  - Dramatic reveals
```

### Easing
```
--ease-out:    cubic-bezier(0.0, 0.0, 0.2, 1)   - Enter animations
--ease-in:     cubic-bezier(0.4, 0.0, 1, 1)     - Exit animations
--ease-in-out: cubic-bezier(0.4, 0.0, 0.2, 1)   - Transitions
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1) - Bouncy feel
```

### Key Animations
- **Question transition:** Slide + fade, Typeform-style one-at-a-time
- **Answer selection:** Press down, color fill from center
- **Timer countdown:** Smooth rotation, pulse at 10s, urgent shake at 5s
- **Leaderboard update:** Cards physically shuffle, rank numbers animate
- **Score increment:** Number counter rolls up
- **Correct answer:** Satisfying bounce + confetti burst
- **Wrong answer:** Subtle shake + color fade

---

## Responsive Breakpoints

```
Mobile:       320px - 639px   (Primary for participants)
Tablet:       640px - 1023px
Desktop:      1024px - 1279px
Large:        1280px - 1535px
Big Screen:   1536px+         (Projector display)
```

### Mobile-First Approach
- Touch targets minimum 44px
- Thumb-friendly bottom navigation
- Full-width buttons
- Large, readable text
- Swipe gestures where appropriate

---

## Tech Stack for UI

### Core
- **Next.js 14** - App Router, Server Components
- **React 18** - Client components where needed
- **TypeScript** - Strict mode

### Styling
- **Tailwind CSS** - Utility-first, custom neumorphic utilities
- **CSS Variables** - Theme tokens
- **clsx/tailwind-merge** - Conditional classes

### Components
- **shadcn/ui** - Base components (customized heavily)
- **Radix UI** - Accessible primitives
- **Custom neumorphic components** - Built on top

### Animation
- **Framer Motion** - Page transitions, gestures, layout animations
- **Remotion** - Video-like motion graphics (Big Screen)
- **CSS animations** - Simple micro-interactions

### 3D (Optional enhancements)
- **React Three Fiber** - 3D elements if needed
- **Lottie** - Complex vector animations

---

## Branding Requirements

### CTX Quiz Logo Placement
- **Header:** Top-left, links to ctx.works
- **Loading screens:** Centered with animation
- **Footer:** With "Powered by CTX Quiz" text and link to ctx.works

### Event/Conference Theming
When quiz has custom branding:
- Event logo replaces CTX logo in header
- Event colors can override primary palette
- CTX Quiz branding moves to footer
- "Powered by CTX Quiz" always visible

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

## Performance Requirements

### Targets
- **LCP:** < 2.5s
- **FID:** < 100ms
- **CLS:** < 0.1
- **Bundle size:** < 200KB initial JS

### Optimization Strategies
- CSS-based neumorphism (no images for shadows)
- GPU-accelerated animations (transform, opacity)
- Code splitting per route
- Image optimization (next/image, WebP/AVIF)
- Font subsetting
- Lazy loading below-fold content
