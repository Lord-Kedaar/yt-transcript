# Design System — ytTranscript

> Category: Reading + Triage Utility  
> Implementation direction: **Dark Reading Utility on shadcn Rhea**  
> Status: `CORE_NOW` for portfolio demo polish  
> Last revised: 2026-06-20

`ytTranscript` is a single-purpose local-first tool for extracting YouTube transcripts, reconstructing fragmented captions into readable text, generating a concise summary, and optionally exporting or reading the result aloud.

The interface must feel like a **quiet reading tool**, not a SaaS dashboard, not a landing page, not a model playground, and not a chart museum accidentally attacked by lime paint.

---

## 0. Scope of this document

This file defines the UI/UX direction for preparing `ytTranscript` as a public portfolio demo.

It updates the previous “Reading Room” direction by allowing a **shadcn implementation variant** based on:

`https://ui.shadcn.com/create?preset=b3T3kGZyi`

Preset assumptions:

- style: `Rhea`
- base color: `Zinc`
- theme/accent: `Purple`
- chart/accent color: `Lime`
- font: `Inter`
- icon library: `Tabler Icons`

Important distinction:

- shadcn provides **components, accessibility primitives, tokens and polish**;
- the preset demo layout does **not** define the application layout;
- financial dashboard cards, sidebars, charts and dense grid compositions are inspiration for component quality only, not for product structure.

---

## 1. Product identity

### 1.1. Core metaphor

`ytTranscript` is a **dark reading utility for video transcripts**.

The user journey is intentionally narrow:

1. Paste a YouTube URL.
2. Fetch the transcript.
3. Read raw captions or reconstructed text.
4. Optionally generate a summary.
5. Optionally export or generate TTS audio.

The UI should communicate:

- “I can read this faster than watching the whole video.”
- “I know what the local model did.”
- “I know whether the result stayed local or used a configured fallback.”
- “This is a demonstrator, not a production SaaS.”

### 1.2. Product feel

The interface should feel:

- calm;
- dense enough to be useful;
- readable for long text;
- technically credible;
- restrained;
- portfolio-ready without looking overdesigned.

It should not feel:

- like a finance dashboard;
- like a startup landing page;
- like a chatbot;
- like a model selector;
- like a bento-grid flex contest;
- like a cyberpunk terminal from a film where nobody has ever heard of contrast ratios.

---

## 2. Non-negotiable design decisions

### 2.1. Keep the app single-flow

The application has one main path:

`URL → transcript → reconstruction / summary → export / TTS`

Do not introduce parallel product modes.

### 2.2. Keep the layout vertical

Main content remains a single centered vertical stack.

Allowed maximum main column width:

- default: `720px`
- upper limit for transcript-heavy blocks: `840px`

No dashboard grid. No permanent sidebar. No masonry layout.

### 2.3. Use shadcn selectively

Use shadcn/Radix for component quality, focus management, keyboard accessibility and consistent styling.

Do not use shadcn as an excuse to rebuild the product into a component showcase.

### 2.4. Dark mode is default for the portfolio demo

The public demo should default to the dark Rhea/Zinc variant because the app is primarily used for evening/night research, transcript reading and AI triage.

A light mode can exist later, but it is not required for the demo unless already implemented cleanly.

### 2.5. Trust layer must be visible

A privacy/demo notice must be visible in every application state.

The app must not claim more privacy than the runtime configuration actually provides.

---

## 3. Shadcn implementation variant

### 3.1. Status

`CORE_NOW`

This is the approved implementation direction for portfolio demo polish.

### 3.2. Approved shadcn components

Allowed:

- `Button`
- `Input`
- `Label`
- `Dialog`
- `DropdownMenu`
- `Sheet` / drawer pattern
- `Badge`
- `Alert`
- `Separator`
- `Tooltip`
- `Card`, but only as a section container
- `ToggleGroup` or `Tabs` for the transcript display mode
- `ScrollArea`, only if it does not break natural page reading

Conditionally allowed:

- `Tabs` for `Surowy | Rekonstrukcja AI`, if implemented accessibly and without nested tab chaos.
- `Card` for transcript, summary, TTS and diagnostics only.
- `Accordion` / `Collapsible` for TTS or advanced diagnostics only.

Rejected:

- permanent sidebar navigation;
- dashboard grid;
- bento layout;
- chart components;
- finance dashboard cards;
- account/profile/settings panels copied from the preset;
- navigation menu as the main structure;
- model marketplace;
- “chat with video”;
- onboarding wizard;
- landing page sections inside the tool.

### 3.3. Token strategy

Use the preset tokens as the source of truth.

Do not introduce a second custom color system unless it is a semantic alias layer over the shadcn variables.

Recommended semantic aliases:

- `--ytt-bg` → shadcn background
- `--ytt-surface` → shadcn card/popover
- `--ytt-surface-muted` → shadcn muted
- `--ytt-text` → shadcn foreground
- `--ytt-text-muted` → shadcn muted-foreground
- `--ytt-border` → shadcn border
- `--ytt-primary` → shadcn primary / purple
- `--ytt-primary-fg` → shadcn primary-foreground
- `--ytt-ai-active` → lime accent
- `--ytt-ai-active-soft` → transparent lime background
- `--ytt-warning` → shadcn warning or local warning token
- `--ytt-error` → shadcn destructive
- `--ytt-success` → success token if already present, otherwise local semantic token

Do not hardcode random purples, greens or grays in component CSS.

### 3.4. Color semantics

In the Rhea variant:

- **Zinc** = structure, surfaces, borders, readable darkness.
- **Purple** = primary interaction and selected UI state.
- **Lime** = current AI activity / processing / progress / “model is working now”.
- **Muted zinc** = metadata, helper text, diagnostics.
- **Destructive/error** = failed fetch, model error, invalid URL.
- **Warning** = partial success, fallback, unavailable TTS, token limit.

Rules:

- Purple may be used for primary CTAs, active controls, dialog decisions and selected states.
- Lime must not become the main brand fill for large buttons or panels.
- Lime is reserved for small, meaningful signals: progress edge, spinner, status dot, running indicator.
- Do not communicate state by color alone; always include text or an icon.
- Avoid neon glow, outer glow, animated gradient borders and glassmorphism.

---

## 4. Information architecture

### 4.1. Required application areas

The app has the following areas in this order:

1. Top bar.
2. URL input section.
3. Privacy/demo notice.
4. Empty / ready / loaded state area.
5. Transcript section.
6. Transcript action toolbar.
7. Summary section.
8. TTS section.
9. Export actions.
10. Diagnostics sheet.
11. Footer.

### 4.2. Desktop layout

Desktop layout:

- top bar sticky at top;
- centered main column;
- URL field near top;
- transcript and summary in vertical stack;
- diagnostics hidden behind a top-bar button;
- footer at bottom.

Recommended structure:

```text
Top bar
Main
  URL form
  Privacy notice
  Empty / status area
  Transcript card
  Summary card
  TTS details/card
Footer
Diagnostics Sheet
```

### 4.3. Mobile layout

Mobile layout:

- single column;
- no permanent side panels;
- URL input full width;
- CTA full width under input;
- toolbar actions stacked;
- diagnostics as Sheet or collapsed details;
- no horizontal scroll at `320px`.

Breakpoints to verify manually:

- `320px`
- `390px`
- `430px`
- `768px`
- `1024px`
- `1280px`
- `1440px`

---

## 5. Top bar

### 5.1. Purpose

The top bar confirms product identity, runtime status and access to diagnostics/docs.

It is not a hero section.

### 5.2. Content

Left side:

- `ytTranscript`
- optional small `demo` badge

Right side:

- provider status badge: `oMLX: online | degraded | offline`
- diagnostics button
- `Docs` link
- optional theme toggle if already implemented cleanly

### 5.3. Rules

- Height: approximately `56px`.
- Sticky at top.
- Compact.
- No giant centered logo as the dominant visual element.
- No marketing tagline in the top bar.
- Build number belongs in diagnostics or footer, not as the visual center of the empty state.

---

## 6. URL input section

### 6.1. Required elements

Use shadcn `Label`, `Input` and `Button`.

Label:

`Wklej link do filmu YouTube`

Placeholder:

`https://www.youtube.com/watch?v=...`

Helper text:

`Obsługiwane są standardowe linki YouTube i youtu.be.`

Primary CTA:

`Pobierz transkrypt`

Loading label:

`Pobieram…`

### 6.2. Error behavior

Errors appear inline under the input, not as floating toast spam.

Examples:

- `Wklej link do filmu YouTube.`
- `To nie wygląda na link do YouTube.`
- `Nie udało się pobrać transkryptu. Sprawdź link i spróbuj ponownie.`

### 6.3. Layout

Desktop:

- input and button in one row;
- button width stable;
- section width follows main column.

Mobile:

- input full width;
- button below input;
- button full width.

---

## 7. Empty state

### 7.1. Goal

The empty state should explain one action, not sell the whole application.

Recommended text:

`Wklej link do filmu YouTube, aby pobrać transkrypt.`

Optional subtext:

`Po pobraniu możesz zrekonstruować tekst, wygenerować streszczenie, eksportować plik albo użyć TTS.`

### 7.2. Avoid

Do not add:

- feature grid;
- sample dashboard;
- marketing hero;
- animated illustration;
- “AI magic” copy;
- product screenshots inside the product.

---

## 8. Transcript section

### 8.1. Purpose

The transcript is the primary content of the application.

It must be the most readable part of the UI.

### 8.2. Container

Use shadcn `Card` as one large reading container.

Recommended:

- max width: `720–840px`;
- padding: `24px` desktop, `16px` mobile;
- line length: `60–72ch`;
- body font size: minimum `16px`;
- line-height: `1.6`.

### 8.3. Header

Transcript card header may include:

- video title;
- transcript mode toggle;
- language badge;
- character count;
- optional duration;
- AI reconstruction metadata if available.

### 8.4. Mode control

Use `ToggleGroup` or simple accessible segmented control:

- `Surowy`
- `Rekonstrukcja AI`

Rules:

- Do not create nested tabs.
- Do not use tabs for every output type.
- If reconstruction is not available, keep the option disabled with clear reason or hide it until available.

### 8.5. Raw transcript mode

Raw transcript may show timestamps.

Timestamps:

- small;
- muted;
- mono;
- not visually dominant.

### 8.6. Reconstructed mode

AI reconstruction displays clean paragraphs.

No timestamp clutter by default.

Metadata badge:

`Rekonstrukcja AI • model • czas • tokeny`

### 8.7. Long transcript behavior

Preferred:

- natural page scroll.

Allowed:

- internal `ScrollArea` only if transcript length would otherwise make the whole app unusable.

Rejected:

- two independent competing scroll containers;
- scroll hijacking;
- automatic jumping to new output while user is reading.

---

## 9. Transcript action toolbar

### 9.1. Actions

After transcript is loaded, show these actions:

1. `Rekonstruuj z AI`
2. `Streszcz z AI`
3. `Eksportuj…`
4. `Czytaj na głos`

### 9.2. Visual hierarchy

After transcript is loaded, these are secondary actions of equal rank.

Do not show two huge competing CTAs.

### 9.3. Loading behavior

During one AI operation:

- disable conflicting actions;
- show running state on the active action;
- use lime only as small running indicator;
- do not stream tokens letter-by-letter;
- display final block when ready.

### 9.4. Concurrency

If user clicks `Rekonstruuj` and `Streszcz` quickly:

- either queue the second operation;
- or disable it until the first finishes.

No race conditions.

---

## 10. Summary section

### 10.1. Purpose

Summary is secondary to transcript but important for triage.

### 10.2. Container

Use `Card`.

Header:

`Streszczenie`

Metadata badge:

`Wygenerowano • model • czas • tokeny`

### 10.3. Content style

Use normal bullet list.

Rules:

- no decorative custom bullet icons;
- no emoji bullets;
- no long essay if summary was requested;
- no claim that summary is perfect.

### 10.4. Empty state

Before generation:

`Streszczenie pojawi się tutaj po kliknięciu „Streszcz z AI”.`

This can be hidden until transcript is loaded.

---

## 11. Language dialog

### 11.1. Component

Use shadcn `Dialog`.

### 11.2. Trigger

Triggered by AI reconstruction/summary when language choice is required.

### 11.3. Options

Recommended:

- `Zachowaj język oryginału`
- `Przetłumacz na polski`

Optional later:

- `Przetłumacz na niemiecki`
- `Przetłumacz na angielski`

Do not add a full language-management panel in v1.

### 11.4. Accessibility requirements

- Focus trap active.
- ESC closes dialog if operation has not started.
- Clicking overlay closes dialog if operation has not started.
- First option receives focus.
- Dialog title visible.
- Dialog description present.
- Buttons have text, not icons alone.

---

## 12. Export

### 12.1. Component

Use shadcn `DropdownMenu`.

Trigger:

`Eksportuj…`

Menu items:

- `TXT`
- `SRT`
- `Markdown`
- `PDF`

Optional if TTS exists:

- `WAV`

### 12.2. Behavior

Clicking an item starts download directly.

No internal preview for PDF or Markdown.

### 12.3. Error behavior

If PDF export fails:

`Nie udało się wygenerować PDF. Spróbuj TXT albo Markdown.`

If export times out:

`Eksport trwał zbyt długo. Spróbuj lżejszego formatu.`

---

## 13. TTS section

### 13.1. Component

Use `Card`, `Collapsible` or native `<details>` styled with shadcn tokens.

TTS should not dominate the interface.

### 13.2. Content

- title: `Czytanie na głos`
- language control: `pl | en | de`
- button: `Generuj audio`
- HTML5 audio player
- button: `Pobierz WAV`

### 13.3. Piper unavailable

Show `Alert` warning:

`Czytanie na głos wymaga lokalnego Piper. Szczegóły znajdziesz w dokumentacji.`

If useful for operator mode:

`Ustaw PIPER_BIN i PIPER_MODELS_DIR w .env.`

Do not show stack traces in the main UI.

---

## 14. Diagnostics

### 14.1. Component

Use shadcn `Sheet` or drawer opened from top bar.

Diagnostics are for the operator and portfolio reviewer, not the main user flow.

### 14.2. Required fields

Show:

- `Build`
- `Provider`
- `Model`
- `Fallback chain`
- `Cache: hit | miss`
- `Czas pobrania`
- `Czas rekonstrukcji`
- `Czas streszczenia`
- `Tokeny: in / out`
- `TTS status`
- `Public demo mode: on | off`

### 14.3. Privacy truthfulness

If active provider is local:

`Provider: oMLX lokalnie`

If active provider is cloud fallback:

`Provider: Mistral/Groq/FreeLLMAPI — fallback chmurowy`

Do not claim “local processing” if cloud fallback was actually used.

### 14.4. Styling

- monospace for values;
- muted text;
- compact rows;
- no charts;
- no dashboard cards.

---

## 15. Privacy/demo notice

### 15.1. Required placement

Visible in every state, preferably below URL input and above transcript/empty state.

Do not hide it in diagnostics.

### 15.2. Recommended copy

`Lokalne przetwarzanie. Transkrypty i zapytania do modelu są przetwarzane przez backend operatora. Pobranie transkryptu z YouTube wymaga połączenia z YouTube. To demonstrator, nie system produkcyjny.`

If cloud fallback is enabled:

`Uwaga: konfiguracja może użyć fallbacku chmurowego, jeśli lokalny provider nie odpowiada. Aktywny provider sprawdzisz w diagnostyce.`

### 15.3. Forbidden copy

Do not write:

- `100% prywatne`
- `RODO compliant`
- `pełna prywatność`
- `zero ryzyka`
- `nikt nie ma dostępu`
- `dane nigdy nie opuszczają przeglądarki`
- `dane nigdy nie opuszczają komputera`, unless cloud fallback is impossible and verified

### 15.4. Public demo warning

For public demo mode add:

`Nie wklejaj danych osobowych, poufnych ani zawodowych. Demo służy do pokazania wzorca workflow, nie do pracy produkcyjnej.`

---

## 16. Footer

Footer content:

`© 2026 Radosław Pleskot · ytTranscript`

Links:

- `Dokumentacja`
- `Security notes`
- `Known limitations`

Footer should be quiet, small and useful.

---

## 17. Motion and interaction

### 17.1. Allowed motion

- subtle hover background change;
- small translateY on buttons if already in preset;
- dialog/sheet open/close transitions from shadcn;
- spinner or small progress indicator.

### 17.2. Rejected motion

- typewriter output;
- animated blobs;
- parallax;
- glow effects;
- scroll hijacking;
- infinite loading without timeout;
- decorative micro-animation just because the developer got bored.

### 17.3. Reduced motion

Respect `prefers-reduced-motion`.

If reduced motion is active:

- remove transform animations;
- minimize transitions;
- replace spinner emphasis with text state where possible.

---

## 18. Microcopy

### 18.1. Tone

Tone is:

- concrete;
- calm;
- Polish-first;
- technically honest;
- short;
- without “AI magic” language.

### 18.2. Recommended messages

Fetch loading:

`Pobieram transkrypt…`

Transcript success:

`Transkrypt gotowy.`

Reconstruction loading:

`Rekonstruuję tekst za pomocą modelu…`

Summary loading:

`Generuję streszczenie…`

TTS loading:

`Generuję audio…`

No captions:

`Ten film nie ma dostępnych napisów.`

Invalid URL:

`To nie wygląda na link do YouTube.`

Fetch error:

`Nie udało się pobrać transkryptu. Sprawdź link i spróbuj ponownie.`

Model error:

`Model zwrócił błąd. Spróbuj ponownie albo sprawdź providera.`

Local provider offline:

`Lokalny provider nie odpowiada. Sprawdź konfigurację albo użyj fallbacku, jeśli jest włączony.`

Token limit:

`Model przekroczył limit tokenów. Spróbuj krótszego filmu albo przetwórz fragment.`

TTS unavailable:

`Czytanie na głos wymaga lokalnego Piper.`

Cache hit:

`Transkrypt wczytany z pamięci podręcznej.`

### 18.3. Avoid

Do not write:

- `100% accurate`
- `magic AI`
- `one click`
- `fully private`
- `enterprise-grade security`
- `RODO compliant`
- `inteligentnie wykrywamy wszystko`
- `najlepszy model`

---

## 19. Accessibility

Target: WCAG 2.2 AA-aware implementation.

Required:

- semantic HTML: `header`, `main`, `section`, `footer`;
- one `h1`;
- visible label for URL input;
- keyboard access for all controls;
- visible focus ring;
- dialog focus trap;
- ESC behavior for dialog/sheet;
- `aria-live="polite"` for operation status;
- no icon-only buttons without `aria-label`;
- touch target minimum `44×44px`;
- readable text at 200% zoom;
- no horizontal scroll at `320px`;
- states not communicated only by color;
- reduced motion respected.

Keyboard order:

1. Skip link.
2. Top bar controls.
3. URL input.
4. Fetch button.
5. Privacy notice links, if any.
6. Transcript mode control.
7. Transcript actions.
8. Summary actions/content.
9. TTS controls.
10. Footer links.
11. Diagnostics sheet controls when opened.

Manual checks after implementation:

- Tab through entire flow.
- Open and close language dialog with keyboard.
- Open and close diagnostics sheet with keyboard.
- Test mobile width `320px`.
- Check contrast for text, muted text, buttons, warnings and errors.

---

## 20. Required states

Every major UI area must handle these states:

- `EMPTY`
- `READY`
- `LOADING`
- `SUCCESS`
- `ERROR`
- `OFFLINE_OR_UNAVAILABLE`
- `OUT_OF_SCOPE`
- `LIMIT_REACHED`
- `PARTIAL_SUCCESS`

### 20.1. Edge cases to test

1. Empty URL.
2. Non-YouTube URL.
3. Valid YouTube URL without captions.
4. Auto-generated captions in another language.
5. Private or region-blocked video.
6. Local provider offline.
7. Local provider timeout.
8. Token limit exceeded.
9. Piper missing.
10. Cache hit.
11. Double-click on fetch.
12. Double-click on AI actions.
13. Very long transcript.
14. PDF export timeout.
15. Network error during YouTube transcript fetch.
16. AI returns empty output.
17. Very short video summary request.
18. Missing Piper model for selected language.
19. Unknown build version.
20. Public demo mode enabled.

Add these to `docs/LOCAL_SETUP.md` or a dedicated manual test checklist before public release.

---

## 21. Public demo readiness

### 21.1. Required before exposure

Before exposing at a public subdomain:

- verify no secrets are bundled into frontend;
- verify `.env` is not publicly accessible;
- verify CORS/allowed hosts;
- verify rate limiting;
- verify request size limits;
- verify transcript fetch failure handling;
- verify PDF export sanitization;
- verify no analytics/telemetry are enabled;
- verify provider truthfulness in diagnostics;
- verify demo notice appears in every state;
- verify logs do not store full transcripts unnecessarily;
- verify public demo mode disables or limits abusive inputs.

### 21.2. Recommended public demo mode

Use one of the following strategies:

Option A — safest:

- provide 2–3 demo URLs;
- allow user to test only those;
- block arbitrary URLs.

Option B — controlled:

- allow arbitrary YouTube URLs;
- add rate limits;
- add max transcript length;
- add timeout;
- add clear warning not to use sensitive data.

Option C — screenshot-only:

- use static screenshots in portfolio;
- link to GitHub/docs;
- keep live app private.

For current portfolio momentum, Option B is acceptable only if hardening is finished. Option A is safer and easier.

---

## 22. Anti-patterns

Reject:

- permanent sidebar;
- finance dashboard layout;
- charts;
- bento grid;
- masonry card layout;
- “recent transactions” style sections;
- account/settings demo blocks;
- marketing hero;
- feature grid;
- chat interface;
- model marketplace;
- multi-user accounts;
- authentication UI in v1;
- cookie banners when there are no cookies;
- analytics;
- telemetry;
- glassmorphism;
- neon glow;
- animated blobs;
- parallax;
- typewriter output;
- decorative LLM avatars;
- confetti;
- fake progress percentages;
- dark pure black with pure white text;
- random colors outside preset tokens.

---

## 23. What to preserve from current UI

Preserve:

- simple one-screen mental model;
- dark theme direction;
- clear URL-first flow;
- existing transcript/summary separation;
- modal language choice pattern;
- export/TTS as optional actions;
- local-first narrative;
- build/version visibility, but move it to diagnostics/footer;
- minimal visual density.

---

## 24. What to change from current UI

Change:

- reduce hero/header size;
- replace custom controls with shadcn components where useful;
- add visible input label;
- add privacy/demo notice;
- add provider status in top bar;
- move build/version from central empty state to diagnostics/footer;
- replace export buttons with dropdown;
- replace language modal with shadcn Dialog;
- add diagnostics Sheet;
- unify loading/error/disabled states;
- improve keyboard accessibility;
- verify mobile at `320px`.

---

## 25. Implementation phases

### Phase 1 — Token + component adoption

- Install/apply shadcn preset.
- Map tokens.
- Replace button/input/dialog/dropdown/sheet/badge/alert primitives.
- Preserve existing flow.

### Phase 2 — Layout cleanup

- Compact top bar.
- URL form with label/helper/error.
- Privacy notice.
- Transcript card.
- Summary card.
- TTS collapsible/card.
- Diagnostics sheet.

### Phase 3 — State hardening

- Loading states.
- Disabled states.
- Error states.
- Provider offline state.
- Token limit state.
- PDF export failure.
- Piper unavailable.

### Phase 4 — Demo readiness

- Manual accessibility pass.
- Mobile screenshots.
- Public demo warning.
- Security checklist.
- Portfolio screenshots.
- Known limitations link.

---

## 26. Screenshot set for portfolio

Capture after implementation:

Desktop `1280px`:

1. Empty state.
2. Transcript loaded.
3. Reconstruction running.
4. Reconstruction complete.
5. Summary generated.
6. Language dialog.
7. Export dropdown.
8. Diagnostics sheet.
9. Error state.
10. Provider offline warning.

Mobile `390px`:

1. Empty state.
2. Transcript loaded.
3. Toolbar stacked.
4. Summary generated.
5. Diagnostics sheet.

Mobile `320px`:

1. URL form.
2. Transcript card.
3. Summary card.
4. Error state.

---

## 27. Acceptance criteria

The redesign is accepted only if:

1. The app still has one simple flow.
2. The transcript remains the main visual object.
3. No dashboard layout appears.
4. No permanent sidebar appears.
5. No charts appear.
6. shadcn components improve accessibility without changing product scope.
7. URL input has label, helper and inline errors.
8. Provider status is visible.
9. Privacy/demo notice is visible in every state.
10. Language choice uses accessible dialog.
11. Export uses dropdown.
12. Diagnostics are hidden in Sheet/drawer.
13. Mobile `320px` has no horizontal scroll.
14. Reduced motion is respected.
15. No claims exceed the actual provider/runtime configuration.
16. Public demo mode has rate limiting or restricted demo URLs.
17. No analytics/telemetry are introduced.
18. README/docs screenshots match the final UI.

---

## 28. Final instruction for implementers

Apply the shadcn Rhea preset as a **controlled component and token upgrade**.

Do not redesign the product into a dashboard.

Do not add new product features.

Do not import the preset demo structure.

The final result should say:

> “This is a focused privacy-aware AI workflow demo that turns messy YouTube captions into readable text.”

It should not say:

> “Someone found a beautiful dashboard template and then panicked creatively.”
