# Constructed fixtures

Hand-made data for error cases and edge cases that cannot reasonably be captured from GitHub.

Specs: `github-data-layer` requirement 14 and design 8.1.

## Rules

1. **Clearly marked.** Each file says it is constructed. Every file has a top-level `meta` object with:
   - `constructed: true`
   - `case`: a plain sentence describing the case, for example "Secondary rate limit: 403 with a retry-after header".
2. **Edge and error cases only** (requirement 14.5). Examples: primary and secondary rate limits, a plain 403, 5xx responses, broken JSON, missing or wrong-type fields, a list containing a private item, a `Link` header for more than 300 repositories, 100 open items that are all pull requests, 100 branches, and an empty or renamed repository if no real one could be captured.
3. **Never for normal conversions** (requirement 14.4). A test that checks a normal, successful conversion uses `../captured/`.
4. **Never shown to users.** These files are used by tests only. They are not part of the demo snapshot and never reach the app.
5. **Keep them small and realistic.** Copy the shape of a real response. Do not invent fields GitHub does not send.
6. **No real personal data.** Use made-up names such as `example-user`. No email addresses and no tokens.
7. **No network.** Tests read these files from disk and feed them to a fake `fetch`.

## File shape

```json
{
  "meta": {
    "constructed": true,
    "case": "Secondary rate limit: 403 with a retry-after header"
  },
  "status": 403,
  "headers": { "retry-after": "30" },
  "body": { "message": "You have exceeded a secondary rate limit." }
}
```

Broken JSON cases keep the broken text in a string field named `rawBody`, because the file itself must stay valid JSON.

## Use in tests

- Tests load a file, then return its `status`, `headers` and `body` from a fake `fetch`.
- A test checks that every file has `meta.constructed === true` and a non-empty `meta.case`.
- A test scans this folder for email and token patterns.
