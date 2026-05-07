# IEEE SSCI 2027 Website

Static, data-driven conference website scaffold for IEEE SSCI 2027.

## Local Development

```bash
npm install
npm run dev
```

## Content Updates

Most frequently changing content lives in `src/data/`:

- `site.json`: conference title, year, location label, dates label, social links.
- `news.json`: homepage news and updates.
- `speakers.json`: plenary and keynote speaker cards.
- `sponsors.json`: sponsor logos and links.
- `committees.json`: committee groups and members.
- `importantDates.json`: deadlines and milestones.
- `pages.json`: placeholder pages and editable body content.

Images and PDFs go under `public/assets/images/` and `public/assets/files/`.

## GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds the site and publishes the static output to GitHub Pages.

If the repository is published as a project site, set `BASE_PATH` in the workflow to `/<repo-name>/`.
For the final IEEE server migration, run `npm run build` and upload the generated `dist/` directory.
