# Security summary: Live page

Built with AI coding agents; Anirudh wrote the spec, gates and reviews. This is a portfolio project. There are no users, no production deployment and no adoption.

## What the Live page does with your data
- You bring your own Gemini API key. The key, your images and the text you enter are sent from your browser straight to Google (generativelanguage.googleapis.com) under the Gemini API terms. The free tier may use inputs to improve Google products. Tick the on-page notice before the first call.
- Nothing is sent to the author. There is no analytics, no tracking, no cookies and no server-side component.
- The key is held in memory only. It is never written to browser storage. "Clear key" removes it, and closing or reloading the tab ends it.
- Do not use a key shared with anything else, and set a spending limit on it.
- The demo mock option works offline and needs no key.

## Controls
- Content Security Policy: scripts and styles only from the page's own origin; network calls allowed only to generativelanguage.googleapis.com; no inline script.
- Images are local files only (JPEG, PNG, WebP, up to 4 MB, checked by file signature). Image web addresses are not supported, so the page never fetches third-party URLs.
- Results are rendered as text, error details from the provider are not displayed, and exported CSV cells are neutralised against spreadsheet formula injection.
- No author key exists in the code. The full git history (27 commits) was scanned for API keys, tokens and private keys and none were found.

## Limits
- Framing: GitHub Pages cannot send custom response headers, and a meta-tag policy ignores `frame-ancestors`. This is an accepted limitation. As a partial control the page refuses to run when it detects it is inside a frame. A hostile site could still try to frame it, so only type a key into the page when you opened it directly.
- The policy is delivered as a meta tag. A host that supports response headers should also send `frame-ancestors 'none'` and `Referrer-Policy: no-referrer`.
- Public repository history: the public repository is created as a fresh history from the packaged files, with a GitHub noreply address as author and committer. The working repository's history is never pushed. Packaging runs `tools/check-staging-authors.cjs` and refuses if any staged commit has another email.
- Live results are demonstrations, not measurements, and are not part of the evaluated gate.

Report a problem by opening an issue on the project's repository.