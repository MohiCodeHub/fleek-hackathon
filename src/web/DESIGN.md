# DESIGN.md — Abhi & Sanket web surface

Design Read: B2B wholesale-vintage marketing landing for resellers/shops. Clean, calm,
minimalist. Personality from type + copy + one signature moment (the WhatsApp conversation
vignette), never from texture or atmosphere.

Mood phrase: "a sharp sourcing broker's desk at 9am — white light, one green phone notification".

Dials: VARIANCE 5 · MOTION 3 · DENSITY 2. Color strategy: **Restrained** (accent <= 10% of surface).

## Tokens (OKLCH, seed-229 hue 350 anchors brand primary)

```css
:root {
  /* surface — pure white per impeccable default A; mood lives in brand colors, not bg */
  --bg: oklch(1 0 0);
  --surface: oklch(0.967 0.004 300); /* bg pulled toward ink; panels, vignette shell */
  --line: oklch(0.912 0.006 300); /* hairline borders */

  /* text */
  --ink: oklch(0.21 0.02 330); /* body/display text, >=7:1 on bg, cool-berry cast */
  --muted: oklch(0.5 0.018 330); /* secondary text, >=3.5:1 on bg */

  /* brand primary — deep berry-rose (seed hue 350), wordmark + tiny echoes ONLY */
  --brand: oklch(0.42 0.163 350);

  /* accent — WhatsApp signal green, CTA fill; white text (H-K rule) */
  --cta: oklch(0.55 0.145 152);
  --cta-hover: oklch(0.5 0.145 152);
  --cta-tint: oklch(0.955 0.028 152); /* buyer chat bubble tint */
}
```

## Type

- Display: **Space Grotesk** (600/700) — precise grotesk, letter-spacing >= -0.03em
- Body/UI: **Instrument Sans** (400/500/600)
- Scale: display clamp(2.5rem–3.75rem) / h2 1.5rem / body 1rem–1.0625rem / small 0.875rem
- `text-wrap: balance` on headings; body line length <= 70ch

## Rules

- Whitespace is the styling: sections breathe (>= 6rem vertical), 8px spacing scale
- One accent: green is the CTA and almost nothing else; berry is the wordmark and almost nothing else
- Flat light surfaces — no gradients, texture, grain, glass, glow, dark mode
- Cards only below the fold (catalog); radius 12–16px; no nested cards; border OR shadow, not both
- Motion: CTA hover/press feedback + one hero load fade. ease-out, transform/opacity only,
  `prefers-reduced-motion` respected. No scroll choreography
- Contrast >= 4.5:1 body, visible focus rings, 44px+ touch targets, no horizontal scroll
- Copy: active buyer-side language; CTA reads **Message Abhi on WhatsApp** everywhere

## Signature element

The hero's WhatsApp conversation vignette: buyer demand → Abhi's matched-bales reply →
"Sanket is negotiating behind the scenes". Styled HTML, not a screenshot. Everything around
it stays silent.
