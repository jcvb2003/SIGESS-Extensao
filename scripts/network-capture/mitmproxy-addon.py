"""Capture network evidence for static-resource cache analysis.

This addon deliberately does not store request/response bodies, cookies, or
authorization values. It records only metadata needed to compare cold and
warm Firefox navigations.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from mitmproxy import ctx, http


STATIC_TYPES = {
    "text/css",
    "text/javascript",
    "application/javascript",
    "application/x-javascript",
    "font/woff",
    "font/woff2",
    "font/ttf",
    "font/otf",
    "image/avif",
    "image/gif",
    "image/jpeg",
    "image/png",
    "image/svg+xml",
    "image/webp",
}


def _header(headers: http.Headers, name: str) -> str | None:
    value = headers.get(name)
    return value.strip() if value else None


def _int_header(headers: http.Headers, name: str) -> int | None:
    value = _header(headers, name)
    try:
        return int(value) if value is not None else None
    except ValueError:
        return None


def _output_path() -> Path:
    configured = str(ctx.options.sigess_output or "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return Path.cwd() / "sigess-network-capture.jsonl"


def _allowed_host(host: str) -> bool:
    configured = str(ctx.options.sigess_hosts or "").strip()
    if not configured:
        return True
    allowed = {item.strip().lower() for item in configured.split(",") if item.strip()}
    return host.lower() in allowed or any(host.lower().endswith("." + item) for item in allowed)


def load(loader):
    loader.add_option(
        "sigess_output",
        str,
        "",
        "JSONL output path for the SIGESS network capture.",
    )
    loader.add_option(
        "sigess_hosts",
        str,
        "",
        "Comma-separated host allowlist. Empty means every HTTP(S) flow.",
    )


def response(flow: http.HTTPFlow):
    if not flow.response or not _allowed_host(flow.request.host):
        return

    request_headers = flow.request.headers
    response_headers = flow.response.headers
    content_type = (_header(response_headers, "content-type") or "").split(";", 1)[0].lower()
    raw_body = flow.response.raw_content or b""
    decoded_body = flow.response.content or b""
    url = flow.request.pretty_url
    path = urlsplit(url).path.lower()
    is_static_type = content_type in STATIC_TYPES
    is_static_path = any(
        marker in path
        for marker in (
            "/assets/",
            "/static/",
            "/css/",
            "/js/",
            "/fonts/",
            "/font/",
            "/img/",
            "/images/",
            "/icons/",
            "/_next/static/",
            "++webresource++",
            "++theme++",
        )
    )

    record: dict[str, Any] = {
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "url": url,
        "host": flow.request.host,
        "path": urlsplit(url).path,
        "method": flow.request.method,
        "status": flow.response.status_code,
        "mimeType": content_type or None,
        "isStaticType": is_static_type,
        "isStaticPath": is_static_path,
        "wireBodyBytes": len(raw_body),
        "decodedBodyBytes": len(decoded_body),
        "contentEncoding": _header(response_headers, "content-encoding"),
        "contentLength": _int_header(response_headers, "content-length"),
        "requestHasCookie": bool(_header(request_headers, "cookie")),
        "requestHasValidator": bool(
            _header(request_headers, "if-none-match")
            or _header(request_headers, "if-modified-since")
        ),
        "responseHasSetCookie": bool(_header(response_headers, "set-cookie")),
        "cacheControl": _header(response_headers, "cache-control"),
        "etag": _header(response_headers, "etag"),
        "lastModified": _header(response_headers, "last-modified"),
        "vary": _header(response_headers, "vary"),
        "serverTiming": _header(response_headers, "server-timing"),
        "networkObserved": True,
    }

    output = _output_path()
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, ensure_ascii=False) + os.linesep)
