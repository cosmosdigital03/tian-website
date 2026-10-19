# Connection check and website analytics

Updated October 19, 2026.

## Implemented visitor check

- The existing static GitHub Pages site now includes an optional public-IP, network-provider, and device reveal.
- The full check makes one visitor-initiated HTTPS request to IPWHOIS.io. Browser-only mode skips that request. There is no background lookup, polling, provider fallback chain, or arbitrary-IP query input.
- The request includes only a fixed field-selection query. It uses credentials: omit, referrerPolicy: no-referrer, and cache: no-store. The remote service still sees the request IP, Origin, and ordinary browser request metadata.
- Displayed network fields: IP, derived address family, provider/ISP, network owner, ASN, and city/region/country estimate. Consumer aliases retain the original network listing. The visible provider can be an ISP, mobile operator, corporate gateway, or relay/cloud network; it is not proof of the customer's billing provider.
- Device family, optional reported model, browser, OS family, screen dimensions, language, and time zone are derived locally after a click. The only optional high-entropy hint requested is model; it stays in the page. Exact iPhone models and frozen OS versions are not invented.
- No analytics, fingerprint hash, tracking ID, GPS, browser storage, cookie, or TIAN result database is added. Existing hosting/security request processing remains separate from the VPN service.
- Clear aborts an in-flight lookup, discards page results, and prevents late responses or hints from restoring them. Page exit clears results, and an offline event invalidates network data.
- Results show when the check ran. Visitors can rerun it after changing networks or VPN settings. This is a point-in-time visibility check, not a VPN-status or breach detector.
- The lookup times out after eight seconds. Failures preserve browser details and are not classified as protected/unprotected. HTTP 429 pauses further requests in that page according to Retry-After when available.

## Provider and disclosure

Provider documentation reviewed October 19, 2026:

- https://ipwhois.io/documentation — HTTPS, CORS, selective response fields, errors, and free-domain limit of 1,000 requests/day. No uptime SLA applies to the free endpoint.
- https://ipwhois.io/ — FAQ explicitly permits use on commercial websites, including the Free plan.
- https://ipwhois.io/terms — limited visitor-self integration; no data resale, bulk dataset, arbitrary-IP search, or redistribution service is provided here.
- https://ipwhois.io/privacy — the provider processes requests under its own policy. Do not promise zero provider logging.

The homepage identifies the provider and request processing before the full-check button is used. privacy.html#connection-preview describes the full check, browser-only path, model hint, clearing, and separate provider handling. An API key or paid account is not configured in client source. If traffic reaches the shared free quota, arrange a suitable provider plan or first-party backend before expanding this feature; keep result persistence off unless separately scoped.

## Validation

Run with a supported Node.js runtime:

    node tests/connection-device.test.cjs
    node tests/connection-network.test.cjs
    node tests/connection-flow.test.cjs

33 focused tests passed: 15 device cases, 7 network-normalization cases, and 11 interaction/request lifecycle cases. Interaction tests include multiple failure fixtures and use a minimal DOM harness; they do not substitute for rendered browser QA.

JavaScript syntax checks, unique HTML IDs, local paths/anchors, accessible control targets, script loading order, and git diff whitespace checks passed. An independent source review covered responsive CSS, request sequencing, visitor-data handling, and claims. Rendered browser and screen-reader QA could not be exercised because the supported browser tool was unavailable. A direct HTTPS smoke check of the exact production lookup URL with Origin: https://tianvpn.com returned HTTP 200, success: true, all required response fields, and Access-Control-Allow-Origin: *. The existing public TIAN website also returned HTTP 200. These checks ran from the verification environment, not the user's device.

## Website analytics remains separate

The prior goal to measure website traffic, avoid selling data, and enforce 30-day deletion for retained analytics is not implemented by this display-only check. No analytics endpoint or retention job is enabled.

Before adding retained website analytics, define the provider/backend, necessary data, access rules, notice/consent behavior, and server-side deletion policy, including exports and backups. Prefer aggregate page counts; do not retain the displayed browser bundle or raw IP by default. Update the public notice to match the deployed implementation.

