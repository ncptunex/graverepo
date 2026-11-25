# Captured fixtures

Real GitHub responses, gathered once during development. Nothing in this folder is hand-made.

Specs: `github-data-layer` requirement 14 and design 8.1.

## Rules

1. **Real only.** Every file is a response GitHub actually returned. Do not write, fake or "tidy" a response here. A case that cannot be captured goes in `../constructed/` instead.
2. **Metadata on every file.** Each file records:
   - `endpoint`: the request path and query, for example `/users/octocat/repos?per_page=100`.
   - `capturedAt`: the capture date and time, ISO 8601 UTC.
   - `source`: the account or repository it was captured from, for example `octocat/Hello-World`.
   - `capturedWith`: the tool used (GitHub MCP or the capture script).
   - `status`: the HTTP status GitHub returned (for example `200`, or `409` for an empty repository).
3. **Only one edit is allowed: email fields are removed.** Nothing else is changed. Keep `capturedAt` honest, and say in the file's `redactions` list which fields were removed.
4. **No secrets.** No token, no `Authorization` header, no cookie.
5. **Public data only.** Capture public repositories and accounts only.
6. **No network at test time.** Tests read these files from disk. Builds and tests never contact GitHub. Capturing is a one-time development step done by hand.

## File shape

One JSON file per response. The GitHub response body is kept as it was, apart from the removed email fields.

```json
{
  "meta": {
    "endpoint": "/users/octocat",
    "capturedAt": "2026-11-22T08:00:00Z",
    "source": "octocat",
    "capturedWith": "GitHub MCP",
    "status": 200,
    "redactions": ["email"]
  },
  "body": { }
}
```

Response headers that tests need (`Link`, `x-ratelimit-*`) go in an optional `headers` object next to `meta` and `body`.

## Use in tests

- Tests of normal conversions (schemas and adapters) use these files only (requirement 14.4).
- A test scans this folder for email patterns and fails if one is found (requirement 13.5).
- A test checks that every file has complete `meta`.
- Error cases and edge cases (rate limits, server errors, broken JSON, missing fields) do not belong here. See `../constructed/README.md`.
