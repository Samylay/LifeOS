# P04: Interaction and animation

Checked: 2026-09-29. Scope: responsive feedback, state transitions, gestures, reduced motion, animation performance, and visual review. Emil Kowalski is the primary craft influence. Accessibility criteria and measured device behavior remain separate evidence. The timing rules below are LifeOS/Micro house choices, not an industry certification.

## Evidence and principles

Emil's public work turns animation decisions into explicit guidance: easing depends on the kind of change, a popover should originate near its trigger, and short transitions make ordinary controls responsive. His current upstream includes dedicated Expo/native motion guidance and focused creation, review, and opportunity-finding skills. Use the reviewed revision and local policy overlay rather than an unreviewed moving branch. [Agents with Taste](https://emilkowal.ski/ui/agents-with-taste), [Pinned upstream skills](https://github.com/emilkowalski/skills/tree/d16ebe60d09a5ba2afcb7054ede9d0a10c9f6128).

Apple's motion guidance calls for purposeful motion, familiar gesture relationships, and alternative ways to communicate important information. Apply motion to orientation, feedback, and meaningful transitions. A frequent action should never wait for a decorative reveal before it becomes usable. [Apple motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion?changes=l_9_3).

Browser performance guidance recommends avoiding layout or paint work where possible and starting with transform and opacity. Layer promotion through `will-change` has costs and should follow measurement. A permitted CSS property is not proof of inexpensive rendering: blur, large filtered surfaces, and clipping require profiling. [High-performance animation guidance](https://web.dev/articles/animations-guide).

WCAG 2.3.3, at AAA, addresses disabling nonessential interaction-triggered animation. AA does not make all animation acceptable: separate A-level criteria address relevant automatically moving content and flashing. The house reduced-motion rule is a product requirement beyond a claim about that AAA criterion alone. [Animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), [Pause, stop, hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), [Flash thresholds](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html).

## The Micro workflow

1. **Decide whether motion helps.** Classify the interaction by frequency and purpose. Rare milestones may support expressive motion. Daily navigation and forms should remain subtle and fast. Keyboard-driven commands and constant repeated actions remain immediate. Record the reason when an animation is rejected.
2. **Define the state contract first.** Identify what changes immediately, what persists, what is pending, and what happens on failure. Optimistic feedback needs rollback or recovery and concurrency handling. For consequential operations such as payment, show progress without falsely declaring success before confirmation.
3. **Specify each transition.** Name the trigger, element, start/end state, property, duration, easing, origin, interruption behavior, and reduced-motion equivalent. This can be a compact table in the feature spec. Use semantic motion tokens instead of many arbitrary values.
4. **Implement the smallest mechanism.** Use CSS transitions for ordinary hover/press/disclosure changes. Use a motion library when stateful springs, shared-element coordination, or gestures justify it. Keep application state independent of animation completion so canceled or disabled motion cannot strand the workflow.
5. **Exercise interruptions.** Open-close-open rapidly, change route mid-transition, submit twice, reverse a gesture, remove the trigger while a surface is open, and change the underlying data. The final visual and accessible state must match the actual state. Exit animations must not leave invisible controls focusable.
6. **Review with normal and reduced motion.** Capture normal-speed interaction and inspect suspicious frames. Measure performance in the actual browser/device and a release build where relevant. Screenshot regression checks supplement this process; still images cannot test animation timing or interruptibility.

Recommended `motion.md` fields:

| Field | Example |
| --- | --- |
| Purpose and frequency | Orient someone after opening a daily-use expense editor |
| Trigger and states | Pointer activation opens the editor; Escape dismisses it |
| Feedback | Press response is immediate; the editor remains operable during transition |
| Visual definition | Opacity plus a short transform from the relevant origin |
| Timing | Product token, duration, easing, and reason |
| Interruptions | Repeated activation, dismissal during opening, route departure |
| Reduced motion | Immediate stable state or modest fade; same controls and recovery |
| Evidence | Build, browser/device, recording, trace if needed, findings |

## House policy and judgment

For LifeOS components, the repository's explicit 300ms limit overrides the generic skill's longer drawer examples. Use custom easing variables, animate only the allowed `transform`, `opacity`, `clip-path`, or `filter` properties, ban `transition-all`, preserve required press feedback, and include the global reduced-motion block. Prefer transform/opacity within the allowed set, then measure the others. Apply the user's existing preference for an animated daily interface while keeping rapid and keyboard flows immediate.

The generic global duration override is a useful floor, but JavaScript animation and native motion need their own policy. Do not rely on a CSS media query to stop a canvas timeline, requestAnimationFrame loop, or native gesture animation. W3C and MDN describe the system preference used by CSS; functional state must remain understandable when motion is removed. [W3C reduced-motion technique](https://www.w3.org/WAI/WCAG22/Techniques/css/C39), [MDN accessibility media queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Media_queries/Using_for_accessibility).

Toast feedback should not be the only place that exposes an important failure or recovery action. Drawers require focus handling and escape/back behavior as well as gesture polish. Match the feedback channel to the interaction and user setting; haptics are platform-specific, not a blanket substitute for visible or accessible status.

## Web and mobile tooling

| Mechanism | Selection rule | Verification |
| --- | --- | --- |
| CSS transitions | Local visual state change with simple interruption | Browser behavior plus computed style and reduced-motion checks |
| Motion library | Springs or coordinated shared-element behavior are essential | Bundle/runtime impact, cancellation, focus/state behavior |
| React Native Animated native driver | Supported ordinary non-layout animations | Release-build behavior and documented property/event limits |
| Reanimated and Gesture Handler | Continuous gesture/state coordination needs UI-thread execution | Compatible stack versions, release-build trace, reduced motion, gesture conflicts |
| Lottie or authored illustration | An intentional illustration needs a designer-owned timeline | Asset size, licensing, pause/reduced-motion behavior, no business-state dependency |

React Native's native driver can continue a supported animation while the JavaScript thread is busy; its limits include layout properties and certain event patterns. Do not turn a practitioner's preference for Reanimated into a claim that core Animated is universally unusable. Emil's Expo skill is a strong candidate for gesture craft; reconcile its recommendations with the actual framework version and official APIs. [React Native animations](https://reactnative.dev/docs/animations), [Emil's Expo skill](https://github.com/emilkowalski/skills/blob/d16ebe60d09a5ba2afcb7054ede9d0a10c9f6128/skills/animate-expo/SKILL.md).

Reanimated 4's accessibility docs describe system-aware reduced-motion behavior. Its `useReducedMotion` hook reads the setting at app start and does not trigger a rerender when the setting changes. If live preference changes are part of the product contract, implement and test that path rather than assuming the hook supplies it. [Reanimated accessibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/), [Hook limitations](https://docs.swmansion.com/react-native-reanimated/docs/device/useReducedMotion/).

## Risk-tiered acceptance

| Tier | Observable predicate |
| --- | --- |
| Prototype | The transition answers a named design question; normal and reduced states are operable; major interruption failures are recorded |
| Public release | Motion declarations follow local rules; repeated/reversed input reaches the correct state; focus and accessible announcements follow the real state; reduced motion preserves every critical task; release-build review finds no unresolved task-blocking animation defect |
| Gesture-heavy or consequential flow | Real-device gesture conflicts, cancellation, back navigation, background/resume, and failed operation recovery pass the recorded matrix; performance evidence uses declared representative hardware |

Set device-specific frame and interaction budgets before profiling. Do not claim a universal FPS guarantee from a desktop development recording or a skill's example. Playwright can disable animation for stable screenshot comparisons; retain separate motion evidence. [Visual comparison limitations](https://playwright.dev/docs/test-snapshots).

## Implementation order and limits

First retain the existing interaction-craft entry point and clarify precedence between repository rules and upstream advice. Add a per-feature transition contract and reduced-motion/interruption cases next. Then introduce animation recordings and device traces for higher-risk flows. Enable additional upstream skills selectively after license, scripts, compatibility, and fixture review. No paid course contents were accessed or reproduced for this research.

The house doctrine is installed. The broader source-governed adapters, native-device matrix, and retained motion evidence above are proposed additions. Static rule checks can detect some violations, but they cannot establish that an interface feels good or that gestures are understandable.
