---
name: ssci-site-maintenance
description: Use when maintaining this IEEE SSCI 2027 Astro website, especially when updating site JSON from a conference PDF/bid document or exporting the current site to WPBakery/WordPress-ready HTML for IEEE hosting.
---

# SSCI Site Maintenance

Use this skill inside the `ssci` project repository. It assumes the site content lives in `src/data/**/*.json`, the Astro pages render from those files, and WordPress exports are generated into `wordpress-export/`.

## Commands

Run commands from the repository root. In this project, prefix shell commands with `rtk`.

```bash
rtk npm run ssci -- pdf-update "bid SSCI draft v3.pdf"
rtk npm run ssci -- pdf-update "bid SSCI draft v3.pdf" --apply
rtk npm run ssci -- export-wordpress --zip
```

## Update From PDF

1. Run a dry extraction first:

   ```bash
   rtk npm run ssci -- pdf-update "<path-to-pdf>"
   ```

2. Read the generated report in `wordpress-export/pdf-updates/`. Check detected dates, location, organizer members, and the manual-review section.
3. Apply only when the extraction looks reasonable:

   ```bash
   rtk npm run ssci -- pdf-update "<path-to-pdf>" --apply
   ```

4. Review `git diff`. The CLI may update:
   - `src/data/site.json`
   - `src/data/importantDates.json`
   - `src/data/committees.json`
   - `src/data/pages/submissions/call-for-papers.json`
5. Manually handle any items listed under "Needs Manual Review"; do not silently drop uncertain PDF content.

## Export For WordPress

Generate page snippets for WPBakery Raw HTML:

```bash
rtk npm run ssci -- export-wordpress --zip
```

Outputs:

- `wordpress-export/full-pages/*.html`: the default and only generated HTML set. It follows the visible top navigation in `src/data/navigation.json`; hidden menu groups are not exported.
- `wordpress-export/_wordpress-page-setup.md`: page titles, slugs, parent pages, and target URLs.
- `ssci-2027-wordpress-page-deploy.zip`: packaged export for handoff.

Do not edit `wordpress-export/` by hand. Update source JSON, components, or `scripts/export-wordpress-html.mjs`, then regenerate.

## Validation

After applying PDF updates or changing exports, run:

```bash
rtk npm run check
rtk npm run build
rtk npm run ssci -- export-wordpress --zip
```

Inspect the relevant local page or generated HTML before giving the user deployment instructions.
