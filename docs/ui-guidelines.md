# Modern UI Guidelines for Refactoring Existing Interfaces

Use these UI guidelines to modernize existing user interfaces without removing functionality.

The goal is to create a modern, calm, ergonomic, professional, and highly usable business UI. Existing content and features must remain intact, but the interface should be restructured, visually improved, and made more consistent.

Do not make decorative changes for their own sake. Every change must improve clarity, usability, visual hierarchy, accessibility, or workflow efficiency.

---

## 1. Core Principles

- Clarity before visual effects.
- Users must understand the screen faster than before.
- Every page needs a clear visual hierarchy.
- Important information must be visible immediately.
- Primary actions must be easy to identify.
- Secondary actions must not compete with primary actions.
- Do not introduce unnecessary clicks.
- Do not remove existing functionality.
- Do not change domain-specific terms if they are professionally relevant.
- Do not add background animations.
- Use motion only when it supports orientation, feedback, or state changes.
- Avoid overloaded color surfaces.
- Avoid random shadows, gradients, or visual gimmicks.
- The UI must feel modern, clean, high-quality, and productive.

---

## 2. Layout

- Use a consistent layout grid.
- Align all elements cleanly.
- Structure pages into clear regions:
  - Header
  - Context or page description
  - Filters and actions
  - Summary or status area
  - Main content
  - Details, history, or supporting information
- Avoid large empty areas without purpose.
- Use available space meaningfully.
- Content should not appear lost in the top-left corner.
- On desktop, multi-column layouts are allowed.
- On narrow screens, the layout must wrap cleanly.
- Avoid fixed widths that break responsive behavior.
- Use flexible grids, auto-fit, minmax, or equivalent responsive patterns.
- Group related content closely.
- Separate unrelated topics clearly.
- Use cards and panels only when they represent meaningful content groups.
- Avoid unnecessary nesting of boxes and containers.

---

## 3. Spacing

Use a consistent spacing system.

Recommended spacing scale:

| Purpose | Recommended spacing |
|---|---:|
| Very small internal spacing | 4–8 px |
| Normal internal spacing | 12–16 px |
| Card or panel padding | 16–24 px |
| Gap between cards or panels | 16–24 px |
| Gap between major sections | 32–48 px |
| Desktop page margins | 24–48 px |
| Mobile page margins | 16 px |

Rules:

- Similar elements must use similar spacing.
- Elements that belong together should be closer together.
- Separate topics need more distance.
- Avoid random margins.
- Avoid visually uneven gaps.
- Do not rely on whitespace alone if grouping is unclear.

---

## 4. Typography

Use typography to guide the user.

Rules:

- Create a clear typographic hierarchy.
- Page titles must be larger than section titles.
- Section titles must be larger than regular content.
- Labels should be calmer than values.
- Important values may be visually emphasized.
- Normal text must remain readable.
- Table content should be compact but not cramped.
- Avoid excessive bold text.
- Avoid unnecessary uppercase text.
- Use comfortable line height.
- Do not let long text lines stretch too wide.
- Metadata should be smaller and visually quieter.

Recommended type scale:

| Element | Recommended size |
|---|---:|
| Main page title | 28–36 px |
| Business UI page title | 24–30 px |
| Section title | 18–22 px |
| Card title | 16–18 px |
| Body text | 14–16 px |
| Table content | 13–15 px |
| Helper text / metadata | 12–13 px |

---

## 5. Colors

Use color semantically.

Rules:

- Primary color is reserved for primary actions, active navigation, and important highlights.
- Error color is reserved for real errors.
- Warning color is reserved for relevant warnings.
- Success color is used for completed or positive states.
- Neutral colors are used for layout, surfaces, borders, and secondary information.
- Never communicate status by color alone.
- Combine color with text, badges, or icons.
- Avoid too many competing colors.
- Avoid bright full-surface color blocks.
- Use subtle backgrounds, fine borders, and calm surfaces.
- Ensure sufficient contrast.
- Dark mode must not simply invert light mode colors.

Semantic color roles:

| Role | Usage |
|---|---|
| Primary | Main actions, active navigation, key highlights |
| Neutral | Text, borders, backgrounds, structure |
| Success | Completed, active, positive |
| Warning | Attention required |
| Error | Critical, failed, destructive |
| Info | Neutral information |

---

## 6. Visual Hierarchy

- Place the most important information near the top.
- Every page or major section needs one clear primary action.
- Primary actions must be visually distinct.
- Secondary actions should use secondary, ghost, text, or menu styles.
- Details should be visually subordinate.
- Status information should be visible early.
- Critical information must not be hidden.
- Rare actions should not dominate the UI.
- Use size, spacing, color, and position to guide the user.

A good UI answers immediately:

- Where am I?
- What is this page about?
- What is important?
- What can I do next?
- What requires attention?

---

## 7. Buttons and Actions

Rules:

- Button labels must use concrete verbs.
- Avoid generic labels such as “OK”, “Submit”, or “Action” if a more specific label is possible.
- Use only one primary action per page or section.
- Dangerous actions must be clearly marked as destructive.
- Destructive actions require confirmation.
- Disabled buttons must be understandable.
- Buttons need clear hover, focus, active, disabled, and loading states.
- Icon-only buttons are allowed only if their meaning is obvious.
- Icon-only buttons require tooltips or accessible labels.

Good button labels:

- Save changes
- Request appointment
- Assign case
- Export report
- Complete process
- Upload file
- Add participant

Bad button labels:

- OK
- Submit
- Execute
- Action
- Confirm, when the actual action can be named more precisely

---

## 8. Forms

Forms must be calm, logical, and easy to complete.

Rules:

- Group fields logically.
- Always keep labels visible.
- Do not use placeholders as label replacements.
- Mark required fields clearly, but only once.
- Show errors directly at the affected field.
- Place helper text close to the relevant field.
- Arrange related fields next to each other when enough space is available.
- On mobile, forms should usually become single-column.
- Long text fields should use full width.
- Short fields should remain compact.
- Clearly distinguish readonly fields from editable fields.
- Validate early enough to help, but not so aggressively that it interrupts the user.
- Show clear feedback after saving.
- Do not place large, complex forms inside oversized dialogs unless there is a strong reason.

Recommended form grouping example:

```text
Contact
- First name
- Last name
- Phone
- Email

Address
- Street and house number
- Postal code and city

Additional information
- Notes
```

---

## 9. Tables

Tables must be easy to scan.

Rules:

- Place the most important columns on the left.
- Show status as early as possible.
- Place row actions on the right.
- Align numbers to the right.
- Align text to the left.
- Format dates consistently.
- Use meaningful column widths.
- Keep row height compact but readable.
- Add row hover states.
- Make sorting visible.
- Make active filters visible.
- Provide helpful empty states for empty tables.
- Use pagination, lazy loading, or virtualization for large datasets.
- Show bulk actions only when relevant.
- Do not simply squeeze large tables on mobile.
- On mobile, consider card layout or intentional horizontal scrolling for complex tables.

Good table status labels:

- Open
- In progress
- Waiting for response
- Scheduled
- Confirmed
- Completed
- Failed

Avoid unclear status codes unless the target users explicitly need them.

---

## 10. Filters and Search

Rules:

- Frequently used filters should be visible.
- Rare filters can be collapsible.
- Active filters should be displayed as chips.
- Provide a clear “Reset filters” action.
- Search should be prominent if it is central to the page.
- Filter changes must have visible effects.
- Empty search results must be explained.
- Do not provide filters that appear to do nothing.
- Saved filters or saved views should be supported when they fit the application.

Example active filter display:

```text
Status: Open   Year: 2026   Region: West   [Reset filters]
```

---

## 11. Cards and Panels

Use cards only for meaningful content groups.

Rules:

- Every card needs a clear purpose.
- Card titles must be specific.
- Highlight the most important value or status.
- Use consistent internal spacing.
- Prefer subtle borders or soft shadows.
- Use a consistent border radius.
- Avoid heavy shadows.
- Avoid unnecessary card-in-card structures.
- Align content to the top.
- Place actions inside cards carefully and sparingly.
- Cards must not be decorative wrappers without meaning.

Useful card structure:

```text
[Icon] Title                         Status
       Main value or summary
       Short explanation
       Optional action
```

---

## 12. Status and Feedback

The UI must always communicate what is happening.

Rules:

- Every relevant action needs feedback.
- Loading states must be visible.
- Use subtle spinners for short operations.
- Use skeletons for larger loading areas.
- Success messages must be specific.
- Error messages must be understandable and actionable.
- Warnings should only appear when the user needs to know or act.
- System states must not be hidden.
- After an action, clearly show what changed.

Examples:

Bad:

```text
Done.
```

Good:

```text
The appointment request has been sent successfully.
The assigned team can now review the case details.
```

---

## 13. Error Messages

Errors must help the user recover.

Rules:

- Use human language.
- Explain the cause when known.
- Offer a concrete next step.
- Show errors in context.
- Critical errors must not be shown only as toast messages.
- Technical details may be hidden in an expandable section.
- Avoid generic messages if more context is available.

Bad:

```text
Error 500
Operation failed
Invalid input
```

Good:

```text
The appointment could not be saved because no contact person was selected.
Select a contact person and try again.
```

---

## 14. Empty States

Empty states are part of the UI and must be intentionally designed.

Rules:

- Do not show only “No data”.
- Explain what is empty.
- Explain why it might be empty.
- Offer the next useful action.
- A subtle icon or illustration is allowed, but it must not feel playful in a professional UI.

Example:

```text
No appointments available yet.
Create the first appointment proposal or adjust the current filters.
```

---

## 15. Navigation

Rules:

- Clearly mark the active area.
- Do not mix main navigation with detail actions.
- Use breadcrumbs for deep structures.
- Provide clear ways to return.
- Make frequent destinations visible.
- Move rare destinations into menus.
- Navigation icons should usually be combined with text.
- Users must always know where they are.

Navigation must answer:

- Where am I?
- How do I go back?
- What belongs to this area?
- What can I do here?

---

## 16. Dialogs and Modals

Use dialogs sparingly.

Dialogs are appropriate for:

- Confirmations
- Focused input
- Critical decisions
- Quick detail editing

Rules:

- Do not use huge dialogs for complex pages.
- Dialogs must be responsive.
- On small screens, dialogs should become fullscreen or nearly fullscreen.
- Dialog titles must be clear.
- Dialog content must stay focused.
- Primary action should usually be at the bottom right.
- Cancel must be visible.
- Keep focus inside the dialog.
- Define Escape behavior deliberately.
- Show clear feedback after successful actions.
- For complex workflows, prefer pages, drawers, or wizards instead of overloaded modals.

Recommended dialog structure:

```text
Title
Short explanation
Focused form or content
Secondary action       Primary action
```

---

## 17. Wizards

Use wizards only when the process is truly multi-step.

Rules:

- Name steps clearly.
- Show progress.
- Allow users to go back.
- Mark completed steps.
- Show errors per step.
- Mark optional steps as optional.
- Do not force users through unnecessary steps if a direct action is professionally valid.
- Show a summary before completion.
- Use concrete step labels, not “Step 1” or “Step 2”.

Good step labels:

```text
1. Case
2. Contact
3. Appointment
4. Review
5. Assignment
```

---

## 18. Responsive Design

Mobile is not a shrunken desktop.

Rules:

- Avoid fixed widths that break small screens.
- Desktop may use multi-column layouts.
- Mobile should usually be single-column.
- Touch targets should be at least about 44 px high.
- Tables require special handling on mobile.
- Filters should be collapsible on mobile.
- Primary actions should be easy to reach on mobile.
- Avoid long button bars on mobile.
- Content must wrap cleanly.
- Avoid horizontal overflow except intentionally for complex tables.
- Dialogs must not become tiny on mobile.

Desktop patterns:

- Multi-column layouts
- Split views
- Sticky toolbars
- Large tables
- Side panels

Mobile patterns:

- Single-column layout
- Cards instead of tables
- Collapsible filters
- Bottom action bars
- Fullscreen dialogs

---

## 19. Accessibility

Accessibility is mandatory for a modern UI.

Rules:

- Ensure sufficient contrast.
- Support keyboard navigation.
- Provide visible focus states.
- Use a logical tab order.
- Provide labels for all inputs.
- Make errors accessible to screen readers.
- Provide accessible labels for icons.
- Do not communicate information only through color.
- Use semantic HTML.
- Use ARIA carefully and only where needed.
- Respect `prefers-reduced-motion`.
- Group forms logically.
- Interactive elements must be recognizable as interactive.

Never remove the focus outline without replacing it with a clear visible focus state.

Bad:

```css
outline: none;
```

Good:

```css
/* Provide a visible focus ring that matches the design system. */
```

---

## 20. Motion and Animation

Motion must support usability.

Allowed uses:

- Orientation
- Feedback
- State transitions
- Loading
- Expand and collapse
- Sorting or reordering

Rules:

- No background animations.
- No permanent decorative motion.
- Use animation only when it helps the user.
- Typical duration: 120–250 ms.
- Large layout transitions may use up to about 400 ms.
- Use subtle easing.
- Animation must never slow down the workflow.
- Respect reduced motion settings.

---

## 21. Microcopy

UI text is part of the design.

Rules:

- Write short, concrete, active text.
- Use the same terms consistently.
- Avoid technical terms unless they help the user.
- Keep professional domain terms when necessary.
- Use verbs for buttons.
- Helper text should guide action.
- Error text should help recovery.
- Avoid overly casual language in professional applications.

Bad:

```text
Object persisted.
```

Good:

```text
Changes saved.
```

---

## 22. Business and Data-Heavy Interfaces

Professional users need speed and clarity.

Rules:

- Information density may be higher, but it must be controlled.
- Show important data at a glance.
- Make details expandable when needed.
- Use progressive disclosure.
- Put summaries before details.
- Make status, deadlines, owners, and next actions visible.
- Keep history and audit information accessible.
- Do not slow down power users through excessive minimalism.
- Support frequent workflows with as few clicks as possible.

Useful power-user features:

- Keyboard shortcuts
- Saved views
- Configurable columns
- Bulk actions
- Fast search
- Inline editing
- Recently opened records
- Favorites
- Global search

---

## 23. Dashboards

Dashboards must support decisions, not just display numbers.

Rules:

- Place the most important KPIs at the top.
- Prominently display no more than 4–6 top metrics.
- Always show the relevant time period.
- Explain comparison values.
- Use charts only when they provide real insight.
- Avoid decorative charts.
- Show units.
- Mark incomplete or missing data.
- Link summary cards to detail views when useful.

Good dashboard card example:

```text
Open cases
128
+12 since last week
[View details]
```

---

## 24. Charts

Charts must answer a question.

Rules:

- Provide a clear title.
- Show the relevant time period.
- Label axes and units.
- Use legends only when needed.
- Provide useful tooltips.
- Avoid unnecessary 3D effects for analytical charts.
- Avoid too many data series at once.
- Use colors consistently.
- Make data gaps visible.
- If a chart does not support a decision or insight, remove or replace it.

Before adding or keeping a chart, ask:

```text
What decision should the user make from this chart?
```

---

## 25. Component States

Every interactive component must support the following states:

- Default
- Hover
- Focus
- Active
- Disabled
- Loading
- Empty
- Error
- Success
- Warning

Do not implement only the happy path.

---

## 26. Design System

Use centralized design tokens and reusable components.

Design tokens should cover:

- Colors
- Spacing
- Font sizes
- Line heights
- Border radius
- Shadows
- Z-index
- Breakpoints
- Motion duration
- Component variants

Example token scale:

```text
spacing-xs: 4px
spacing-sm: 8px
spacing-md: 16px
spacing-lg: 24px
spacing-xl: 32px

radius-sm: 6px
radius-md: 12px
radius-lg: 20px
```

Rules:

- Avoid one-off values unless there is a strong reason.
- Reuse existing components instead of creating copy-paste variants.
- Name component variants clearly.
- Use the existing UI library consistently.
- Do not mix different visual design languages.

---

## 27. Dark Mode

Dark mode is not inverted light mode.

Rules:

- Avoid pure black surfaces.
- Use dark neutral grays.
- Use surface layers to create depth.
- Replace heavy shadows with subtle borders or elevation changes.
- Desaturate strong colors.
- Check contrast carefully.
- Adapt status colors for dark backgrounds.
- Avoid bright full-surface colors.

Typical structure:

```text
Background: very dark gray
Surface: slightly lighter gray
Border: subtle lighter line
Text: light but not pure white
```

---

## 28. Performance and Perceived Speed

A modern UI feels immediate.

Rules:

- Provide instant feedback after user actions.
- Use skeletons instead of blank loading areas.
- Use optimistic updates where safe.
- Lazy-load heavy content.
- Virtualize large lists and tables.
- Optimize images.
- Avoid unnecessary re-renders.
- Debounce expensive filters and searches.
- Do not block an entire page when only one area is loading.

Goal:

```text
The UI should feel responsive even when data takes time to load.
```

---

## 29. Trust and Safety

Business UIs must create trust.

Rules:

- Confirm critical actions.
- Clearly mark irreversible actions.
- Show audit and history information where relevant.
- Make changes traceable.
- Never fail silently.
- Explain permission restrictions clearly.
- Do not expose sensitive information unnecessarily.
- Handle session and timeout states cleanly.

---

## 30. Internationalization

Even if the current UI is only in one language, prepare it properly.

Rules:

- Do not hard-code user-facing text.
- Format dates according to locale.
- Format numbers according to locale.
- Format currencies correctly.
- Allow text to become longer.
- Buttons and labels must handle longer translations.
- Do not design layouts that only work with short labels.

---

## 31. Modernization Workflow for Existing UIs

When refactoring an existing UI, follow this process:

1. Analyze the current page.
2. Identify the page purpose.
3. Identify the primary action.
4. Identify the most important information.
5. Remove visual noise without removing functionality.
6. Reorganize content logically.
7. Improve spacing, alignment, and visual hierarchy.
8. Make primary and secondary actions clearly distinguishable.
9. Improve tables, filters, forms, and status displays.
10. Add missing states such as loading, empty, error, success, and warning.
11. Ensure responsive behavior.
12. Check accessibility.
13. Preserve domain logic and existing data binding.
14. Avoid backend changes unless strictly necessary.
15. Deliver a visibly more modern, serious, and usable UI.

---

## 32. Desired Visual Style

The result should feel:

- High-quality
- Calm
- Clear
- Professional
- Modern
- Ergonomic
- Precise
- Productive
- Serious
- Trustworthy

The result should not feel:

- Playful
- Overanimated
- Overdesigned
- Random
- Noisy
- Empty
- Cheap
- Experimental without purpose

---

## 33. Things to Avoid

Avoid the following:

- Huge unused empty areas
- Unclear button bars
- Too many equally prominent actions
- Heavy shadows
- Bright, competing colors
- Random spacing
- Fixed widths that break responsiveness
- Duplicate required-field asterisks
- Hard-to-read tables
- Cut-off content
- Overloaded dialogs
- Hidden primary actions
- Icons with unclear meaning
- Toasts as the only error feedback
- Placeholders used as labels
- Poor mobile layouts
- Animation without purpose
- Mixed design languages
- Decorative charts without insight
- Inconsistent terminology

---

## 34. Acceptance Criteria

A refactored UI is acceptable only if:

- The page is easier to understand at first glance.
- The most important action is immediately recognizable.
- Content is grouped logically.
- Spacing and alignment are consistent.
- The UI looks more modern and higher quality.
- The workflow is faster or at least not slower.
- There are no lost or unbalanced empty areas.
- All existing functionality remains available.
- The page works on desktop, tablet, and mobile.
- Keyboard navigation and focus states work.
- Loading, error, empty, success, and warning states exist.
- Tables and forms are easier to scan.
- The result feels like a coherent product, not a collection of unrelated components.

---

## 35. Final Instruction

Refactor existing UIs with discipline.

Do not redesign randomly.
Do not remove business functionality.
Do not make the UI merely prettier.
Make it clearer, calmer, faster, more consistent, more accessible, and more professional.

Every change should answer at least one of these questions:

- Does this improve understanding?
- Does this reduce cognitive load?
- Does this make the next action clearer?
- Does this make the UI more consistent?
- Does this prevent errors?
- Does this improve accessibility?
- Does this make the workflow faster?

If the answer is no, reconsider the change.
