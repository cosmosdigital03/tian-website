# Connection preview and analytics readiness

This draft keeps the website static. No analytics service or retention job is implemented.

## Implemented
- Homepage-only visual refinement; the existing inline people/route artwork remains intact.
- An explicit Show / Hide control displays basic browser information locally.
- No IP lookup, GPS, high-entropy client hints, fingerprint hash, persistent identifier, cookies, analytics requests, or browser storage are added.
- IP, approximate location and ISP remain explicitly unavailable.
- Existing hosting request processing is separate from this local preview.

## Approved goal, not yet implemented
Measure website traffic, do not sell collected data, provide a clear privacy notice, and automatically delete retained analytics after 30 days.

## Required before collection can be enabled
1. Select and approve the backend/provider, data fields, recipients, and processing location.
2. Prefer aggregate page counts. Do not retain the displayed browser detail bundle or raw IP addresses by default.
3. Document why any field is necessary. Keep lookup processing separate from analytics.
4. Implement the approved consent/notice behavior before any analytics request is sent.
5. Enforce the 30-day limit server-side, including queued events, exports, and a documented backup policy. A browser timer or client timestamp is insufficient.
6. Verify access controls, error handling, deletion jobs, and an end-to-end deletion test. Obtain separate approval for credentials and persistent access.
7. Review and update the public privacy notice to match the actual implementation before enabling collection.
8. For an IP lookup, disclose the exact provider and what the request transmits before activation. Approximate IP location must never be presented as a precise device location.
9. Keep collection off when configuration, consent, or retention enforcement is unavailable.

## Verification still required
This is a connector-authored draft, not a tested release. Before merging, run browser QA at phone, tablet and desktop widths; keyboard and screen-reader checks; no-JavaScript and reduced-motion checks; repeated Show/Hide interactions; and a network/storage inspection confirming no new collection. Check existing tabs, support, privacy and 404 pages. No deployment is authorized by this draft.
