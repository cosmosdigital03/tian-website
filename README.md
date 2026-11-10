# TIAN website

The public, static TIAN coming-soon website at https://tianvpn.com/.

## Development

No build step or third-party JavaScript dependencies are required. Serve the repository root with a local static server, for example:

```sh
python3 -m http.server 8000
```

The homepage uses `premium.css` and `app.js`, with `motion.css` and `motion.js` layered on top for type and motion. Support and the error page use the shared `styles.css` stylesheet; Privacy and Terms carry their own styles. Every page links `fonts.css` first. The header and footer use the supplied TIAN emblem. The Solving orb adapts Thinking Orbs under the MIT license; see `licenses/thinking-orbs-MIT.txt`.

Fonts on every page come from `fonts.css`: headlines and interface text name Styrene first, reading text names Tiempos first. Both are licensed fonts and are not shipped here, so visitors without them see the stand-ins DM Sans and Source Serif 4, which are served from this site (`assets/fonts/`, SIL Open Font License texts in `licenses/DMSans-OFL.txt` and `licenses/SourceSerif4-OFL.txt`). No font service is contacted. Do not add Styrene or Tiempos files without web licences. Each page keeps a system font stack underneath as the fallback.

The motion layer is an enhancement. Every loop and entrance runs only while `app.js` has set `motion-enabled`, so the Pause motion button and the reduced-motion preference show the finished page; with scripts off the page is complete and still. It never takes over scrolling. In the hero the two picture cards stay inside one shared-service frame; one point of light stands for the single connection passing the Identity view and then the Destination view, and the two views light up in turn, never together. It does not show separate packet paths or payload reassembly. The live footprint values shimmer only while the page itself reports "Checking…".

## Tests

Run the complete dependency-free Node test suite (verified with Node 24):

```sh
node --test tests/*.test.cjs
```

The tests cover device/network classification, privacy recognition, automatic connection-check lifecycle and stale-response handling, UI keyboard interactions, reduced-motion preferences, mobile navigation, local reference integrity, the motion layer's contract (opt-in motion, no outside requests, no scroll takeover), and the shared fonts (served from this site on every page, with their licences). VM/static tests supplement rather than replace responsive browser review.

## Connection snapshot

The connection snapshot presents IP, network, approximate location, device, and browser first; additional details remain available in an expandable section.

The page automatically requests the current public IP and approximate network details from the existing IPWHOIS.io endpoint. Requests omit credentials and a referring-page URL, bypass the browser cache, and time out after eight seconds. Device results stay in the page; the site adds no analytics, cookies, tracking ID, or persistent result storage.

There are no Refresh, Clear, or reveal controls. Browser history restoration and reconnect refresh the snapshot. Returning to a visible tab may refresh after a 30-second cooldown. Supported browser network-change events immediately clear stale network results and coalesce a new check after the cooldown. Rate limits are respected, failures do not cause retry loops, and there is no periodic polling. Not every VPN switch is detectable by a website.

Provider names matching a particular competitor are withheld from the displayed connection snapshot; an exact lookup match is described neutrally and does not verify protection.

See [the privacy overview](https://tianvpn.com/privacy.html#connection-preview) for processing and recognition limits.

## Publishing

The existing GitHub Pages workflow deploys `main`. Run the complete tests and review desktop/mobile rendering, links, animation controls, and true loading/failure states before promotion. Preserve concurrent changes, use normal fast-forward commits, and verify the exact commit's Pages deployment and the live site. Temporary noindex preview files must be removed when a redesign is promoted. Do not add private app/server source or credentials to this repository.
