## AI Agent Mandatory Procedures

### Version bump rules (required on every code change)

- Always bump `APP_VERSION` in `/home/runner/work/personance/personance/js/app.js` by at least `0.0.1`.
- Always bump `APP_VERSION` in `/home/runner/work/personance/personance/sw.js` to exactly the same value.
- Keep user-facing version references in sync, including:
  - `/home/runner/work/personance/personance/index.html` cache-busting query parameters
  - Intro version text rendered from `APP_VERSION` in `js/views/intro.js`
- If the change is bigger (feature-level or broad refactor), bump by `0.1.0`.

### Quick checklist for every AI change

- [ ] Update `APP_VERSION` in `js/app.js`
- [ ] Update `APP_VERSION` in `sw.js`
- [ ] Update version query params in `index.html`
- [ ] Verify all displayed/user-visible version values remain aligned
