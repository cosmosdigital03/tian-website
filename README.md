# TIAN website

The public, static TIAN coming-soon website at https://tianvpn.com/.

## Development

No build step or third-party JavaScript dependencies are required. Serve the repository root with a local static server, for example:

```sh
python3 -m http.server 8000
```

The homepage uses `premium.css` and `app.js`. Support, privacy, and error pages retain the shared `styles.css` stylesheet. Illustrations are original inline SVG and CSS; fonts are supplied by the visitor's system.

## Tests

Run the complete dependency-free Node test suite (verified with Node 24):

```sh
node --test tests/*.test.cjs
```

The tests cover device/network classification, privacy recognition, automatic connection-check lifecycle and stale-response handling, UI keyboard interactions, reduced-motion preferences, mobile navigation, and local reference integrity. VM/static tests supplement rather than replace responsive browser review.

## Connection snapshot

The page automatically requests the current public IP and approximate network details from the existing IPWHOIS.io endpoint. Requests omit credentials and a referring-page URL, bypass the browser cache, and time out after eight seconds. Device results stay in the page; the site adds no analytics, cookies, tracking ID, or persistent result storage.

There are no Refresh, Clear, or reveal controls. Browser history restoration and reconnect refresh the snapshot. Returning to a visible tab may refresh after a 30-second cooldown. Supported browser network-change events immediately clear stale network results and coalesce a new check after the cooldown. Rate limits are respected, failures do not cause retry loops, and there is no periodic polling. Not every VPN switch is detectable by a website.

See [the privacy overview](https://tianvpn.com/privacy.html#connection-preview) for processing and recognition limits.

## Publishing

The existing GitHub Pages workflow deploys `main`. Run the complete tests and review desktop/mobile rendering, links, animation controls, and true loading/failure states before promotion. Preserve concurrent changes, use normal fast-forward commits, and verify the exact commit's Pages deployment and the live site. Temporary noindex preview files must be removed when a redesign is promoted. Do not add private app/server source or credentials to this repository.
