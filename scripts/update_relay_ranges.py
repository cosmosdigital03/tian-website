#!/usr/bin/env python3
"""Refresh the site's local Apple Private Relay recognition ranges.

Run from the repository root:
    python3 scripts/update_relay_ranges.py

The updater fetches Apple's public CSV once, discards all location columns, and
collapses IPv4 and IPv6 CIDRs without adding addresses. It writes a browser /
CommonJS module only after validating the feed and its exact address union.
There are no visitor lookups, credentials, cookies, or background requests.

The exported data expires 30 days after retrieval. The consumer MUST decline
range-based identification when the clock is before updatedAt or at/after
expiresAt. Refresh before expiry; an expired or failed update must not extend
the old data's lifetime. No update is scheduled by this script.

To reproduce a previously downloaded official feed offline, supply its CSV and
the matching retrieval manifest (source, retrievedAt, bytes, sha256):
    python3 scripts/update_relay_ranges.py \
        --source-file /tmp/tian-apple-relay-feed.csv \
        --source-metadata /tmp/tian-apple-relay-feed.meta.json

Source documentation:
https://developer.apple.com/icloud/prepare-your-network-for-icloud-private-relay/
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import io
import ipaddress
import json
import os
from pathlib import Path
import sys
import tempfile
import urllib.request


SOURCE = "https://mask-api.icloud.com/egress-ip-ranges.csv"
MAX_SOURCE_BYTES = 25 * 1024 * 1024
MAX_GZIP_BYTES = 100_000
VALID_FOR = timedelta(days=30)
DEFAULT_OUTPUT = Path(__file__).resolve().parents[1] / "connection-relays.js"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Keep the public reference download on the explicitly selected URL."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Unexpected redirect; download stopped")


def iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace(
        "+00:00", "Z"
    )


def parse_timestamp(value: str) -> datetime:
    stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if stamp.tzinfo is None:
        raise ValueError("Retrieval timestamp must include a time zone")
    return stamp.astimezone(timezone.utc)


def get_source(args):
    if bool(args.source_file) != bool(args.source_metadata):
        raise ValueError("Supply both --source-file and --source-metadata")

    if args.source_file:
        with args.source_file.open("rb") as stream:
            raw = stream.read(MAX_SOURCE_BYTES + 1)
        metadata = json.loads(args.source_metadata.read_text(encoding="utf-8"))
    else:
        request = urllib.request.Request(
            SOURCE,
            headers={
                "Accept": "text/csv",
                "Accept-Encoding": "identity",
                "User-Agent": "TIAN-Public-Relay-Data-Updater/1.0",
            },
        )
        opener = urllib.request.build_opener(NoRedirect())
        with opener.open(request, timeout=30) as response:
            raw = response.read(MAX_SOURCE_BYTES + 1)
            content_length = response.headers.get("Content-Length")
            if content_length is not None and int(content_length) != len(raw):
                raise ValueError("Downloaded size does not match Content-Length")
            metadata = {
                "source": SOURCE,
                "retrievedAt": iso_utc(datetime.now(timezone.utc)),
                "httpLastModified": response.headers.get("Last-Modified"),
                "etag": response.headers.get("ETag"),
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
            }

    if len(raw) > MAX_SOURCE_BYTES:
        raise ValueError("Source exceeds the 25 MiB download limit")
    if metadata.get("source") != SOURCE:
        raise ValueError("The manifest must identify Apple's official feed")
    digest = hashlib.sha256(raw).hexdigest()
    if metadata.get("sha256") != digest or metadata.get("bytes") != len(raw):
        raise ValueError("The source does not match its retrieval manifest")

    retrieved = parse_timestamp(metadata["retrievedAt"])
    now = datetime.now(timezone.utc)
    if retrieved > now:
        raise ValueError("The source retrieval timestamp is in the future")
    if now >= retrieved + VALID_FOR:
        raise ValueError("The source is expired; fetch a current official copy")
    return raw, metadata, retrieved


def merge_intervals(networks):
    """An independent address-union representation for the collapse check."""
    intervals = sorted(
        (int(network.network_address), int(network.broadcast_address))
        for network in networks
    )
    merged = []
    for start, end in intervals:
        if merged and start <= merged[-1][1] + 1:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def parse_and_collapse(raw):
    networks = {4: set(), 6: set()}
    rows = 0
    for line_number, row in enumerate(
        csv.reader(io.StringIO(raw.decode("utf-8-sig"))), start=1
    ):
        if not row or not row[0].strip() or row[0].lstrip().startswith("#"):
            continue
        prefix = row[0].strip()
        if "/" not in prefix:
            raise ValueError(f"Missing CIDR prefix on source line {line_number}")
        try:
            network = ipaddress.ip_network(prefix, strict=True)
        except ValueError as error:
            raise ValueError(f"Invalid CIDR on source line {line_number}") from error
        if not network.is_global:
            raise ValueError(f"Non-public range on source line {line_number}")
        networks[network.version].add(network)
        rows += 1

    if rows < 1000 or not all(networks.values()):
        raise ValueError("Feed is unexpectedly small or lacks an address family")

    collapsed = {
        version: list(ipaddress.collapse_addresses(values))
        for version, values in networks.items()
    }
    for version in (4, 6):
        if merge_intervals(networks[version]) != merge_intervals(collapsed[version]):
            raise ValueError("Collapsed CIDRs changed the source address union")
    return networks, collapsed, rows


def render_module(metadata, retrieved, collapsed, rows):
    data = {
        "updatedAt": iso_utc(retrieved),
        "expiresAt": iso_utc(retrieved + VALID_FOR),
        "ipv4": [str(network) for network in collapsed[4]],
        "ipv6": [str(network) for network in collapsed[6]],
    }
    payload = json.dumps(data, separators=(",", ":"), ensure_ascii=True)
    header = (
        "// Generated public reference data; do not edit by hand.\n"
        f"// Source: {SOURCE}\n"
        f"// Retrieved: {data['updatedAt']}\n"
        f"// Source SHA-256: {metadata['sha256']}\n"
        f"// Source bytes: {metadata['bytes']}; rows: {rows}.\n"
        f"// Exact collapsed union: {len(collapsed[4])} IPv4 / "
        f"{len(collapsed[6])} IPv6 CIDRs; all location columns discarded.\n"
        "// Refresh: python3 scripts/update_relay_ranges.py\n"
        "// Require updatedAt <= now < expiresAt before identifying a relay.\n"
        "// No requests, visitor data, or tracking are performed by this module.\n"
    )
    module = header + (
        "(function (root, factory) {\n"
        "  'use strict';\n"
        "  var api = factory();\n"
        "  if (typeof module === 'object' && module && module.exports) "
        "module.exports = api;\n"
        "  if (typeof define === 'function' && define.amd) "
        "define([], function () { return api; });\n"
        "  if (root) root.TianRelayRanges = api;\n"
        "})(typeof window === 'object' && window ? window : null, function () {\n"
        "  'use strict';\n"
        f"  var data = {payload};\n"
        "  Object.freeze(data.ipv4);\n"
        "  Object.freeze(data.ipv6);\n"
        "  return Object.freeze(data);\n"
        "});\n"
    )
    encoded = module.encode("utf-8")
    gzip_bytes = len(gzip.compress(encoded, compresslevel=1, mtime=0))
    if gzip_bytes > MAX_GZIP_BYTES:
        raise ValueError(
            f"Generated module exceeds the 100,000-byte gzip budget ({gzip_bytes})"
        )
    return encoded, data, gzip_bytes


def write_atomically(output, encoded):
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb", dir=output.parent, prefix=output.name + ".", suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(encoded)
        os.chmod(temporary_path, 0o644)
        os.replace(temporary_path, output)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-file", type=Path)
    parser.add_argument("--source-metadata", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        raw, metadata, retrieved = get_source(args)
        networks, collapsed, rows = parse_and_collapse(raw)
        encoded, data, gzip_bytes = render_module(metadata, retrieved, collapsed, rows)
        write_atomically(args.output, encoded)
        print(json.dumps({
            "output": str(args.output.resolve()),
            "source": SOURCE,
            "updatedAt": data["updatedAt"],
            "expiresAt": data["expiresAt"],
            "sourceSha256": metadata["sha256"],
            "sourceBytes": len(raw),
            "sourceRecords": rows,
            "sourceUniqueIPv4": len(networks[4]),
            "sourceUniqueIPv6": len(networks[6]),
            "ipv4Ranges": len(collapsed[4]),
            "ipv6Ranges": len(collapsed[6]),
            "moduleBytes": len(encoded),
            "gzipLevel1Bytes": gzip_bytes,
            "exactAddressUnionVerified": True,
        }, indent=2))
        return 0
    except (OSError, ValueError, KeyError, TypeError, UnicodeError) as error:
        print(f"Relay range update stopped; existing module preserved: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
