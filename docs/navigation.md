# Persistent navigation

The canonical page is `/`. Home and Projects are internal panels of `PortfolioShell.astro`; there is no separate project route, ClientRouter, fragment navigation, or History API write.

`portfolio-panels.ts` makes the outgoing panel inert, animates the shared viewport out for 140ms, switches panels while invisible, then animates the new group and viewport height for 220ms. Navigation and footer stay outside this viewport. Both panels remain mounted; only one is displayed. Requests during an animation retain the latest target rather than building a queue.

Keyboard activation announces the view and focuses its heading. Tab during a transition completes motion and follows the actual destination tab order. Reduced motion skips animations. Resizing finishes active animation and restores natural height. Modal state is cleared before a panel leaves.

Contact is a button that focuses `#contact`, the single existing social footer, then calls `scrollIntoView`. Scrolling is smooth normally and immediate under reduced motion. It leaves the current panel, URL, and history unchanged; it is never a third panel.

Welcome uses the configurable session-storage key and does not replay during switches. A new document always starts at Home. With JavaScript disabled, both panels and the footer render inline and the inactive navigation controls are hidden. Static summaries and source links remain readable.

Spotify's Home instance stays mounted. Hidden Home or hidden documents cancel pending requests and stop timers; returning checks freshness before revealing LIVE and respects existing retry deadlines. Repeated mounts are guarded.

Run `npm run test:browser` to check persistent DOM identity, URL/history invariants, frame-sampled geometry and timing, rapid navigation, Contact, keyboard order, reduced motion, dialogs, and polling cleanup.
