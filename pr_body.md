## Summary

Adds a GitHub Action workflow to run CI tests (linting, formatting, and unit tests) automatically on pushes and pull requests to the main branch. Additionally, I formatted all the unformatted files using `npm run format`.

## Related Issue

Closes #185

## Type of Change

- [ ] Bug fix
- [x] Feature enhancement
- [ ] Accessibility improvement
- [ ] Performance improvement
- [ ] Security or privacy improvement
- [ ] Documentation update
- [x] Developer experience improvement

## Affected Extension Area

- [ ] Background/service worker
- [ ] Content script or extractor
- [ ] Popup UI
- [ ] Options/settings UI
- [ ] Shared storage, capsule, or messaging logic
- [ ] Import/export
- [ ] Documentation or templates

## Changes Made

- Created `.github/workflows/ci.yml` file to configure CI pipeline on `push` and `pull_request`.
- The pipeline installs dependencies (`npm ci`), runs linter (`npm run lint`), runs formatter check (`npx prettier --check .`), and executes tests (`npm run test`).
- Ran `npm run format` locally to fix existing formatting issues across the codebase.

## Testing

- [x] Ran `npm run build`
- [ ] Ran `npm run build:firefox` when cross-browser behavior changed
- [x] Tested the affected UI in a browser
- [x] Checked DevTools console for new errors or warnings
- [x] Verified keyboard-only behavior for UI changes
- [x] Verified no secrets, API keys, or private chat content are committed

## Screenshots or Recording

Not applicable

## Data and Privacy Impact

No impact

## Reviewer Notes

I ran `npm run format` across the entire codebase so that `prettier --check .` passes in the CI, which is why there are modifications in many files.
