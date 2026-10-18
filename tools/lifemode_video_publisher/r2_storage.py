"""Minimal Cloudflare R2 S3-compatible client using only the Python standard library.

It supports private-bucket HEAD/PUT/GET/list operations and presigned GET URLs.
Secrets are read from environment variables and never included in diagnostics.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone


class R2Error(RuntimeError):
    pass


class R2AuthError(R2Error):
    pass


class R2PermissionError(R2Error):
    pass


class R2ResourceError(R2Error):
    pass


class R2ConnectivityError(R2Error):
    pass


@dataclass(frozen=True)
class R2Config:
    account_id: str
    access_key_id: str
    secret_access_key: str
    bucket_name: str
    key_prefix: str
    presign_ttl_seconds: int
    endpoint: str

    @classmethod
    def from_env(cls, role=""):
        account = os.getenv("R2_ACCOUNT_ID", "")
        role_prefix = f"R2_{role.upper()}_" if role else "R2_"
        access_key = os.getenv(role_prefix + "ACCESS_KEY_ID") or os.getenv("R2_ACCESS_KEY_ID", "")
        secret_key = os.getenv(role_prefix + "SECRET_ACCESS_KEY") or os.getenv("R2_SECRET_ACCESS_KEY", "")
        return cls(
            account_id=account,
            access_key_id=access_key,
            secret_access_key=secret_key,
            bucket_name=os.getenv("R2_BUCKET_NAME", ""),
            key_prefix=os.getenv("R2_KEY_PREFIX", "lifemode-life-hacks/videos").strip("/"),
            presign_ttl_seconds=int(os.getenv("R2_PRESIGNED_URL_TTL_SECONDS", "3600")),
            endpoint=os.getenv("R2_ENDPOINT") or (f"https://{account}.r2.cloudflarestorage.com" if account else ""),
        )

    def validate(self):
        missing = [name for name, value in (
            ("R2_ACCOUNT_ID", self.account_id), ("R2_ACCESS_KEY_ID", self.access_key_id),
            ("R2_SECRET_ACCESS_KEY", self.secret_access_key), ("R2_BUCKET_NAME", self.bucket_name),
        ) if not value]
        if missing:
            raise R2Error("Missing R2 configuration: " + ", ".join(missing))
        if not (60 <= self.presign_ttl_seconds <= 604800):
            raise R2Error("R2_PRESIGNED_URL_TTL_SECONDS must be between 60 and 604800")
        parsed = urllib.parse.urlparse(self.endpoint)
        expected_host = f"{self.account_id}.r2.cloudflarestorage.com"
        if parsed.scheme != "https" or parsed.netloc != expected_host:
            raise R2Error("R2_ENDPOINT must be the configured account's HTTPS S3 endpoint")


def _hmac(key, value):
    return hmac.new(key, value.encode(), hashlib.sha256).digest()


class R2Client:
    service = "s3"
    region = "auto"

    def __init__(self, config: R2Config, opener=urllib.request.urlopen):
        config.validate()
        self.config, self.opener = config, opener
        self.host = urllib.parse.urlparse(config.endpoint).netloc

    def _signing_key(self, day):
        date_key = _hmac(("AWS4" + self.config.secret_access_key).encode(), day)
        return _hmac(_hmac(_hmac(date_key, self.region), self.service), "aws4_request")

    def _canonical_path(self, key):
        return "/" + urllib.parse.quote(self.config.bucket_name + "/" + key, safe="/-_.~")

    def _signed_request(self, method, key, body=b"", headers=None, query=None, timeout=120):
        headers = {k.lower(): str(v) for k, v in (headers or {}).items()}
        payload_hash = hashlib.sha256(body).hexdigest()
        now = datetime.now(timezone.utc)
        amz_date, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
        headers.update({"host": self.host, "x-amz-content-sha256": payload_hash, "x-amz-date": amz_date})
        canonical_headers = "".join(f"{k}:{' '.join(v.split())}\n" for k, v in sorted(headers.items()))
        signed_headers = ";".join(sorted(headers))
        canonical_query = urllib.parse.urlencode(sorted((query or {}).items()))
        canonical_request = "\n".join((method, self._canonical_path(key), canonical_query, canonical_headers, signed_headers, payload_hash))
        scope = f"{day}/{self.region}/{self.service}/aws4_request"
        string_to_sign = "\n".join(("AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical_request.encode()).hexdigest()))
        signature = hmac.new(self._signing_key(day), string_to_sign.encode(), hashlib.sha256).hexdigest()
        headers["authorization"] = f"AWS4-HMAC-SHA256 Credential={self.config.access_key_id}/{scope}, SignedHeaders={signed_headers}, Signature={signature}"
        url = self.config.endpoint.rstrip("/") + self._canonical_path(key)
        if canonical_query:
            url += "?" + canonical_query
        request = urllib.request.Request(url, data=body or None, method=method, headers=headers)
        try:
            with self.opener(request, timeout=timeout) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return 404, b""
            if exc.code == 401:
                raise R2AuthError(f"R2 {method} authentication failed") from exc
            if exc.code == 403:
                raise R2PermissionError(f"R2 {method} permission denied") from exc
            raise R2Error(f"R2 {method} operation failed ({exc.code})") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise R2ConnectivityError(f"R2 {method} network failure") from exc

    def head(self, key):
        return self._signed_request("HEAD", key)[0]

    def put(self, key, content, content_type="application/octet-stream"):
        status, _ = self._signed_request("PUT", key, content, {"content-type": content_type})
        if status not in (200, 201):
            raise R2Error(f"R2 PUT returned {status}")

    def get(self, key):
        status, content = self._signed_request("GET", key, timeout=300)
        if status != 200:
            raise R2Error(f"R2 GET returned {status}")
        return content

    def list_video_objects(self):
        prefix = self.config.key_prefix + "/" if self.config.key_prefix else ""
        status, raw = self._signed_request("GET", "", query={"list-type": "2", "prefix": prefix}, timeout=120)
        if status == 404:
            raise R2ResourceError("R2 bucket or endpoint was not found")
        if status != 200:
            raise R2Error(f"R2 LIST returned {status}")
        root = ET.fromstring(raw)
        namespace = "{http://s3.amazonaws.com/doc/2006-03-01/}"
        items = []
        for entry in root.findall(namespace + "Contents"):
            key = entry.findtext(namespace + "Key", "")
            if key.lower().endswith((".mp4", ".mov", ".m4v")):
                items.append({"key": key, "size": int(entry.findtext(namespace + "Size", "0")), "etag": entry.findtext(namespace + "ETag", "")})
        return items

    def presign_get(self, key):
        self.config.validate()
        now = datetime.now(timezone.utc)
        amz_date, day = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
        scope = f"{day}/{self.region}/{self.service}/aws4_request"
        query = {"X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": f"{self.config.access_key_id}/{scope}", "X-Amz-Date": amz_date, "X-Amz-Expires": str(self.config.presign_ttl_seconds), "X-Amz-SignedHeaders": "host"}
        canonical_query = urllib.parse.urlencode(sorted(query.items()))
        canonical_request = "\n".join(("GET", self._canonical_path(key), canonical_query, f"host:{self.host}\n", "host", "UNSIGNED-PAYLOAD"))
        string_to_sign = "\n".join(("AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical_request.encode()).hexdigest()))
        query["X-Amz-Signature"] = hmac.new(self._signing_key(day), string_to_sign.encode(), hashlib.sha256).hexdigest()
        return self.config.endpoint.rstrip("/") + self._canonical_path(key) + "?" + urllib.parse.urlencode(sorted(query.items()))
