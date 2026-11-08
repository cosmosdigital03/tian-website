# TIAN website changelog

Changes to the public website at https://tianvpn.com/ (this repository only). The iPhone app, servers and infrastructure have their own history in the private TIAN project and are not tracked here.

Newest first. Dates are commit dates. An entry records what changed in source, not a guarantee of how the live site looks today.

## 2026-11-09 - Cinematic homepage and separate pages (preview branch `cinematic-redesign`)

Not published until the owner approves. Same palette as the existing site.

- Homepage is a scroll-driven story: the camera follows a connection from the device, through the Entry shield (who you are), to a wide view of two points and two information views, then the Exit shield (where you go) and down to the open internet. Built in `story.js` and `story.css` with no libraries.
- Graphics pass after owner feedback: the phone is now a rounded titanium body with a glass screen showing a stylised TIAN screen (illustration only, not a screenshot of the app); each shield has a segmented gate, glass lens, crystal core, orbiting satellites, ground pedestal and light column. Entry takes connections in, Exit sends them onward.
- "Two points, two views": both shields sit side by side beside the text with labelled cards (Entry sees your IP, not where you go; Exit sees where you go, not your IP) and a bracket marked "One seamless connection". Every chapter is framed in the area the text leaves free, so no words sit behind a shield, on desktop or phone.
- Scroll feel: camera follows with a critically damped spring (no wobble), story is shorter (640vh desktop, 560vh phone), and a gentle magnet eases onto a chapter when scrolling stops close to it. Chapter dots use the same eased scroll.
- Navigation opens real pages: `how-it-works.html`, `footprint.html`, `platforms.html`, `compare.html`. Every topic page has a sticky topic bar (All topics plus the four tabs, scrolls sideways on phones) and a "Keep exploring" section with the other three topics, so you can always pick another topic.
- Controls: chapter dots, "Skip the story", Pause motion. Reduced-motion, no-JavaScript and no-canvas visitors get the six chapters as stacked sections.
- Second feedback pass: the phone screen now follows the real iOS Home screen (header, status row, dotted globe, headline and subtitle, route labels, destination card, Disconnect button, glass tab bar), shown in the protected state; the exit address and timer on it are example values. Chapter 3 is now "Two separate views" with the owner's wording, and the line "Illustration of what each shield can see, not a packet-by-packet path." was removed at the owner's request (the privacy page still carries the connection-snapshot limits). The "One seamless connection" bracket now rises from the foot of each shield's pedestal. The open-internet scene is a clustered neural-style network whose signals fire from node to node.
- Scroll control: a hard scroll (fast wheel burst, Page Down, Space, arrow keys) moves exactly one chapter and then holds, while slow scrolling stays native and smooth; leaving the story at either end is never blocked. On touch screens each chapter is a native snap point that cannot be skipped. The camera also has a speed limit. After owner testing with a mouse wheel (hard scroll felt stuck, slow scroll felt floaty): the hold now ends as soon as a move finishes for mouse input, a move takes about half a second, the idle magnet was removed, and the camera follows more tightly; a steady 3-second spin now advances about one slide every 0.55 s and slow single notches are left alone. Wheel thresholds were checked with synthetic events in a desktop browser only; trackpad inertia and phone flings still need a real-device check.
- Chapter 5 is now a far-away, evenly spaced network grid (two layers, about 130 nodes) with signals travelling between neighbours, shown from above with the whole journey in view; the shields fade behind it.
- Tests: 102 of 102 pass (`node --test tests/*.test.cjs`).
- Reviewed in a browser at about 900px wide and 375px wide: homepage chapters, how-it-works, platforms, footprint (lookup worked). Not reviewed: support, privacy, terms and 404 at phone width, tablet, wide desktop above 1400px, Safari and Firefox, real devices, performance on older phones, touch-scroll feel of the magnet on a real phone.
- Known gaps: leftover CSS from the old hero remains in `premium.css`; the screen shown on the phone model is a design sketch and should be replaced with a real app screenshot when approved.

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
