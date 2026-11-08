# TIAN website changelog

Changes to the public website at https://tianvpn.com/ (this repository only). The iPhone app, servers and infrastructure have their own history in the private TIAN project and are not tracked here.

Newest first. Dates are commit dates. An entry records what changed in source, not a guarantee of how the live site looks today.

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
