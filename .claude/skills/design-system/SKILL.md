---
name: design-system
description: >
  Base UI skill for building consistent, component-based interfaces using shadcn/ui and Tailwind CSS.
  ALWAYS use this skill before writing any React UI, component, page, dashboard, form, or layout —
  even if the user just says "build a button" or "make a settings page". This establishes the
  component vocabulary, token system, and Tailwind conventions that must be consistent across
  all UI work. Load this first, then load a project-specific brand skill if one exists.
---

# Design System Skill — shadcn/ui + Tailwind Baseline

This skill defines the foundational rules for all UI output. Read it fully before writing any component code.

## Core Philosophy

- **Components, not one-offs.** Every UI element must be expressed as a reusable component with clear props.
- **Tokens, not raw values.** Never hardcode colors, font sizes, or spacing. Always use CSS variables or Tailwind scale values.
- **Composability.** Build small, single-responsibility components. Compose them into layouts.
- **Consistency over creativity.** Default to the system. Only deviate when the project brand skill explicitly says so.

---

## 1. Foundational Tokens (CSS Variables)

Always declare these in a `:root` block or in the Tailwind config. A project skill will override these values — but the variable *names* are always the same.

```css
:root {
  /* Brand */
  --color-primary: #2563eb;        /* main action color */
  --color-primary-hover: #1d4ed8;
  --color-secondary: #7c3aed;
  --color-accent: #f59e0b;

  /* Neutrals */
  --color-bg: #ffffff;
  --color-bg-subtle: #f8fafc;
  --color-surface: #ffffff;
  --color-surface-raised: #f1f5f9;
  --color-border: #e2e8f0;
  --color-border-strong: #cbd5e1;

  /* Text */
  --color-text: #0f172a;
  --color-text-muted: #64748b;
  --color-text-subtle: #94a3b8;
  --color-text-inverse: #ffffff;

  /* Semantic */
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-error: #dc2626;
  --color-info: #0284c7;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* Shadow */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.07);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);

  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Spacing scale (mirrors Tailwind) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;
}
```

**Dark mode**: Use a `.dark` class or `prefers-color-scheme` media query. Override only the semantic tokens, never change variable names.

---

## 2. Tailwind Usage Rules

### ✅ Always do
- Use Tailwind's spacing scale (`p-4`, `gap-6`, `mt-8`) — never arbitrary values like `p-[13px]`
- Use semantic color classes tied to your CSS vars: `bg-primary`, `text-muted`, etc. — configure these in `tailwind.config`
- Use `@apply` in component CSS only for repeated utility combinations (>3 uses)
- Use responsive prefixes (`sm:`, `md:`, `lg:`) for layout shifts only — not for micro-tweaks

### ❌ Never do
- Hardcode hex colors anywhere: `text-[#3b82f6]` — use a token
- Use arbitrary spacing: `mt-[22px]` — find the nearest scale value
- Mix Tailwind utility classes with inline `style={}` for the same property
- Use `!important` overrides (`!text-red-500`) — it signals broken component design

### Configuring custom tokens in Tailwind
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        accent: 'var(--color-accent)',
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        border: 'var(--color-border)',
        text: 'var(--color-text)',
        muted: 'var(--color-text-muted)',
        subtle: 'var(--color-text-subtle)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
    },
  },
}
```

---

## 3. Component Vocabulary

Use these component names consistently. When you build one, always accept the props listed.

### Button
Variants: `primary` | `secondary` | `ghost` | `destructive` | `outline`
Sizes: `sm` | `md` | `lg`
States: `loading` | `disabled`

```tsx
<Button variant="primary" size="md" loading={false} disabled={false}>
  Label
</Button>
```

### Input
```tsx
<Input
  label="Email"
  placeholder="you@example.com"
  type="email"
  error="Invalid email"
  hint="We'll never share your email"
/>
```

### Card
```tsx
<Card padding="md" shadow="sm" border>
  <CardHeader title="Title" subtitle="Subtitle" action={<Button />} />
  <CardBody>...</CardBody>
  <CardFooter>...</CardFooter>
</Card>
```

### Badge
Variants: `default` | `success` | `warning` | `error` | `info` | `outline`
```tsx
<Badge variant="success">Active</Badge>
```

### Avatar
```tsx
<Avatar src="..." alt="Name" size="md" fallback="AB" />
```

### Modal / Dialog
```tsx
<Dialog open={isOpen} onClose={close}>
  <DialogHeader title="Confirm" />
  <DialogBody>...</DialogBody>
  <DialogFooter>
    <Button variant="ghost">Cancel</Button>
    <Button variant="primary">Confirm</Button>
  </DialogFooter>
</Dialog>
```

### Toast / Alert
```tsx
<Alert variant="error" title="Error" description="Something went wrong." dismissible />
```

---

## 4. Typography Scale

Always use these classes. Never set raw font sizes.

| Role          | Tailwind class         | Usage                        |
|---------------|------------------------|------------------------------|
| Display       | `text-4xl font-bold`   | Hero headings                |
| H1            | `text-3xl font-bold`   | Page titles                  |
| H2            | `text-2xl font-semibold` | Section headings            |
| H3            | `text-xl font-semibold`  | Card/sub-section headings   |
| H4            | `text-base font-semibold` | Labels, minor headings     |
| Body          | `text-base font-normal`  | Default body text           |
| Body SM       | `text-sm font-normal`    | Supporting text             |
| Caption       | `text-xs text-muted`     | Metadata, timestamps        |
| Code          | `font-mono text-sm`      | Inline code                 |

---

## 5. Layout Patterns

### Page wrapper
```tsx
<div className="min-h-screen bg-bg text-text font-sans">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    {/* content */}
  </div>
</div>
```

### Sidebar layout
```tsx
<div className="flex h-screen overflow-hidden">
  <aside className="w-64 shrink-0 border-r border-border bg-surface">
    {/* nav */}
  </aside>
  <main className="flex-1 overflow-auto p-6">
    {/* content */}
  </main>
</div>
```

### Grid
- Use `grid` + `grid-cols-*` + `gap-*` — never `float` or manual margins for layout
- Prefer 12-column grid for complex layouts: `grid grid-cols-12`
- Use `col-span-*` for asymmetric layouts

### Stack (vertical spacing)
```tsx
<div className="flex flex-col gap-4">...</div>
```

### Cluster (horizontal, wrapping)
```tsx
<div className="flex flex-wrap gap-2">...</div>
```

---

## 6. Interaction & State

Every interactive element must handle these states visually:

| State      | Tailwind pattern                          |
|------------|-------------------------------------------|
| Hover      | `hover:bg-primary-hover hover:opacity-90` |
| Focus      | `focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2` |
| Disabled   | `disabled:opacity-50 disabled:cursor-not-allowed` |
| Loading    | Show spinner, disable pointer events      |
| Error      | `border-error text-error` + error message below input |
| Active     | `active:scale-95 transition-transform`    |

---

## 7. Spacing & Density

Three density modes — pick one per project and stay consistent:

| Mode        | Base spacing | Use for                        |
|-------------|-------------|--------------------------------|
| Compact     | `p-2 gap-2` | Data tables, dashboards        |
| Default     | `p-4 gap-4` | Most apps                      |
| Comfortable | `p-6 gap-6` | Marketing, content-heavy pages |

---

## 8. shadcn/ui Component Usage

When using shadcn/ui components, always:
- Import from `@/components/ui/*`
- Apply your token variables via the `cn()` utility for conditional classes
- Never override shadcn styles with arbitrary values — extend via CSS vars instead

Available shadcn components to prefer over custom builds:
`Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Slider`, `Dialog`, `Sheet`, `Popover`, `Tooltip`, `DropdownMenu`, `NavigationMenu`, `Tabs`, `Accordion`, `Card`, `Badge`, `Avatar`, `Alert`, `Toast`, `Table`, `Calendar`, `DatePicker`, `Command`, `Combobox`, `Progress`, `Skeleton`, `Separator`

---

## 9. File & Component Structure

```
src/
├── components/
│   ├── ui/            ← shadcn/ui base components (never edit directly)
│   ├── primitives/    ← your wrapped/extended versions of ui/ components
│   ├── patterns/      ← composed patterns (e.g. SearchBar, UserMenu)
│   └── layout/        ← page-level layout components (Sidebar, Header)
├── styles/
│   ├── tokens.css     ← all CSS custom properties (:root vars)
│   └── globals.css    ← Tailwind base + global resets
└── lib/
    └── cn.ts          ← className merge utility
```

### The `cn()` utility (always use this)
```ts
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

---

## 10. Project Brand Skill Override

If a project brand skill file exists, load it **after** this skill. It will override:
- CSS variable values (colors, radius, fonts)
- Tailwind config extensions
- Component default variants
- Typography choices

The brand skill will NOT change component names, prop shapes, or structural patterns — those are fixed by this base skill.

See `design-system-project-template/SKILL.md` for how to create a project brand skill.