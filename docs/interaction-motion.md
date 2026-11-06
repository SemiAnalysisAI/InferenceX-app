# Shared interaction motion

The controls use the existing CSS motion layer and Radix presence. No animation
library, chart interpolation, benchmark calculation, API contract, or routing
change is required.

## Codebase findings

- `src/app/motion.css` already owns entrance/exit easing, intersection reveals,
  hover lift and press feedback. Controls previously mixed those tokens with
  Tailwind defaults.
- `ui/popover.tsx`, `select.tsx`, `tooltip.tsx`, and `dialog.tsx` share Radix
  presence. Their CSS exit animations keep the content mounted until completion.
- `ui/searchable-select.tsx` uses the shared popover but explicitly disabled its
  animation. `ui/multi-select.tsx`, used by the model and precision selectors,
  has its own mount/unmount lifecycle and needed separate exit handling.
- `ui/switch.tsx` uses Tailwind's independent `translate` property. Its movement
  must transition `translate`, not the unrelated `transform` property.
- `ui/copyable-code-block.tsx` already waits for the clipboard promise and reports
  failures. Feedback animation must follow that result, not the initial click.
- `ui/bottom-toast.tsx` tracks touch movement and reserves space on phones.
  Resistance must not replace raw touch coordinates used for dismissal.
- Dashboard navigation already measures and moves a persistent indicator.
  `components/motion/reveal.tsx` already supports staggered entrance delays.

Paths above are relative to `packages/app/`.

## Applying the reference

| Reference principle          | Implementation or boundary                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ease-out entrances           | Existing `--motion-ease-enter` reused for shared surfaces.                                                                                                     |
| Dropdowns at 150–250ms       | Surface entrance 200ms, exit 160ms.                                                                                                                            |
| Stagger list rows by 30ms    | First five logical option rows stagger by 0–120ms; remaining rows are immediate. Explicit indices handle help-grid wrappers. Groups restart the short stagger. |
| Scale to 0.97 on press       | Shared Button and code-copy button use `motion-press`, with disabled controls excluded.                                                                        |
| Stretch moving knobs 12%     | User-toggled switch thumb briefly scales horizontally to 1.12 while its position transitions.                                                                  |
| Stagger as details settle    | Existing Reveal delays retained; short option reveals follow the opening surface. No new page-wide delay.                                                      |
| Arcs for object movement     | Not introduced. There is no object-transfer interaction in this patch; curving benchmark-point movement would misrepresent the data.                           |
| Pulse to confirm success     | Check icon pulses only after clipboard success, including repeated successful copies.                                                                          |
| Ease-in-out moves            | Switch travel and toast snap-back use `--motion-ease-move`.                                                                                                    |
| Start popovers at 0.95       | Shared surfaces start and exit at scale 0.95.                                                                                                                  |
| Enter from trigger           | Radix transform origins and resolved `data-side` choose direction; custom model/precision menus use their top edge.                                            |
| Exit to trigger              | Same origin and reverse offset; custom menus remain inert during exit.                                                                                         |
| No bounce on everyday UI     | Control movement uses bounded cubic curves; only the success icon pulses.                                                                                      |
| Don't tween while held       | Press scale applies immediately; an active toast drag has `transition: none`.                                                                                  |
| Make exits 20% shorter       | Shared surfaces: 200ms → 160ms. Toasts: 300ms → 240ms.                                                                                                         |
| Overlap old and new states   | Copy and check icons occupy the same fixed-size slot during crossfade. Old benchmark states are not blended.                                                   |
| Masks for reveals and colour | Option rows use a small clip-path reveal; no chart recoloring or measurement animation.                                                                        |
| Crossfade icons + blur       | Copy/check opacity and 2px blur crossfade in 160ms.                                                                                                            |
| Rubber band past bounds      | Toast tracking is direct to 80px, then approaches a 120px bound. Raw gesture distance still determines dismissal.                                              |
| Reuse the same layoutId      | Existing persistent navigation indicator retained. No `layoutId` library or duplicate indicator added.                                                         |

## Accessibility and interruption

`prefers-reduced-motion: reduce` removes the new animations, stagger, blur,
press scale and switch transitions. A toast still tracks the finger directly,
without interpolation, and dismisses without waiting for an exit.

Radix continues to own focus trapping, collision handling and focus restoration.
The custom multi-select marks closing content `inert` and `aria-hidden`, waits
for the actual CSS animation promises, and cancels stale completion work when
reopened. No duration is duplicated in that lifecycle.

Filtered results remain unchanged through the exit. Search resets after a
custom menu unmounts or when a searchable select reopens. Closed surfaces and
overlays retain their transparent final frame until their owners remove them.

Dialog positioning uses Tailwind's independent `translate`; the entrance uses
`transform`. Keeping them separate prevents a scale animation from shifting a
centered modal into the lower-right quadrant.

Copy errors retain the existing accessible failure text and never show success.
Toast dismissal is idempotent, and pending timers and animation frames are
cancelled on unmount.

## Verification

`cypress/component/component-css.cy.tsx` covers surface timings, exit presence,
focus return, dialog centering during animation, clipboard success/failure,
switch reversal and keyboard input, and reduced motion. The existing selector,
quick-filter, chart-button and toast specs exercise the shared components in
their callers. Toast unit tests cover resistance, cancellation and the shorter,
idempotent dismissal.

Before/after browser recordings use an untouched checkout of the base commit
and the changed checkout with `E2E_FIXTURES=1`. They show the dashboard menus,
Share, help, Quick Filters, API code copying, and the 375px layout. These are UI
fixture demonstrations, not new benchmark measurements.
