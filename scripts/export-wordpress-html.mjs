import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'wordpress-export');
const pagesDir = path.join(root, 'src', 'data', 'pages');
const assetBaseArg = process.argv.find((arg) => arg.startsWith('--asset-base='));
const defaultWordPressAssetBase = 'https://attend.ieee.org/ssci-2027/wp-content/uploads/sites/847/';
const assetBase = (assetBaseArg?.split('=').slice(1).join('=') || process.env.WORDPRESS_ASSET_BASE || defaultWordPressAssetBase)
  .replace(/\/?$/, '/');
const wordpressAssetFileNames = new Map([
  ['griffith-logo.png', 'griffith-logo-1.png'],
]);

const readJson = async (relativePath) => JSON.parse(
  await readFile(path.join(root, relativePath), 'utf8'),
);

const committees = await readJson('src/data/committees.json');
const speakers = await readJson('src/data/speakers.json');
const sponsors = await readJson('src/data/sponsors.json');
const importantDates = await readJson('src/data/importantDates.json');
const news = await readJson('src/data/news.json');
const site = await readJson('src/data/site.json');
const heroImages = await readJson('src/data/heroImages.json');
const navigation = await readJson('src/data/navigation.json');

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
  const uploadFileName = wordpressAssetFileNames.get(path.posix.basename(cleanPath)) || path.posix.basename(cleanPath);
  return assetBase ? `${assetBase}${uploadFileName}` : `/${cleanPath}`;
};

const getSymposiaHeroImage = (slug = '') => {
  if (!slug.startsWith('symposia/') || !heroImages.length) return undefined;
  const seed = Array.from(slug).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return heroImages[seed % heroImages.length];
};

const wordPressBaseArg = process.argv.find((arg) => arg.startsWith('--wordpress-base='));
const wordPressBase = (wordPressBaseArg?.split('=').slice(1).join('=') || process.env.WORDPRESS_BASE || 'https://attend.ieee.org/ssci-2027/')
  .replace(/\/?$/, '/');

const pageUrl = (value = '') => {
  if (!value) return '';
  if (/^(https?:)?\/\//.test(value) || value.startsWith('mailto:')) return value;
  if (value === '/') return wordPressBase;
  return `${wordPressBase}${value.replace(/^\//, '')}`;
};

const trustedHtmlPattern = /<\/?[a-z][\s\S]*>/i;

const rewriteTrustedHtmlLinks = (html = '') => String(html).replace(
  /\s(href|src)=(["'])\/(?!\/)([^"']*)\2/gi,
  (_match, attr, quote, target) => ` ${attr}=${quote}${escapeHtml(pageUrl(`/${target}`))}${quote}`,
);

const renderInlineContent = (value = '') => {
  const text = String(value);
  return trustedHtmlPattern.test(text) ? rewriteTrustedHtmlLinks(text) : escapeHtml(text);
};

const paragraph = (text) => `<p>${renderInlineContent(text)}</p>`;

const renderTable = (table) => {
  if (!table?.headers?.length || !table?.rows?.length) return '';
  const headers = table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('');
  const rows = table.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInlineContent(cell)}</td>`).join('')}</tr>`)
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

const renderBullet = (item) => {
  if (typeof item === 'string') return renderInlineContent(item);
  if (item?.href && item?.label) {
    return `<a href="${escapeHtml(pageUrl(item.href))}">${escapeHtml(item.label)}</a>`;
  }
  return escapeHtml(item?.label || '');
};

const renderCards = (cards = []) => {
  if (!cards.length) return '';
  return [
    '<div class="ssci-link-card-grid">',
    cards.map((card) => [
      `<a class="ssci-link-card" href="${escapeHtml(pageUrl(card.href))}">`,
      card.image ? `<img src="${escapeHtml(assetUrl(card.image))}" alt="" loading="lazy" />` : '',
      `<span>${escapeHtml(card.title)}</span>`,
      card.text ? `<small>${escapeHtml(card.text)}</small>` : '',
      '</a>',
    ].filter(Boolean).join('\n')).join('\n'),
    '</div>',
  ].join('\n');
};

const renderSections = (sections = []) => sections
  .map((section) => [
    section.heading ? `<h2>${escapeHtml(section.heading)}</h2>` : '',
    ...(section.paragraphs || []).map(paragraph),
    section.bullets?.length
      ? `<ul>${section.bullets.map((item) => `<li>${renderBullet(item)}</li>`).join('')}</ul>`
      : '',
    section.cards?.length ? renderCards(section.cards) : '',
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

const roleHeading = (role) => role.endsWith('Chair') ? `${role}s` : role;

const renderPersonCard = (person) => [
  '<div class="ssci-person-card">',
  person.photo || person.image
    ? `<img src="${escapeHtml(assetUrl(person.photo || person.image))}" alt="${escapeHtml(person.name)}" />`
    : `<div class="ssci-person-placeholder">${escapeHtml(initials(person.name))}</div>`,
  `<h3>${person.href ? `<a href="${escapeHtml(person.href)}">${escapeHtml(person.name)}</a>` : escapeHtml(person.name)}</h3>`,
  person.affiliation ? `<p>${escapeHtml(person.affiliation)}</p>` : '',
  person.status ? `<p><strong>${escapeHtml(person.status)}</strong></p>` : '',
  person.note ? `<p><small>${escapeHtml(person.note)}</small></p>` : '',
  person.talkTitle ? `<p><strong>${escapeHtml(person.talkTitle)}</strong></p>` : '',
  person.dateTime ? `<p>${escapeHtml(person.dateTime)}</p>` : '',
  '</div>',
].filter(Boolean).join('\n');

const renderCommitteeListItem = (member) => [
  '<li>',
  `<strong class="ssci-name">${escapeHtml(member.name)}</strong>`,
  member.affiliation ? `, ${escapeHtml(member.affiliation)}` : '',
  member.status ? `<br /><em>${escapeHtml(member.status)}</em>` : '',
  member.note ? `<br /><small>${escapeHtml(member.note)}</small>` : '',
  '</li>',
].filter(Boolean).join('');

const renderCommitteeFeatureCard = (member) => [
  '<article class="ssci-committee-feature-card">',
  '<div class="ssci-committee-feature-photo">',
  member.photo
    ? `<img src="${escapeHtml(assetUrl(member.photo))}" alt="${escapeHtml(member.name)}" />`
    : `<span>${escapeHtml(initials(member.name))}</span>`,
  '</div>',
  `<h3>${escapeHtml(member.name)}</h3>`,
  member.role ? `<p class="ssci-member-title">${escapeHtml(member.role)}</p>` : '',
  member.affiliation ? `<p class="ssci-member-uni">${escapeHtml(member.affiliation)}</p>` : '',
  member.note ? `<small>${escapeHtml(member.note)}</small>` : '',
  '</article>',
].filter(Boolean).join('\n');

const renderCommittee = (committeeSlug) => {
  const committee = committees.find((item) => item.slug === committeeSlug);
  if (!committee?.members?.length) {
    return '';
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

  if (committee.slug === 'organizing-committee') {
    const generalChairGroup = roleGroups.find((group) => group.role === 'General Chair');
    const listGroups = roleGroups.filter((group) => group.role !== 'General Chair');

    return [
      '<div class="ssci-committee ssci-legacy-committee">',
      generalChairGroup ? [
        '<section class="ssci-committee-feature-section">',
        `<h2 class="ssci-feature-title">${escapeHtml(roleHeading(generalChairGroup.role))}</h2>`,
        '<div class="ssci-committee-feature-grid">',
        generalChairGroup.members.map(renderCommitteeFeatureCard).join('\n'),
        '</div>',
        '</section>',
      ].join('\n') : '',
      '<section class="ssci-committee-role-columns">',
      listGroups.map((group) => [
        '<section class="ssci-committee-role-list">',
        `<h3>${escapeHtml(roleHeading(group.role))}</h3>`,
        '<ul>',
        group.members.map(renderCommitteeListItem).join('\n'),
        '</ul>',
        '</section>',
      ].join('\n')).join('\n'),
      '</section>',
      '</div>',
    ].filter(Boolean).join('\n');
  }

  return [
    `<div class="ssci-committee" aria-label="${escapeHtml(committee.name)}">`,
    ...roleGroups.map((group) => [
      `<h3>${escapeHtml(group.role)}</h3>`,
      '<div class="ssci-card-grid">',
      group.members.map(renderPersonCard).join('\n'),
      '</div>',
    ].join('\n')),
    '</div>',
  ].join('\n\n');
};

const renderSpeakers = () => {
  const sections = [
    ['Plenary Speakers', speakers.plenary || []],
    ['Keynote Speakers', speakers.keynote || []],
  ];

  return sections.filter(([, items]) => items.length).map(([title, items]) => [
    `<h2>${escapeHtml(title)}</h2>`,
    `<div class="ssci-card-grid">${items.map(renderPersonCard).join('\n')}</div>`,
  ].join('\n')).join('\n\n');
};

const renderSponsors = () => {
  if (!sponsors.length) return '';
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

const visibleNavigation = navigation.filter((item) => !item.hidden);

const slugFromHref = (href = '') => {
  if (!href || /^(https?:)?\/\//.test(href) || href.startsWith('mailto:')) return '';
  const cleanHref = href.split('#')[0].split('?')[0].replace(/^\/+|\/+$/g, '');
  return cleanHref || 'home';
};

const exportedSlugOrder = visibleNavigation
  .flatMap((item) => {
    if (item.href) return [slugFromHref(item.href)];
    return (item.items || []).filter((child) => !child.hidden).map((child) => slugFromHref(child.href));
  })
  .filter(Boolean);

const exportedSlugSet = new Set(exportedSlugOrder);

const renderHeader = () => [
  '<header class="ssci-wp-site-header">',
  '<div class="ssci-wp-ieee-bar">',
  '<nav class="ssci-wp-ieee-links" aria-label="IEEE links">',
  site.ieeeLinks.map((link) => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`).join('\n'),
  '</nav>',
  '<a class="ssci-wp-join-link" href="https://www.ieee.org/join" target="_blank" rel="noreferrer">Join IEEE</a>',
  '</div>',
  '<div class="ssci-wp-main-nav-wrap">',
  `<a class="ssci-wp-brand" href="${escapeHtml(pageUrl('/'))}" aria-label="${escapeHtml(site.shortName)} home">`,
  `<img class="ssci-wp-brand-logo" src="${escapeHtml(assetUrl('/assets/images/ssci-2027-logo.svg'))}" alt="${escapeHtml(site.shortName)} logo" width="280" height="72" />`,
  '</a>',
  '<input class="ssci-wp-nav-toggle" type="checkbox" id="ssci-wp-nav-toggle" aria-label="Toggle navigation" />',
  '<label class="ssci-wp-nav-toggle-button" for="ssci-wp-nav-toggle" aria-hidden="true"><span></span><span></span><span></span></label>',
  '<nav class="ssci-wp-primary-nav" aria-label="Primary navigation">',
  '<ul>',
  visibleNavigation.map((item) => {
    if (item.href) {
      return `<li class="ssci-wp-nav-item"><a href="${escapeHtml(pageUrl(item.href))}">${escapeHtml(item.label)}</a></li>`;
    }

    const children = (item.items || []).filter((child) => !child.hidden);
    const parentHref = children[0]?.href || '/';
    return [
      '<li class="ssci-wp-nav-item ssci-wp-has-menu">',
      `<a href="${escapeHtml(pageUrl(parentHref))}" aria-haspopup="true">${escapeHtml(item.label)}</a>`,
      '<ul class="ssci-wp-dropdown">',
      children.map((child) => (
        `<li><a href="${escapeHtml(pageUrl(child.href))}">${escapeHtml(child.label)}</a></li>`
      )).join('\n'),
      '</ul>',
      '</li>',
    ].join('\n');
  }).join('\n'),
  '</ul>',
  '</nav>',
  '</div>',
  '</header>',
].join('\n');

const footerLinks = [
  { label: 'Home', href: '/' },
  { label: 'Call for Papers', href: '/submissions/call-for-papers/' },
  { label: 'Symposia Overview', href: '/symposia/' },
];

const renderFooter = () => [
  '<footer class="ssci-wp-site-footer">',
  '<div class="ssci-wp-footer-inner">',
  '<section>',
  `<h2>${escapeHtml(site.shortName)}</h2>`,
  `<p>${escapeHtml(site.name)}</p>`,
  `<p>${escapeHtml(site.locationLabel)} · ${escapeHtml(site.datesLabel)}</p>`,
  '</section>',
  '<section>',
  '<h2>Quick Links</h2>',
  '<nav aria-label="Footer navigation">',
  footerLinks.map((item) => `<a href="${escapeHtml(pageUrl(item.href))}">${escapeHtml(item.label)}</a>`).join('\n'),
  '</nav>',
  '</section>',
  '<section>',
  '<h2>Contact</h2>',
  `<a href="${escapeHtml(pageUrl('/about/contact/'))}">Contact Us</a>`,
  '</section>',
  '</div>',
  '<div class="ssci-wp-footer-bottom">',
  `<span>© ${escapeHtml(site.year)} IEEE SSCI.</span>`,
  '</div>',
  '</footer>',
].join('\n');

const renderSponsorStrip = () => {
  if (!sponsors.length) return '';
  return [
    '<section class="ssci-wp-section ssci-sponsors-section">',
    '<div class="ssci-section-title"><p>Sponsors</p></div>',
    '<div class="ssci-sponsor-strip" aria-label="Sponsors">',
    sponsors.map((sponsor) => [
      '<div class="ssci-sponsor-strip-item">',
      sponsor.href ? `<a href="${escapeHtml(sponsor.href)}" target="_blank" rel="noreferrer">` : '',
      sponsor.logo
        ? `<img src="${escapeHtml(assetUrl(sponsor.logo))}" alt="${escapeHtml(sponsor.name)}" />`
        : `<span>${escapeHtml(sponsor.name)}</span>`,
      sponsor.href ? '</a>' : '',
      '</div>',
    ].filter(Boolean).join('\n')).join('\n'),
    '</div>',
    '</section>',
  ].join('\n');
};

const renderSpeakerSection = (title, items = []) => [
  items.length ? [
  '<section class="ssci-speaker-section">',
  `<h2>${escapeHtml(title)}</h2>`,
  `<div class="ssci-speaker-grid">${items.map(renderPersonCard).join('\n')}</div>`,
  '</section>',
  ].join('\n') : '',
].join('');

const renderHomePage = () => {
  const heroImage = heroImages[3] || heroImages[0];
  const inlineImage = heroImages[1] || heroImage;
  const heroCycleSeconds = Math.max(heroImages.length, 1) * 6;

  return [
    `<!-- WordPress export for ${escapeHtml(site.shortName)}: home -->`,
    '<div class="ssci-wp ssci-wp-home">',
    `<section class="ssci-wp-hero" aria-label="Gold Coast images" style="--ssci-hero-duration: ${heroCycleSeconds}s;">`,
    '<div class="ssci-wp-hero-slides" aria-hidden="true">',
    heroImages.map((image, index) => [
      `<figure class="ssci-wp-hero-slide" style="--ssci-hero-delay: ${index * 6}s;">`,
      `<img src="${escapeHtml(assetUrl(image.src))}" alt="" loading="${index === 0 ? 'eager' : 'lazy'}" />`,
      '</figure>',
    ].join('\n')).join('\n'),
    '</div>',
    '<div class="ssci-wp-hero-caption">',
    `<p>${escapeHtml(site.year)} ${escapeHtml(site.name)}</p>`,
    `<h1>${escapeHtml(site.shortName)}</h1>`,
    `<span>${escapeHtml(site.locationLabel)} · ${escapeHtml(site.datesLabel)}</span>`,
    '</div>',
    '</section>',
    '<section class="ssci-wp-section ssci-welcome-section">',
    renderNews(),
    '<div class="ssci-welcome-content">',
    `<h2>${escapeHtml(site.welcomeTitle)}</h2>`,
    `<p><img class="ssci-welcome-image" src="${escapeHtml(assetUrl(inlineImage.src))}" alt="${escapeHtml(inlineImage.alt)}" />${escapeHtml(site.welcomeBody[0] || '')}</p>`,
    ...(site.welcomeBody.slice(1) || []).map(paragraph),
    '</div>',
    '</section>',
    '<section class="ssci-wp-section ssci-soft-section">',
    renderDateList(),
    '</section>',
    (speakers.plenary.length || speakers.keynote.length) ? [
      '<section class="ssci-wp-section ssci-speakers-section">',
      renderSpeakerSection('Plenary Speakers', speakers.plenary),
      renderSpeakerSection('Keynote Speakers', speakers.keynote),
      '</section>',
    ].join('\n') : '',
    '</div>',
  ].filter(Boolean).join('\n\n');
};

const renderPage = (page) => {
  if (page.slug === 'home') return renderHomePage();
  const symposiaHeroImage = getSymposiaHeroImage(page.slug);

  return [
    `<!-- WordPress export for ${escapeHtml(site.shortName)}: ${escapeHtml(page.title)} -->`,
    `<div class="ssci-wp ssci-wp-page${page.slug === 'symposia' ? ' ssci-symposia-overview-page' : ''}${page.slug === 'submissions/call-for-papers' ? ' ssci-call-for-papers-page' : ''}${page.slug === 'submissions/instructions' ? ' ssci-submission-instructions-page' : ''}">`,
    '<header class="ssci-page-heading">',
    '<p class="ssci-sub-header">IEEE SSCI 2027</p>',
    `<h1>${escapeHtml(page.title)}</h1>`,
    page.summary ? `<p>${escapeHtml(page.summary)}</p>` : '',
    '</header>',
    symposiaHeroImage
      ? `<img class="ssci-content-hero-image" src="${escapeHtml(assetUrl(symposiaHeroImage.src))}" alt="${escapeHtml(symposiaHeroImage.alt || '')}" loading="lazy" />`
      : '',
    '<div class="ssci-page-content">',
    renderSections(page.sections),
    page.kind === 'committee' ? renderCommittee(page.committeeSlug) : '',
    page.kind === 'speakers' ? renderSpeakers() : '',
    page.kind === 'sponsors' ? renderSponsors() : '',
    '</div>',
    '</div>',
  ].filter(Boolean).join('\n\n');
};

const renderFullWordPressPage = (page) => [
  '<script>document.body.classList.add("ssci-wp-page-active");</script>',
  '<style>',
  wordpressCss.trim(),
  '</style>',
  '<div class="ssci-wp-shell">',
  renderHeader(),
  '<main class="ssci-wp-main">',
  renderPage(page),
  '</main>',
  renderFooter(),
  '</div>',
].join('\n');

const collectPageFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(dir, entry.name);
    return entry.isDirectory() ? collectPageFiles(entryPath) : entryPath;
  }));
  return files.flat().filter((file) => file.endsWith('.json'));
};

const pageFiles = await collectPageFiles(pagesDir);
const allPages = await Promise.all(pageFiles.map(async (file) => JSON.parse(await readFile(file, 'utf8'))));
allPages.push({
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

const pageBySlug = new Map(allPages.map((page) => [page.slug, page]));
const missingExportSlugs = exportedSlugOrder.filter((slug) => !pageBySlug.has(slug));
if (missingExportSlugs.length) {
  console.warn(`Warning: navigation points to missing pages: ${missingExportSlugs.join(', ')}`);
}

const pages = exportedSlugOrder
  .map((slug) => pageBySlug.get(slug))
  .filter(Boolean);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const index = [];
for (const page of pages) {
  const fileName = `${page.slug.replaceAll('/', '__')}.html`;
  index.push({
    title: page.title,
    slug: page.slug,
    wordpressPath: page.slug === 'home' ? '/' : `/${page.slug}/`,
    file: `full-pages/${fileName}`,
    kind: page.kind,
  });
}

const parentPageSetups = [
  { title: 'About', slug: 'about', parent: '', targetPath: '/about/', note: 'Parent page for About child pages; content can be empty or a simple redirect.' },
  { title: 'Submissions', slug: 'submissions', parent: '', targetPath: '/submissions/', note: 'Parent page for submission child pages; content can be empty or a simple redirect.' },
  { title: 'Program', slug: 'program', parent: '', targetPath: '/program/', note: 'Parent page for program child pages; content can be empty or a simple redirect.' },
  { title: 'Venue and Travel', slug: 'venue-travel', parent: '', targetPath: '/venue-travel/', note: 'Parent page for venue/travel child pages; edit slug manually to venue-travel.' },
  { title: 'Sponsors', slug: 'sponsors', parent: '', targetPath: '/sponsors/', note: 'Parent page for sponsor child pages; content can be empty or a simple redirect.' },
].filter((setup) => pages.some((page) => page.slug.startsWith(`${setup.slug}/`) && !exportedSlugSet.has(setup.slug)));

const pageSetups = pages.map((page) => {
  const parts = page.slug === 'home' ? [] : page.slug.split('/');
  const parentSlug = parts.length > 1 ? parts[0] : '';
  const parentTitleMap = {
    about: 'About',
    submissions: 'Submissions',
    symposia: 'Symposia',
    program: 'Program',
    'venue-travel': 'Venue and Travel',
    sponsors: 'Sponsors',
  };

  return {
    title: page.slug === 'home' ? 'IEEE SSCI 2027' : page.title,
    slug: page.slug === 'home' ? 'home' : parts.at(-1),
    parent: parentTitleMap[parentSlug] || '',
    targetPath: page.slug === 'home' ? '/' : `/${page.slug}/`,
    file: `full-pages/${page.slug.replaceAll('/', '__')}.html`,
    note: page.slug === 'home' ? 'Set this published page as the static homepage in Settings > Reading.' : '',
  };
});

const wordpressCss = `
/* IEEE SSCI 2027 WordPress export CSS. Paste into WPBakery Page Builder > Custom CSS. */
body.ssci-wp-page-active header#header.site-header,
body.ssci-wp-page-active footer#colophon.site-footer,
body.ssci-wp-page-active #top-link-block,
body:has(.ssci-wp-shell) header#header.site-header,
body:has(.ssci-wp-shell) footer#colophon.site-footer,
body:has(.ssci-wp-shell) #top-link-block {
  display: none !important;
}

body.ssci-wp-page-active #content.site-content,
body.ssci-wp-page-active .site-content,
body.ssci-wp-page-active .entry-content,
body.ssci-wp-page-active .wpb-content-wrapper,
body.ssci-wp-page-active #content.site-content > .container,
body.ssci-wp-page-active #content.site-content > .container > .row,
body.ssci-wp-page-active #content.site-content > .container > .row > [class*="col-"],
body.ssci-wp-page-active article.hentry,
body.ssci-wp-page-active .entry-container,
body.ssci-wp-page-active .wpb_raw_code,
body.ssci-wp-page-active .wpb_content_element,
body.ssci-wp-page-active .vc_row,
body.ssci-wp-page-active .vc_column-inner,
body.ssci-wp-page-active .wpb_wrapper,
body:has(.ssci-wp-shell) #content.site-content,
body:has(.ssci-wp-shell) .site-content,
body:has(.ssci-wp-shell) .entry-content,
body:has(.ssci-wp-shell) .wpb-content-wrapper,
body:has(.ssci-wp-shell) #content.site-content > .container,
body:has(.ssci-wp-shell) #content.site-content > .container > .row,
body:has(.ssci-wp-shell) #content.site-content > .container > .row > [class*="col-"],
body:has(.ssci-wp-shell) article.hentry,
body:has(.ssci-wp-shell) .entry-container,
body:has(.ssci-wp-shell) .wpb_raw_code,
body:has(.ssci-wp-shell) .wpb_content_element,
body:has(.ssci-wp-shell) .vc_row,
body:has(.ssci-wp-shell) .vc_column-inner,
body:has(.ssci-wp-shell) .wpb_wrapper {
  margin-top: 0 !important;
  padding-top: 0 !important;
}

body.ssci-wp-page-active #content.site-content > .container,
body.ssci-wp-page-active #content.site-content > .container > .row,
body.ssci-wp-page-active #content.site-content > .container > .row > [class*="col-"],
body.ssci-wp-page-active article.hentry,
body.ssci-wp-page-active .entry-container,
body.ssci-wp-page-active .entry-content,
body.ssci-wp-page-active .wpb-content-wrapper,
body.ssci-wp-page-active .vc_row,
body.ssci-wp-page-active .vc_column-inner,
body.ssci-wp-page-active .wpb_wrapper,
body:has(.ssci-wp-shell) #content.site-content > .container,
body:has(.ssci-wp-shell) #content.site-content > .container > .row,
body:has(.ssci-wp-shell) #content.site-content > .container > .row > [class*="col-"],
body:has(.ssci-wp-shell) article.hentry,
body:has(.ssci-wp-shell) .entry-container,
body:has(.ssci-wp-shell) .entry-content,
body:has(.ssci-wp-shell) .wpb-content-wrapper,
body:has(.ssci-wp-shell) .vc_row,
body:has(.ssci-wp-shell) .vc_column-inner,
body:has(.ssci-wp-shell) .wpb_wrapper {
  width: 100% !important;
  max-width: none !important;
  margin-right: 0 !important;
  margin-left: 0 !important;
  padding-right: 0 !important;
  padding-left: 0 !important;
}

body.ssci-wp-page-active .entry-content.padding,
body:has(.ssci-wp-shell) .entry-content.padding {
  padding-top: 0 !important;
  padding-right: 0 !important;
  padding-bottom: 0 !important;
  padding-left: 0 !important;
}

.ssci-wp-shell,
.ssci-wp-shell * {
  box-sizing: border-box;
}

.ssci-wp-shell {
  --ssci-ink: #102033;
  --ssci-muted: #52677a;
  --ssci-line: #d8e7ef;
  --ssci-soft: #f4f9fc;
  --ssci-blue: #00629b;
  --ssci-teal: #008c95;
  --ssci-orange: #c2410c;
  --ssci-gold: #f2a900;
  --ssci-navy: #082f49;
  color: var(--ssci-ink);
  font-family: Inter, Roboto, Arial, sans-serif;
  font-size: 17px;
}

.ssci-wp-shell a {
  color: var(--ssci-teal);
  text-decoration: none;
}

.ssci-wp-shell a:hover {
  color: var(--ssci-orange);
}

.ssci-wp-site-header {
  position: sticky;
  top: 0;
  z-index: 999;
  width: 100vw;
  margin-left: calc(50% - 50vw);
  margin-right: calc(50% - 50vw);
  background: #f4f9fc;
  box-shadow: 0 2px 18px rgba(8, 47, 73, 0.1);
  line-height: 1.2;
}

.ssci-wp-ieee-bar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  width: min(1140px, calc(100% - 32px));
  margin: 0 auto;
  padding: 8px 0 0;
  color: var(--ssci-navy);
  font-size: 13px;
  font-weight: 600;
}

.ssci-wp-ieee-bar a,
.ssci-wp-primary-nav,
.ssci-wp-primary-nav ul,
.ssci-wp-nav-item {
  line-height: 1.2 !important;
}

.ssci-wp-ieee-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
}

.ssci-wp-ieee-links a,
.ssci-wp-join-link {
  color: var(--ssci-navy) !important;
}

.ssci-wp-ieee-links a + a::before {
  margin: 0 8px;
  color: #7893a6;
  content: "|";
}

.ssci-wp-main-nav-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  width: min(1140px, calc(100% - 32px));
  min-height: 104px;
  margin: 0 auto;
}

.ssci-wp-brand {
  display: inline-flex;
  align-items: center;
  min-width: 250px;
  color: var(--ssci-ink);
}

.ssci-wp-brand-logo {
  display: block;
  width: 250px;
  height: auto;
}

.ssci-wp-primary-nav > ul {
  display: flex;
  align-items: center;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ssci-wp-nav-item {
  position: relative;
}

.ssci-wp-has-menu {
  margin: 0;
  padding: 0;
}

.ssci-wp-nav-item > a,
.ssci-wp-nav-item > button {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 40px;
  margin: 0;
  padding: 10px 0 10px 16px;
  border: 0;
  color: var(--ssci-navy) !important;
  background: transparent;
  font: inherit;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2 !important;
  white-space: nowrap;
  cursor: pointer;
}

.ssci-wp-nav-item > a:hover,
.ssci-wp-nav-item > button:hover,
.ssci-wp-nav-item:focus-within > a,
.ssci-wp-nav-item:focus-within > button {
  color: var(--ssci-blue) !important;
}

.ssci-wp-dropdown {
  position: absolute;
  top: calc(100% + 30px);
  left: 14px;
  z-index: 1000;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  width: max-content;
  min-width: 230px;
  max-width: min(720px, calc(100vw - 32px));
  margin: 0;
  padding: 8px 0;
  list-style: none;
  background: #fff;
  box-shadow: 0 0 30px rgba(127, 137, 161, 0.25);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease, top 0.3s ease;
}

.ssci-wp-dropdown::before {
  position: absolute;
  right: 0;
  bottom: 100%;
  left: 0;
  height: 18px;
  content: "";
}

.ssci-wp-has-menu:hover .ssci-wp-dropdown,
.ssci-wp-has-menu:focus-within .ssci-wp-dropdown {
  top: 100%;
  opacity: 1;
  pointer-events: auto;
}

.ssci-wp-primary-nav > ul > .ssci-wp-nav-item:nth-last-child(-n+2) .ssci-wp-dropdown {
  right: 0;
  left: auto;
}

.ssci-wp-dropdown a {
  display: block;
  padding: 8px 18px;
  color: var(--ssci-ink) !important;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  white-space: normal;
}

.ssci-wp-dropdown a:hover {
  color: var(--ssci-orange) !important;
}

.ssci-wp-nav-toggle,
.ssci-wp-nav-toggle-button {
  display: none;
}

.ssci-wp-main {
  width: 100%;
}

.ssci-wp,
.ssci-wp * {
  box-sizing: border-box;
}

.ssci-wp {
  --ssci-ink: #102033;
  --ssci-muted: #52677a;
  --ssci-line: #d8e7ef;
  --ssci-soft: #f4f9fc;
  --ssci-blue: #00629b;
  --ssci-teal: #008c95;
  --ssci-orange: #c2410c;
  --ssci-gold: #f2a900;
  --ssci-navy: #082f49;
  width: min(1140px, calc(100% - 32px));
  margin: 0 auto;
  color: var(--ssci-ink);
  font-family: Inter, Roboto, Arial, sans-serif;
  line-height: 1.72;
}

.ssci-wp a {
  color: var(--ssci-teal);
  text-decoration: none;
}

.ssci-wp a:hover {
  color: var(--ssci-orange);
}

.ssci-wp img {
  display: block;
  max-width: 100%;
}

.ssci-wp h1,
.ssci-wp h2,
.ssci-wp h3 {
  letter-spacing: 0;
}

.ssci-wp p {
  margin: 0 0 18px;
  color: var(--ssci-muted);
  font-size: 18px;
}

.ssci-wp-hero {
  position: relative;
  width: 100vw;
  min-height: max(500px, calc(100vh - 132px));
  margin-left: calc(50% - 50vw);
  margin-right: calc(50% - 50vw);
  overflow: hidden;
  background-color: #102b3c;
}

.ssci-wp-hero::after {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  background: linear-gradient(180deg, rgba(15, 38, 52, 0.05), rgba(15, 38, 52, 0.16));
  content: "";
  pointer-events: none;
}

.ssci-wp-hero-slides,
.ssci-wp-hero-slide {
  position: absolute;
  inset: 0;
}

.ssci-wp-hero-slide {
  margin: 0;
  opacity: 0;
  animation: ssciHeroFade var(--ssci-hero-duration, 36s) infinite;
  animation-delay: var(--ssci-hero-delay, 0s);
}

.ssci-wp-hero-slide img {
  width: 100%;
  height: 100%;
  max-width: none;
  object-fit: cover;
  animation: ssciHeroZoom var(--ssci-hero-duration, 36s) ease-in-out infinite;
  animation-delay: var(--ssci-hero-delay, 0s);
}

@keyframes ssciHeroFade {
  0%,
  16% {
    opacity: 1;
  }

  22%,
  94% {
    opacity: 0;
  }

  100% {
    opacity: 1;
  }
}

@keyframes ssciHeroZoom {
  0%,
  100% {
    transform: scale(1.02);
  }

  50% {
    transform: scale(1.08);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ssci-wp-hero-slide,
  .ssci-wp-hero-slide img {
    animation: none;
  }

  .ssci-wp-hero-slide:first-child {
    opacity: 1;
  }
}

.ssci-wp-hero-caption {
  position: absolute;
  right: 0;
  bottom: 10%;
  left: 0;
  z-index: 2;
  padding: 18px 24px;
  color: #111;
  background: rgba(244, 248, 249, 0.72);
  text-align: center;
}

.ssci-wp-hero-caption p,
.ssci-wp-hero-caption span {
  display: block;
  margin: 0;
  color: #111;
  font-size: clamp(18px, 2vw, 23px);
  font-weight: 700;
}

.ssci-wp-hero-caption h1 {
  margin: 4px 0;
  color: #111;
  font-size: clamp(42px, 5vw, 64px);
  font-weight: 800;
  line-height: 1.1;
}

.ssci-wp-section {
  padding: 28px 0 46px;
  overflow: hidden;
}

.ssci-soft-section {
  width: 100vw;
  margin-left: calc(50% - 50vw);
  margin-right: calc(50% - 50vw);
  padding-right: max(16px, calc((100vw - 1140px) / 2));
  padding-left: max(16px, calc((100vw - 1140px) / 2));
  background: var(--ssci-soft);
}

.ssci-welcome-section {
  padding-top: 20px;
}

.ssci-welcome-content {
  padding-top: 30px;
}

.ssci-welcome-content h2 {
  margin: 0 0 18px;
  color: var(--ssci-navy);
  font-size: clamp(30px, 3vw, 42px);
  font-weight: 700;
  line-height: 1.2;
}

.ssci-welcome-image {
  float: left;
  width: min(420px, 40%);
  margin: 4px 24px 14px 0;
}

.ssci-section-title {
  padding-bottom: 30px;
  text-align: center;
}

.ssci-section-title p,
.ssci-wp .ssci-date-list + h2,
.ssci-wp .ssci-soft-section > h2,
.ssci-wp .ssci-date-list ~ h2 {
  position: relative;
  margin: 0 0 15px;
  padding-bottom: 15px;
  color: var(--ssci-navy);
  font-size: 34px;
  font-weight: 700;
}

.ssci-section-title p::after {
  position: absolute;
  bottom: 0;
  left: calc(50% - 30px);
  display: block;
  width: 60px;
  height: 2px;
  background: var(--ssci-gold);
  content: "";
}

.ssci-soft-section > h2::after {
  position: absolute;
  bottom: 0;
  left: 0;
  display: block;
  width: 60px;
  height: 2px;
  background: var(--ssci-orange);
  content: "";
}

.ssci-date-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ssci-date-list li {
  display: grid;
  gap: 2px;
  padding: 14px 16px;
  border: 1px solid var(--ssci-line);
  background: #fff;
}

.ssci-date-list strong {
  color: var(--ssci-ink);
  font-size: 18px;
}

.ssci-date-list em {
  color: var(--ssci-orange);
  font-style: normal;
  font-weight: 700;
}

.ssci-news-list {
  display: grid;
  gap: 14px;
  max-height: 340px;
  margin-bottom: 28px;
  overflow-y: auto;
  padding-right: 8px;
  scrollbar-gutter: stable;
}

.ssci-news-list article {
  padding: 16px 18px;
  border-left: 5px solid var(--ssci-orange);
  background: #fff;
}

.ssci-sponsor-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 34px;
  padding: 8px 0 20px;
}

.ssci-sponsor-strip-item {
  display: grid;
  place-items: center;
  min-width: 160px;
  min-height: 90px;
}

.ssci-sponsor-strip img {
  width: auto;
  max-width: 205px;
  max-height: 72px;
  object-fit: contain;
}

.ssci-sponsor-strip span {
  color: var(--ssci-teal);
  font-weight: 800;
}

.ssci-speaker-section {
  margin-top: 28px;
}

.ssci-speaker-section + .ssci-speaker-section {
  margin-top: 42px;
}

.ssci-speaker-section > h2 {
  margin: 0 0 24px;
  padding: 12px 20px;
  color: #fff;
  background: var(--ssci-blue);
  font-size: 18px;
  font-weight: 800;
  text-transform: uppercase;
}

.ssci-card-grid,
.ssci-speaker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 24px;
  margin: 18px 0 36px;
}

.ssci-person-card,
.ssci-sponsor-card {
  border: 1px solid var(--ssci-line);
  padding: 18px;
  background: #fff;
}

.ssci-person-card {
  text-align: center;
}

.ssci-person-card img,
.ssci-person-placeholder {
  width: 92px;
  height: 92px;
  margin: 0 auto 12px;
  border-radius: 50%;
  object-fit: cover;
}

.ssci-person-placeholder {
  display: grid;
  place-items: center;
  background: #e8f0f2;
  color: var(--ssci-teal);
  font-weight: 700;
}

.ssci-person-card h3 {
  margin: 8px 0 6px;
  color: var(--ssci-teal);
  font-size: 19px;
}

.ssci-empty-state {
  padding: 18px 20px;
  border: 1px dashed #b9c7d3;
  background: #fff;
}

.ssci-page-heading {
  margin: 0 0 26px;
  padding-top: 54px;
}

.ssci-sub-header {
  margin: 0 0 8px !important;
  color: var(--ssci-teal) !important;
  font-size: 14px !important;
  font-weight: 800;
  text-transform: uppercase;
}

.ssci-page-heading h1 {
  margin: 0 0 10px;
  color: var(--ssci-navy);
  font-size: clamp(30px, 3vw, 40px);
  font-weight: 700;
  line-height: 1.2;
}

.ssci-page-content {
  padding-bottom: 64px;
}

.ssci-content-hero-image {
  display: block;
  width: 100%;
  height: clamp(220px, 28vw, 360px);
  margin: 0 0 30px;
  object-fit: cover;
}

.ssci-page-content h2 {
  margin: 24px 0 10px;
  color: var(--ssci-navy);
  font-size: clamp(21px, 2vw, 27px);
  font-weight: 700;
}

.ssci-page-content h3 {
  margin: 20px 0 10px;
  color: var(--ssci-ink);
  font-size: 19px;
  font-weight: 800;
}

.ssci-page-content > ul {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0 0 18px;
  padding-left: 22px;
}

.ssci-link-card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin: 0 0 22px;
}

.ssci-link-card {
  display: grid;
  grid-template-rows: 130px auto 1fr;
  min-height: 230px;
  overflow: hidden;
  border: 1px solid var(--ssci-line);
  color: var(--ssci-ink) !important;
  background: #fff;
  box-shadow: 0 8px 24px rgba(31, 41, 51, 0.08);
}

.ssci-link-card:hover {
  color: var(--ssci-teal) !important;
}

.ssci-link-card img {
  width: 100%;
  height: 130px;
  object-fit: cover;
}

.ssci-link-card span,
.ssci-link-card small {
  display: block;
  padding: 0 16px;
}

.ssci-link-card span {
  padding-top: 14px;
  font-weight: 800;
  line-height: 1.25;
}

.ssci-link-card small {
  padding-top: 8px;
  padding-bottom: 16px;
  color: var(--ssci-muted);
  line-height: 1.45;
}

.ssci-symposia-overview-page .ssci-page-content > ul {
  display: block;
}

.ssci-call-for-papers-page .ssci-page-content > ul {
  display: block;
}

.ssci-submission-instructions-page .ssci-page-content > ul {
  display: block;
}

.ssci-symposia-overview-page .ssci-page-content > ul li,
.ssci-call-for-papers-page .ssci-page-content > ul li,
.ssci-submission-instructions-page .ssci-page-content > ul li {
  margin-bottom: 8px;
}

@media (max-width: 900px) {
  .ssci-page-content > ul,
  .ssci-link-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .ssci-page-content > ul,
  .ssci-link-card-grid {
    grid-template-columns: 1fr;
  }
}

.ssci-page-content li::marker {
  color: var(--ssci-teal);
}

.ssci-page-content table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  background: #fff;
}

.ssci-page-content th,
.ssci-page-content td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--ssci-line);
  text-align: left;
  vertical-align: top;
}

.ssci-page-content th {
  color: #fff;
  background: var(--ssci-blue);
  font-weight: 800;
}

.ssci-page-content .wp-block-table {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid var(--ssci-line);
}

.ssci-committee-feature-section {
  margin-bottom: 34px;
}

.ssci-feature-title {
  margin: 0 0 24px !important;
  color: var(--ssci-navy) !important;
  font-size: clamp(32px, 3vw, 38px) !important;
  text-align: left;
}

.ssci-committee-feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 24px;
  margin-bottom: 26px;
}

.ssci-committee-feature-card {
  text-align: center;
}

.ssci-committee-feature-photo {
  display: grid;
  place-items: center;
  width: 210px;
  height: 210px;
  margin: 0 auto 16px;
  overflow: hidden;
  border-radius: 50%;
  background: #e8f0f2;
  color: var(--ssci-teal);
  font-size: 42px;
  font-weight: 800;
}

.ssci-committee-feature-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ssci-committee-feature-card h3 {
  margin: 0 0 10px;
  font-size: clamp(22px, 2vw, 30px);
  font-weight: 400;
}

.ssci-member-title,
.ssci-member-uni,
.ssci-committee-feature-card a,
.ssci-committee-feature-card small {
  display: block;
  margin: 0 0 8px;
}

.ssci-member-title {
  color: #2f8aa5 !important;
  font-size: 18px !important;
}

.ssci-member-uni {
  color: #000 !important;
}

.ssci-committee-role-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px 44px;
  padding-top: 18px;
  border-top: 1px solid #e5e5e5;
}

.ssci-committee-role-list h3 {
  margin: 0 0 10px;
  color: var(--ssci-ink);
  font-size: 20px;
  font-weight: 800;
}

.ssci-committee-role-list ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding-left: 22px;
}

.ssci-name {
  color: var(--ssci-teal);
}

.ssci-wp-site-footer {
  width: 100vw;
  margin-left: calc(50% - 50vw);
  margin-right: calc(50% - 50vw);
  color: rgba(255, 255, 255, 0.78);
  background: var(--ssci-navy);
}

.ssci-wp-footer-inner {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr;
  gap: 30px;
  width: min(1140px, calc(100% - 32px));
  margin: 0 auto;
  padding: 44px 0;
}

.ssci-wp-site-footer h2 {
  margin: 0 0 10px;
  color: #fff;
  font-size: 17px;
  font-weight: 800;
}

.ssci-wp-site-footer p {
  margin: 0 0 8px;
  color: rgba(255, 255, 255, 0.82);
}

.ssci-wp-site-footer nav {
  display: grid;
  gap: 7px;
}

.ssci-wp-site-footer a {
  color: #fff;
}

.ssci-wp-footer-bottom {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  width: min(1140px, calc(100% - 32px));
  margin: 0 auto;
  padding: 16px 0 22px;
  border-top: 1px solid rgba(255, 255, 255, 0.16);
  font-size: 14px;
}

@media (max-width: 1180px) {
  .ssci-wp-nav-item > a,
  .ssci-wp-nav-item > button {
    padding-left: 14px;
    font-size: 14px;
  }

  .ssci-wp-brand {
    min-width: 220px;
  }

  .ssci-wp-brand-logo {
    width: 220px;
  }
}

@media (max-width: 980px) {
  .ssci-wp-ieee-bar {
    width: min(100% - 32px, 680px);
  }

  .ssci-wp-main-nav-wrap {
    min-height: 74px;
  }

  .ssci-wp-nav-toggle-button {
    display: grid;
    gap: 5px;
    width: 42px;
    padding: 10px;
    border: 1px solid var(--ssci-line);
    cursor: pointer;
  }

  .ssci-wp-nav-toggle-button span {
    display: block;
    height: 2px;
    background: var(--ssci-ink);
  }

  .ssci-wp-primary-nav {
    position: absolute;
    right: 16px;
    left: 16px;
    top: calc(100% + 8px);
    display: none;
    max-height: calc(100vh - 140px);
    overflow: auto;
    padding: 10px;
    border: 1px solid var(--ssci-line);
    background: #fff;
    box-shadow: 0 18px 45px rgba(31, 41, 51, 0.12);
  }

  .ssci-wp-nav-toggle:checked ~ .ssci-wp-primary-nav {
    display: block;
  }

  .ssci-wp-primary-nav > ul {
    display: grid;
    align-items: stretch;
  }

  .ssci-wp-nav-item > a,
  .ssci-wp-nav-item > button {
    width: 100%;
    justify-content: space-between;
    padding: 10px 12px;
  }

  .ssci-wp-dropdown {
    position: static;
    display: grid;
    width: auto;
    min-width: 0;
    max-width: none;
    margin: 0 0 8px 10px;
    padding: 0 0 0 10px;
    border-left: 2px solid var(--ssci-line);
    box-shadow: none;
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }

  .ssci-wp-dropdown a {
    white-space: normal;
  }

  .ssci-wp-footer-inner {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .ssci-wp-ieee-bar {
    display: none;
  }

  .ssci-wp-brand {
    min-width: 0;
  }

  .ssci-wp-brand-logo {
    width: min(220px, calc(100vw - 96px));
  }

  .ssci-wp {
    width: min(100% - 24px, 620px);
  }

  .ssci-wp-hero {
    min-height: 520px;
  }

  .ssci-welcome-image {
    float: none;
    width: 100%;
    margin: 0 0 18px;
  }

  .ssci-committee-role-columns {
    grid-template-columns: 1fr;
  }

  .ssci-committee-feature-photo {
    width: 170px;
    height: 170px;
  }

  .ssci-wp-footer-bottom {
    flex-direction: column;
  }
}
`;

await writeFile(path.join(outputDir, '_ssci-wordpress.css'), wordpressCss.trimStart());
await writeFile(path.join(outputDir, '_optional-helper.css'), wordpressCss.trimStart());
const fullPagesDir = path.join(outputDir, 'full-pages');
await mkdir(fullPagesDir, { recursive: true });
for (const page of pages) {
  const fileName = `${page.slug.replaceAll('/', '__')}.html`;
  await writeFile(path.join(fullPagesDir, fileName), `${renderFullWordPressPage(page)}\n`);
}

await writeFile(path.join(outputDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);

const setupGuide = [
  '# IEEE SSCI 2027 WordPress Page Setup',
  '',
  'Create parent pages first, then child pages. The page title is for WordPress administration and SEO; the slug plus parent controls the permalink used by the exported navigation.',
  '',
  '## Parent Pages',
  '',
  '| Title | Slug | Parent | Target URL | Note |',
  '| --- | --- | --- | --- | --- |',
  ...parentPageSetups.map((row) => `| ${row.title} | ${row.slug} | ${row.parent || '-'} | ${row.targetPath} | ${row.note} |`),
  '',
  '## Content Pages',
  '',
  '| Title | Slug | Parent | Target URL | HTML file | Note |',
  '| --- | --- | --- | --- | --- | --- |',
  ...pageSetups.map((row) => `| ${row.title} | ${row.slug} | ${row.parent || '-'} | ${row.targetPath} | ${row.file} | ${row.note} |`),
  '',
].join('\n');

await writeFile(path.join(outputDir, '_wordpress-page-setup.md'), `${setupGuide}\n`);

console.log(`Exported ${pages.length} WordPress HTML files to ${path.relative(root, fullPagesDir)}/`);
