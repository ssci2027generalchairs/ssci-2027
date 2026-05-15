import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'wordpress-export');
const pagesDir = path.join(root, 'src', 'data', 'pages');
const assetBaseArg = process.argv.find((arg) => arg.startsWith('--asset-base='));
const assetBase = assetBaseArg?.split('=').slice(1).join('=').replace(/\/?$/, '/');

const readJson = async (relativePath) => JSON.parse(
  await readFile(path.join(root, relativePath), 'utf8'),
);

const committees = await readJson('src/data/committees.json');
const speakers = await readJson('src/data/speakers.json');
const sponsors = await readJson('src/data/sponsors.json');
const importantDates = await readJson('src/data/importantDates.json');
const news = await readJson('src/data/news.json');
const site = await readJson('src/data/site.json');

const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const assetUrl = (value = '') => {
  if (!value) return '';
  if (/^(https?:)?\/\//.test(value) || value.startsWith('mailto:')) return value;
  const cleanPath = value.replace(/^\//, '');
  return assetBase ? `${assetBase}${cleanPath}` : `/${cleanPath}`;
};

const paragraph = (text) => `<p>${escapeHtml(text)}</p>`;

const renderTable = (table) => {
  if (!table?.headers?.length || !table?.rows?.length) return '';
  const headers = table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const rows = table.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('\n');
  return [
    '<figure class="wp-block-table">',
    '<table>',
    `<thead><tr>${headers}</tr></thead>`,
    `<tbody>${rows}</tbody>`,
    '</table>',
    '</figure>',
  ].join('\n');
};

const renderSections = (sections = []) => sections
  .map((section) => [
    section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : '',
    ...(section.paragraphs || []).map(paragraph),
    section.bullets?.length
      ? `<ul>${section.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : '',
    section.table ? renderTable(section.table) : '',
  ].filter(Boolean).join('\n'))
  .filter(Boolean)
  .join('\n\n');

const initials = (name) => name
  .split(/\s+/)
  .filter(Boolean)
  .map((part) => part[0])
  .join('')
  .slice(0, 2);

const renderPersonCard = (person) => [
  '<div class="ssci-person-card">',
  person.photo || person.image
    ? `<img src="${escapeHtml(assetUrl(person.photo || person.image))}" alt="${escapeHtml(person.name)}" />`
    : `<div class="ssci-person-placeholder">${escapeHtml(initials(person.name))}</div>`,
  `<h3>${person.href ? `<a href="${escapeHtml(person.href)}">${escapeHtml(person.name)}</a>` : escapeHtml(person.name)}</h3>`,
  person.affiliation ? `<p>${escapeHtml(person.affiliation)}</p>` : '',
  person.email ? `<p><a href="mailto:${escapeHtml(person.email)}">${escapeHtml(person.email)}</a></p>` : '',
  person.status ? `<p><strong>${escapeHtml(person.status)}</strong></p>` : '',
  person.note ? `<p><small>${escapeHtml(person.note)}</small></p>` : '',
  person.talkTitle ? `<p><strong>${escapeHtml(person.talkTitle)}</strong></p>` : '',
  person.dateTime ? `<p>${escapeHtml(person.dateTime)}</p>` : '',
  '</div>',
].filter(Boolean).join('\n');

const renderCommittee = (committeeSlug) => {
  const committee = committees.find((item) => item.slug === committeeSlug);
  if (!committee?.members?.length) {
    return '<p><em>Committee members not announced yet.</em></p>';
  }

  const roleGroups = [];
  for (const member of committee.members) {
    const role = member.role || 'Committee Member';
    const existing = roleGroups.find((group) => group.role === role);
    if (existing) {
      existing.members.push(member);
    } else {
      roleGroups.push({ role, members: [member] });
    }
  }

  return [
    `<h2>${escapeHtml(committee.name)}</h2>`,
    ...roleGroups.map((group) => [
      `<h3>${escapeHtml(group.role)}</h3>`,
      '<div class="ssci-card-grid">',
      group.members.map(renderPersonCard).join('\n'),
      '</div>',
    ].join('\n')),
  ].join('\n\n');
};

const renderSpeakers = () => {
  const sections = [
    ['Plenary Speakers', speakers.plenary || []],
    ['Keynote Speakers', speakers.keynote || []],
  ];

  return sections.map(([title, items]) => [
    `<h2>${escapeHtml(title)}</h2>`,
    items.length
      ? `<div class="ssci-card-grid">${items.map(renderPersonCard).join('\n')}</div>`
      : `<p><em>${escapeHtml(title)} not announced yet.</em></p>`,
  ].join('\n')).join('\n\n');
};

const renderSponsors = () => {
  if (!sponsors.length) return '<p><em>Sponsors not announced yet.</em></p>';
  return [
    '<div class="ssci-card-grid">',
    sponsors.map((sponsor) => [
      '<div class="ssci-sponsor-card">',
      sponsor.logo ? `<img src="${escapeHtml(assetUrl(sponsor.logo))}" alt="${escapeHtml(sponsor.name)}" />` : '',
      `<h3>${sponsor.href ? `<a href="${escapeHtml(sponsor.href)}">${escapeHtml(sponsor.name)}</a>` : escapeHtml(sponsor.name)}</h3>`,
      sponsor.tier ? `<p>${escapeHtml(sponsor.tier)}</p>` : '',
      '</div>',
    ].filter(Boolean).join('\n')).join('\n'),
    '</div>',
  ].join('\n');
};

const renderDateList = () => {
  if (!importantDates.length) return '<p><em>Dates to be announced.</em></p>';
  return [
    '<h2>Important Dates</h2>',
    '<ul class="ssci-date-list">',
    importantDates.map((item) => [
      '<li>',
      `<strong>${escapeHtml(item.label)}</strong><br />`,
      escapeHtml(item.date),
      item.status ? `<br /><em>${escapeHtml(item.status)}</em>` : '',
      '</li>',
    ].join('')).join('\n'),
    '</ul>',
  ].join('\n');
};

const renderNews = () => {
  if (!news.length) return '';
  return [
    '<h2>News and Updates</h2>',
    '<div class="ssci-news-list">',
    news.map((item) => [
      '<article>',
      item.date ? `<time datetime="${escapeHtml(item.date)}">${escapeHtml(item.date)}</time>` : '',
      `<h3>${item.href ? `<a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}</h3>`,
      item.summary ? paragraph(item.summary) : '',
      '</article>',
    ].filter(Boolean).join('\n')).join('\n'),
    '</div>',
  ].join('\n');
};

const renderPage = (page) => [
  `<!-- WordPress export for ${escapeHtml(site.shortName)}: ${escapeHtml(page.title)} -->`,
  `<h1>${escapeHtml(page.title)}</h1>`,
  page.summary ? `<p><strong>${escapeHtml(page.summary)}</strong></p>` : '',
  renderSections(page.sections),
  page.slug === 'home' ? renderDateList() : '',
  page.slug === 'home' ? renderNews() : '',
  page.kind === 'committee' ? renderCommittee(page.committeeSlug) : '',
  page.kind === 'speakers' ? renderSpeakers() : '',
  page.kind === 'sponsors' ? renderSponsors() : '',
].filter(Boolean).join('\n\n');

const collectPageFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? collectPageFiles(entryPath) : entryPath;
  }));
  return files.flat().filter((file) => file.endsWith('.json'));
};

const pageFiles = await collectPageFiles(pagesDir);
const pages = await Promise.all(pageFiles.map(async (file) => JSON.parse(await readFile(file, 'utf8'))));
pages.push({
  slug: 'home',
  title: site.shortName,
  summary: `${site.locationLabel} · ${site.datesLabel}`,
  kind: 'basic',
  sections: [
    {
      heading: site.welcomeTitle,
      paragraphs: site.welcomeBody,
    },
  ],
});

pages.sort((a, b) => a.slug.localeCompare(b.slug));

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const index = [];
for (const page of pages) {
  const fileName = `${page.slug.replaceAll('/', '__')}.html`;
  await writeFile(path.join(outputDir, fileName), `${renderPage(page)}\n`);
  index.push({
    title: page.title,
    slug: page.slug,
    wordpressPath: page.slug === 'home' ? '/' : `/${page.slug}/`,
    file: fileName,
    kind: page.kind,
  });
}

const helperCss = `
/* Optional helper CSS for WordPress pages. Paste into Additional CSS if the IEEE theme allows it. */
.ssci-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 18px;
  margin: 1rem 0 2rem;
}
.ssci-person-card,
.ssci-sponsor-card {
  border: 1px solid #d8e0e7;
  border-radius: 8px;
  padding: 18px;
}
.ssci-person-card img,
.ssci-person-placeholder {
  width: 92px;
  height: 92px;
  border-radius: 50%;
  object-fit: cover;
}
.ssci-person-placeholder {
  display: grid;
  place-items: center;
  background: #e8f0f2;
  color: #00629b;
  font-weight: 700;
}
.ssci-date-list {
  display: grid;
  gap: 0.75rem;
}
`;

await writeFile(path.join(outputDir, '_optional-helper.css'), helperCss.trimStart());
await writeFile(path.join(outputDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

console.log(`Exported ${pages.length} WordPress HTML files to ${path.relative(root, outputDir)}/`);
