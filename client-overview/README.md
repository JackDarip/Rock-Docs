# Client overview: source

Source for `TrueGrade-Client-Overview.pdf` (repo root), the client-facing "Capabilities & Client Inputs" document.

## Edit

- **Copy and layout:** `template.html`
- **Names, client, date, workspace URL, contact line:** the `CONFIG` block at the top of `build.cjs`. The template uses `{{PLACEHOLDERS}}` for these, so the product name is never hardcoded.
- **Fonts:** `fonts/` (Inter and Fraunces, both SIL Open Font License; licenses included).

## Rebuild

Requires Node and Playwright with a Chromium install.

```sh
NODE_PATH=$(npm root -g) node client-overview/build.cjs
# optional: CHROMIUM_PATH=/path/to/chrome
```

The PDF is written to the repo root. `out/overview.html` is a generated preview and is git-ignored.

## Notes

- Source of truth for capabilities is `truegrade-build-prompt_1.txt`. If the build spec changes, update the template to match.
- The document deliberately contains no pricing, dates, or performance claims. Add those once they are decided.
