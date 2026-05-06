# UI Guidelines

OpenVoice UI should feel modern, calm, ergonomic and professional. Existing functionality stays
intact; modernization work should improve clarity, hierarchy, scanability and operation speed.

## Principles

- Clarity before effects. Avoid decorative work that does not improve understanding or operation.
- Preserve existing content, terminology and functions unless there is a concrete product reason.
- Use a clear visual hierarchy: primary information first, secondary details quieter.
- Use one obvious primary action per area. Secondary actions must not compete visually.
- Keep spacing, typography, colors, borders and focus states consistent through shared tokens.
- Avoid large unused empty areas, random margins, hard shadows, heavy gradients and loud colors.
- Use semantic color: primary for main actions/active state, error for errors, warning for relevant
  warnings, success for positive completion and neutral tones for structure.
- Provide actionable status, empty and error states in context.
- Respect accessibility: visible labels, keyboard focus, sufficient contrast, semantic HTML and
  no information conveyed by color alone.

## Layout

- Use responsive grids with `minmax`, `auto-fit` and flexible tracks instead of brittle fixed
  widths.
- Group related content tightly and separate different topics clearly.
- Desktop layouts may be multi-column; mobile layouts must stack cleanly without horizontal
  overflow.
- Cards and panels are for genuine content groups, not decoration.
- Avoid nested cards unless a nested group is semantically necessary.

## Spacing And Type

- Small spacing: 4-8 px.
- Normal control/panel spacing: 12-16 px.
- Panel padding: 16-24 px.
- Major section gaps: 24-48 px.
- Keep labels quieter than values. Use strong weight sparingly.
- Keep long text lines constrained and readable.

## Controls

- Buttons use concrete verbs. Avoid generic labels when a specific action is known.
- Provide hover, focus, active, disabled and loading-ready styles.
- Inputs always keep visible labels; placeholders are not labels.
- Errors and help text should appear near the affected control.
- Primary actions are visually distinct; destructive actions must be explicit and confirmed.

## Data And Operational UI

- Show important operational status early.
- Put useful links and checks where operators can find them quickly.
- Empty states explain what is missing and what the next useful action is.
- Audit/history information should remain accessible but visually secondary.

## Motion

- No background animation or decorative motion.
- Motion is only for orientation or feedback, usually 120-250 ms.
- Respect `prefers-reduced-motion`.
