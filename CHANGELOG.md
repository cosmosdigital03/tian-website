# TIAN website changelog

Changes to the public website at https://tianvpn.com/ (this repository only). The iPhone app, servers and infrastructure have their own history in the private TIAN project and are not tracked here.

Newest first. Dates are commit dates. An entry records what changed in source, not a guarantee of how the live site looks today.

## 2026-11-09 - Cinematic homepage and separate pages (preview branch `cinematic-redesign`)

Not published until the owner approves. Same palette as the existing site.

- Homepage is now a scroll-driven story: the camera follows a connection from the device, through the Entry shield (who you are), to a wide view of two points and two information views, then the Exit shield (where you go) and down to the open internet. Opening line: "TIAN is a private network that separates who you are from where you go." Built in `story.js` and `story.css` with no libraries.
- Navigation now opens real pages instead of scrolling one page: `how-it-works.html`, `footprint.html`, `platforms.html`, `compare.html`. Each has one h1, the current page is marked, and old in-page links in support, privacy, terms and 404 point to the new pages.
- Story controls: chapter dots, "Skip the story", Pause motion; reduced-motion, no-JavaScript and no-canvas visitors get the six chapters as stacked sections.
- Tests: 100 of 100 pass (`node --test tests/*.test.cjs`). Connection, tab and ID tests now run against the page that owns the content; the retired hero-illustration tests were replaced by story tests.
- Reviewed in a browser at about 900px wide and 375px wide for the homepage, plus the how-it-works and footprint pages. Not reviewed: support, privacy, terms and 404 at phone width, tablet, wide desktop above 1400px, Safari and Firefox, real devices, performance on older phones.
- Known gaps: leftover CSS from the old hero remains in `premium.css`; the two-points shot is tuned by eye and may need adjustment on very wide or very short windows.

## 2026-11-08 - UI/UX refinement pass

Commit df517f5 (premium.css, additive CSS only).

- Hero diagram label ("Identity and destination, never held in one place.") now fits on one line on phones instead of overlapping the cards.
- Touch targets: text links, footer links, mobile menu items, FAQ and footprint toggles are at least 44-48px tall.
- Small text raised to 11px or larger on phones (labels, captions, table text, connection details); 10px minimum for desktop captions.
- Inline links are underlined; buttons show a pressed state; clearer focus offset.
- Validation: 96 of 96 tests passed (node --test tests/*.test.cjs); phone-width check of the homepage in a browser. Not yet reviewed: support, privacy, terms and 404 pages, tablet width, real devices.
- Published directly to main (no preview branch).

## 2026-11-04

- Added TIAN homepage favicon (857a7cb).
- Updated website illustrations (723f62f).

## 2026-11-03

- Redesigned website: clay-diorama artwork, bold typography, glow cards, coming-soon platforms (7b9aec6).

## 2026-11-01 to 2026-11-02

- Published TIAN terms and privacy policies, later replaced the privacy page with the supplied policy and pointed links to it (e49f9e8, 90a9a6f, 0af803d).
- Added third-party notices to terms (dce3f39).
- Added Google site verification file (1e53767).

## 2026-10-29

- Aligned layout and neutralized provider references (#4), simplified the connection snapshot (#5), updated branding, motion and connection snapshot (#6).
