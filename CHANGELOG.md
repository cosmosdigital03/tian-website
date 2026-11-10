# TIAN website changelog

Changes to the public website at https://tianvpn.com/ (this repository only). The iPhone app, servers and infrastructure have their own history in the private TIAN project and are not tracked here.

Newest first. Dates are commit dates. An entry records what changed in source, not a guarantee of how the live site looks today.

## 2026-11-10 - Motion and type layer on the restored homepage (branch `restore-before-story`)

Built from a draft the owner approved on Superdesign. Published on 2026-11-10 at the owner's instruction after a preview.

- New files `motion.css` and `motion.js`, linked from `index.html` after `premium.css` and after the existing scripts. `premium.css`, `app.js` and every word and picture on the page are unchanged. With the two files unlinked the page is the restored homepage again.
- New file `fonts.css`, shared by all five pages (homepage, Support, Privacy, Terms and the error page). It declares the two font files and the two stacks once. Support and the error page pick them up through `styles.css`, Privacy and Terms through a short block at the end of their own styles. Headings there are now medium weight like the homepage, and reading text is the serif at 15 to 16.5px. The reproduced licence text in the Terms stays monospaced. No wording on any page changed.
- Type: headlines and interface text name Styrene first, reading text names Tiempos first (the owner's choice). Both are licensed and are not shipped. Their stand-ins are served from this site: `assets/fonts/dm-sans-latin.woff2` (DM Sans, variable weight and optical size, 62,724 bytes, SHA-256 `ca72d2bcea8f4daa783dbdfa2d9b46068c3ce38168e05918fb867aa453b4f890`) and `assets/fonts/source-serif-4-latin.woff2` (Source Serif 4, variable weight, 50,936 bytes, SHA-256 `382475f38242c52d42a3e5ff8dc69b5d73f10d0d21e4550b5fe232984688779a`). They are the Latin subsets from Fontsource, fetched through jsDelivr with the owner's approval; the SIL Open Font License texts from the Google Fonts repository are in `licenses/`. No font service is contacted. Reading text is larger, 14.5 to 17.5px.
- Hero: the two picture cards no longer slide down over the sentence above them. They stay in their wells. One point of light travels You, Identity, Destination, Web on a 10 second loop, and the two views light up in turn, never together. "You" and "Web" are the only words the layer adds to the page.
- Header: a reading-progress line, and a marker under the link of the section in view.
- How it works: the two shield tabs advance by themselves every 6 seconds while in view, with a progress line on the active tab, and stop for good on a click or key press. The matching shield card is highlighted and the panel text cross-fades.
- Live footprint: a value shimmers only while the page itself reports "Checking…" and settles when the real value arrives. The script reads those values and never writes them.
- Details: headings rise line by line, sections reveal once with a short stagger, platform and promise icons draw themselves, cards answer the pointer, questions open and close smoothly, the comparison table gets three small route drawings above its column titles and a highlighted TIAN column, and the phone menu fades in.
- Safety rails: every animation and every hidden-until-revealed state requires `motion-enabled`, so the Pause motion button and the reduced-motion preference show the finished page. No scroll takeover, nothing stored, no request to another host.
- Tests: 111 of 111 pass (`node --test tests/*.test.cjs`). 15 are new: 10 in `tests/motion.test.cjs` and 5 in `tests/fonts.test.cjs`. Three test titles in `information-story.test.cjs` now say that they describe the base stylesheet.
- Reviewed in a browser on 2026-11-09 at 1090x909 and 375x812, all five pages: both fonts load from this site, the only outside request is the homepage's existing IPWHOIS lookup, no console errors, no sideways scrolling. The working copy was then lost in a restart and rebuilt on 2026-11-10 from the same commits, the saved draft and the same font files (identical hashes); the rebuilt copy passed the tests and a text comparison but was not reviewed in a browser again before publishing.
- Known gaps: not seen on a real phone, and the motion has not been watched end to end at full speed. Tiempos and Styrene need web licences before they can be shipped. On phones a row of "=" signs in the Terms licence text runs past the edge of its box; that was already so before this change.

## 2026-11-10 - Back to the site from before the Story (branch `restore-before-story`)

Asked for by the owner, who confirmed it after a preview. Published together with the entry above.

- The homepage, its stylesheet, the Support, error and Privacy pages, the README and the tests are back to how they were at commit `7538a05` (2026-11-08), the last one before the cinematic scroll story.
- Removed with the story: `story.js`, `story.css`, `topics.js`, the separate pages `how-it-works.html`, `footprint.html`, `platforms.html` and `compare.html`, and the self-hosted Inter font with its licence and build script. The menu jumps to sections of the homepage again.
- Kept: the DNS filter list credits in the Terms (next entry). `terms.html` is the `7538a05` page plus those credits.
- One fix on top, on Support and the error page: the logo no longer sits over the name. `styles.css` gives the phone header a 34px logo and gives the footer logo room beside the name.
- The Android glass diamond tried on the story on 2026-11-09 was rejected by the owner and never committed.
- Known gap: outside links to the four removed pages will land on the error page.

## 2026-11-09 - DNS filter list credits in the Terms (branch `dns-list-credits`)

Added at the owner's request.

- Terms, section 11 (Open-Source & Third-Party Notices): ten new entries credit the lists TIAN's DNS filtering is assembled from. AdAway (CC BY 3.0) and Tiuxo (CC BY 4.0) carry their attribution and what TIAN changes; Steven Black, AdGuard CNAME Trackers, Anudeep, FadeMind, Badd Boyz Hosts and hostsVN are MIT; ShadowWhisperer is public domain; HaGeZi's Apple list (GPL-3.0) is named as used on servers only.
- The MIT License text already on the page now lists those six copyright holders next to Rive and Jakub Antalik.
- Nothing else on the page changed, including the Effective Date.

## 2026-11-08 - Frosted glass diamonds, phone layout and reading type (branch `story-phone-diamond`)

Published with the owner's approval after a preview.

- Entry and Exit: the same eight-sided diamond as before, rebuilt in frosted glass on phone and desktop. What sits behind it is really blurred (shrunk and enlarged, so it works in Safari, which has no canvas filters), with a milky body, a fine sandblasted grain, a soft light inside and a thin bright rim. A realistic cut stone was tried first and rejected by the owner.
- Gate graphics: a cleaner instrument ring with fine ticks, an orbit that passes behind and in front of the diamond, and rings that always face the viewer, so the two shields in "Two separate views" are round and exactly level.
- Phone layout, rebuilt: the scene fills the whole space between the header and the words on every slide, centred, nothing cut off and nothing behind the text. The words sit on solid ground at the bottom. Progress dots moved into one row with Skip and Pause. Each shield's label rests on its ring. Short phones drop secondary items. Header is slimmer. The stage now reaches the bottom of the screen, and when Safari's toolbar shrinks the words and controls glide down into that room instead of leaving an empty strip. Slide text no longer overlaps while changing. On slide 01 the camera looks straight at the phone so it sits square to the screen.
- Last slide: the whole Exit shield sits above the network instead of being cut by the header, and the Entry shield and phone are gone by then. On wide screens moving graphics fade before the text column and the network labels are placed where there is room.
- The route now appears one leg at a time, so no stray line hangs near the phone.
- Reading type: all information text is Inter, served from this site (`assets/fonts/inter-latin.woff2`, built from the Inter 4.001 file in the TIAN project by `scripts/build-web-font.cjs`, licence in `licenses/Inter-OFL.txt`), so no font service sees a visitor. Bold headings are unchanged. Sizes and contrast raised across the site: body text 16px or larger, labels at least 12px.
- Support and the error page now use the shared header, phone menu, footer and stylesheet; the logo no longer overlaps the name on phones. The topic bar now brings the current tab fully into view.
- Tests: 108 of 108 pass (`node --test tests/*.test.cjs`). The "no remote fonts" test now allows exactly one self-hosted font file.
- Reviewed in a browser at 375x812, 390x664, 375x553 and 1280x800: all six slides at each phone size; how-it-works, footprint, compare, support, 404 and privacy at phone width; how-it-works, footprint, compare, support on desktop. Also opened in Safari on an iPhone 17 simulator (iOS 26.5): hero and all five slides, touch swipes, toolbar expanded and collapsed.
- Known gaps: real-device scroll feel; `styles.css` is no longer linked by any page and can be removed.

## 2026-11-08 - Cinematic homepage and separate pages (branch `cinematic-redesign`, published through pull request 7)

Same palette as the existing site.

- Homepage is a scroll-driven story: the camera follows a connection from the device, through the Entry shield (who you are), to a wide view of two points and two information views, then the Exit shield (where you go) and down to the open internet. Built in `story.js` and `story.css` with no libraries.
- Graphics pass after owner feedback: the phone is now a rounded titanium body with a glass screen showing a stylised TIAN screen (illustration only, not a screenshot of the app); each shield has a segmented gate, glass lens, crystal core, orbiting satellites, ground pedestal and light column. Entry takes connections in, Exit sends them onward.
- "Two points, two views": both shields sit side by side beside the text with labelled cards (Entry sees your IP, not where you go; Exit sees where you go, not your IP) and a bracket marked "One seamless connection". Every chapter is framed in the area the text leaves free, so no words sit behind a shield, on desktop or phone.
- Scroll feel: camera follows with a critically damped spring (no wobble), story is shorter (640vh desktop, 560vh phone), and a gentle magnet eases onto a chapter when scrolling stops close to it. Chapter dots use the same eased scroll.
- Navigation opens real pages: `how-it-works.html`, `footprint.html`, `platforms.html`, `compare.html`. Every topic page has a sticky topic bar (All topics plus the four tabs, scrolls sideways on phones) and a "Keep exploring" section with the other three topics, so you can always pick another topic.
- Controls: chapter dots, "Skip the story", Pause motion. Reduced-motion, no-JavaScript and no-canvas visitors get the six chapters as stacked sections.
- Second feedback pass: the phone screen now follows the real iOS Home screen (header, status row, dotted globe, headline and subtitle, route labels, destination card, Disconnect button, glass tab bar), shown in the protected state; the exit address and timer on it are example values. Chapter 3 is now "Two separate views" with the owner's wording, and the line "Illustration of what each shield can see, not a packet-by-packet path." was removed at the owner's request (the privacy page still carries the connection-snapshot limits). The "One seamless connection" bracket now rises from the foot of each shield's pedestal. The open-internet scene is a clustered neural-style network whose signals fire from node to node.
- Scroll control: a hard scroll (fast wheel burst, Page Down, Space, arrow keys) moves exactly one chapter and then holds, while slow scrolling stays native and smooth; leaving the story at either end is never blocked. On touch screens each chapter is a native snap point that cannot be skipped. The camera also has a speed limit. After owner testing with a mouse wheel (hard scroll felt stuck, slow scroll felt floaty): the hold now ends as soon as a move finishes for mouse input, a move takes about half a second, the idle magnet was removed, and the camera follows more tightly; a steady 3-second spin now advances about one slide every 0.55 s and slow single notches are left alone. Wheel thresholds were checked with synthetic events in a desktop browser only; trackpad inertia and phone flings still need a real-device check.
- Chapter 5: a far-away grid was tried and rejected by the owner, who only wanted smaller, more widely spaced dots. It is back to the clustered, brain-like network with fewer nodes (150), a minimum gap between any two dots, smaller dots and glows, and the camera slightly further back.
- Scroll gravity (owner request): after the user stops scrolling, a slide within about 30% of the gap either side draws the page in with a slow exponential glide that strengthens with closeness (zero at the edge of the zone, strongest at the slide); the middle of each gap is a dead zone and is never touched; user input always wins. Simulated check on desktop: from 0.045 away the page glides in over about 2.5 s, from 0.012 away in about 1.2 s, and the dead zone did not move. Touch screens keep native snapping instead. Also, the phone now holds its forward-facing pose after slide 01 instead of continuing to follow the camera.
- Owner feedback round: through chapter 1 the phone now turns from its opening angle to face the viewer squarely (yaw and tilt follow the camera), and in chapter 5 the soft glowing, twinkling dots were replaced by crisp ones: steady small nodes, a sharp white flash plus a thin expanding ring and fainter echo where a signal lands, sharp signal heads with short straight tails, and solid double-ring hubs.
- Chapter 1 ("It starts with you"): the phone is now framed fully in the free area beside the text, the Entry shield appears later so it no longer crowds the scene, and the story is shorter (520 screens on desktop, 470 on phones) with the first camera move starting sooner, so less scrolling is needed before the scene tracks.
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
