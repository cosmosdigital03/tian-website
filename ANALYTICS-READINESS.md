# Connection check and website analytics

Updated October 19, 2026.

## Implemented visitor check

- The existing static GitHub Pages homepage automatically displays a visitor's public-IP, network-provider, local device details, and evidence-based network recognition.
- One automatic HTTPS self lookup runs on entry through the existing IPWHOIS.io endpoint. Refresh makes a new lookup. Returning from browser history refreshes results that were visible before leaving; reconnecting after an offline event refreshes visible results. There is no periodic polling, automatic error retry, provider fallback chain, or arbitrary-IP query input.
- The request includes only a fixed field-selection query. It uses `credentials: omit`, `referrerPolicy: no-referrer`, and `cache: no-store`. The remote service still sees the request IP, Origin, and ordinary browser request metadata. Device results are not appended to the request.
- Displayed network fields: IP, derived address family, provider/ISP, network owner, ASN, network type, and city/region/country estimate. Familiar aliases retain the original network listing. A visible owner can be an ISP, mobile operator, corporate gateway, or relay/cloud network; it does not necessarily identify the customer's billing provider or VPN brand.
- Device family, optional reported model, browser, OS family, screen dimensions, language, and time zone are derived locally when the check starts. The only optional high-entropy hint requested is `model`; it stays in the page. Exact iPhone models and frozen OS versions are not invented.
- No analytics, fingerprint hash, tracking ID, GPS, browser storage, cookie, or TIAN result database is added. Existing hosting/security request processing remains separate from the VPN service.
- Clear aborts an in-flight lookup, discards page results, and prevents late responses or hints from restoring them. A deliberate clear is respected on back/forward restoration and reconnection. Page exit clears results; an offline event invalidates the previous IP and privacy classification.
- Results show the check time. Visitors should use Refresh after changing networks or VPN settings if the browser did not report an offline/reconnection event. It is a snapshot of the lookup's route, not a continuous status monitor.
- The lookup times out after eight seconds. Failures preserve browser details and remove prior network conclusions. HTTP 429 pauses further requests in that page according to `Retry-After` when available. No request is attempted while the browser reports it is offline.

## Fair network recognition

`connection-network.js` normalizes the API response and recognizes a narrow set of network owners. `connection-privacy.js` interprets that evidence locally:

1. A match to a configured TIAN public **exit** address identifies that exit; the Entry address is never treated as an exit. This matches an address, not a cryptographic proof of an active TIAN tunnel.
2. An unexpired match in Apple's official Private Relay IPv4/IPv6 ranges, or an explicit corresponding organization name, identifies the relay.
3. An explicit recognized VPN service name in the network listing can identify that service. Generic hosting/reseller names do not establish a VPN. Recognition will not cover every VPN or custom server.
4. Known Amazon/AWS or DigitalOcean ASN/name evidence identifies a server/hosting network. This is compatible with a VPN or proxy, but does not prove one.
5. Known mobile/access providers receive neutral visibility labels. Unknown, missing, or expired evidence remains unconfirmed. An ISP address or absence of a database match never becomes an "unprotected" verdict.

TIAN, recognized third-party VPNs, and Private Relay use the same positive visual treatment. The panel separately shows the current page's HTTPS transport and the device clues exposed locally. It does not assign a protection percentage, grade another VPN, misuse an IP abuse score, or infer encryption, DNS behavior, kill-switch operation, IPv6 leaks, or protection of other apps.

### Evidence maintenance

TIAN's configured New York and Spain exit addresses were checked against the current app configuration on October 19, 2026; the New York exit also matched the active infrastructure inventory. The allowlist records that check and expires on November 18, 2026. Reverify the currently assigned exit addresses before extending it, and publish any address change at the same time. Do not add the Entry address or an entire hosting ASN to the TIAN allowlist. No private key, credential, or private server configuration is included in website source.

`connection-relays.js` is a local, expiring snapshot of Apple's public egress ranges. It contains both IP families, with only exact CIDR unions retained; location columns are discarded. The October 19 snapshot has 3,488 IPv4 and 10,580 IPv6 CIDRs, is about 347 KB raw / 44 KB with gzip, and expires 30 days after retrieval. The classifier stops using expired, future-dated, or malformed lists. Explicit organization recognition can still work independently of the range list. Visitors make no requests to Apple.

Refresh the public relay data deliberately and publish the updated module before expiry:

    python3 scripts/update_relay_ranges.py

The standard-library updater downloads only Apple's official feed, validates input, verifies the exact union, enforces a compressed-size budget, and replaces the module atomically. Its docstring covers reproducible offline validation from a source CSV and checksum manifest. No refresh job is scheduled. The safe fallback after expiry is neutral recognition using other current evidence, never a negative protection verdict.

Primary sources for the recognition approach:

- https://developer.apple.com/icloud/prepare-your-network-for-icloud-private-relay/ — Apple's supported relay-recognition methods.
- https://mask-api.icloud.com/egress-ip-ranges.csv — authoritative published IPv4/IPv6 relay ranges; provenance is embedded in the local data module.
- https://docs.aws.amazon.com/vpc/latest/userguide/aws-ip-ranges.html — AWS network attribution and the limits of its public ranges.
- https://whois.arin.net/rest/asn/AS14061.html — DigitalOcean ASN.
- https://whois.arin.net/rest/asn/AS14618.html — Amazon ASN.
- https://whois.arin.net/rest/asn/AS16509.html — Amazon ASN.

## Lookup provider and disclosure

Provider documentation reviewed October 19, 2026:

- https://ipwhois.io/documentation — HTTPS, CORS, selective response fields, errors, and free-domain limit of 1,000 requests/day. Browser CORS traffic shares the originating-domain quota. No uptime SLA applies to the free endpoint. The free response does not include VPN/proxy/Tor/security flags.
- https://ipwhois.io/ — FAQ explicitly permits use on commercial websites, including the Free plan.
- https://ipwhois.io/terms — this is a visitor-self integration; no data resale, bulk dataset, arbitrary-IP search, or redistribution service is provided here.
- https://ipwhois.io/privacy — the provider processes requests under its own policy. Do not promise zero provider logging.

The homepage identifies the automatic lookup and provider. `privacy.html#connection-preview` describes automatic loading, local model hints, recognition evidence, clearing, lifecycle refreshes, and separate provider handling. An API key or paid account is not configured in client source. If automatic traffic reaches the shared free quota, arrange a suitable provider plan or first-party backend before expanding this feature; keep result persistence off unless separately scoped.

## Validation

Run with a supported Node.js runtime:

    node tests/connection-device.test.cjs
    node tests/connection-network.test.cjs
    node tests/connection-privacy.test.cjs
    node tests/connection-flow.test.cjs

The lifecycle suite uses a minimal DOM harness and the real normalization and classification modules. It covers automatic requests, clearing and stale-response prevention, offline/reconnect and back/forward behavior, rate limits, error handling, and equal treatment of third-party privacy routes. It does not substitute for rendered browser QA.

All 54 focused cases passed: 15 device, 10 network normalization, 17 privacy classification, and 12 lifecycle/integration tests. Four HTML pages passed unique-ID, local-path, fragment-anchor, and ARIA-target checks. All six homepage JavaScript files parsed successfully, the deferred script order was checked, and `git diff --check` was clean. Independent source review found no material new privacy, fairness, or lifecycle issue.

Direct HTTPS checks of the exact self-lookup URL and the two configured TIAN exit lookups returned HTTP 200, `success: true`, and `Access-Control-Allow-Origin: *`. The real returned New York data normalized to DigitalOcean / AS14061 and the Spain data to Amazon Web Services / AS16509; both classified as TIAN exits. These verification requests came from the checking environment, not a visitor's device. The whole current Apple dataset also passed both-family integration checks.

Rendered browser and screen-reader QA cannot be exercised in this environment because the supported browser tool is unavailable. HTTP/CORS checks, JavaScript parsing, HTML targets and local paths, scoped source review, and the focused tests provide the available verification.

## Website analytics remains separate

The prior goal to measure website traffic, avoid selling data, and enforce 30-day deletion for retained analytics is not implemented by this display-only check. No analytics endpoint or retention job is enabled.

Before adding retained website analytics, define the provider/backend, necessary data, access rules, notice/consent behavior, and server-side deletion policy, including exports and backups. Prefer aggregate page counts; do not retain the displayed browser bundle or raw IP by default. Update the public notice to match the deployed implementation.
