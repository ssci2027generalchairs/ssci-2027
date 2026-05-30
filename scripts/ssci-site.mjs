#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'wordpress-export');
const pdfUpdatesDir = path.join(outputDir, 'pdf-updates');

const args = process.argv.slice(2);
const command = args[0];
const commandArgs = args.slice(1);

const usage = `SSCI site maintenance CLI

Usage:
  npm run ssci -- pdf-update <file.pdf> [--apply] [--report=<path>]
  npm run ssci -- export-wordpress [--zip] [--asset-base=<url>] [--wordpress-base=<url>]

Commands:
  pdf-update       Extract conference facts from a PDF and optionally apply safe JSON updates.
  export-wordpress Generate WPBakery/WordPress-ready HTML using scripts/export-wordpress-html.mjs.
`;

const monthNames = {
  jan: 'January',
  january: 'January',
  feb: 'February',
  february: 'February',
  mar: 'March',
  march: 'March',
  apr: 'April',
  april: 'April',
  may: 'May',
  jun: 'June',
  june: 'June',
  jul: 'July',
  july: 'July',
  aug: 'August',
  august: 'August',
  sep: 'September',
  sept: 'September',
  september: 'September',
  oct: 'October',
  october: 'October',
  nov: 'November',
  november: 'November',
  dec: 'December',
  december: 'December',
};

const dateLabelMap = new Map([
  ['Special Session Proposal Due', 'Special session proposal due'],
  ['Special Session Acceptance Notification', 'Special session acceptance notification'],
  ['Paper Submission Deadline', 'Main track paper submission deadline'],
  ['Notification Due', 'Main track notification due'],
  ['Final Camera-Ready Version Due', 'Final camera-ready version due'],
  ['Workshop Proposal Due', 'Workshop proposal due'],
  ['Workshop Paper Deadline', 'Workshop paper deadline'],
  ['Workshop Paper Acceptance Notification', 'Workshop paper acceptance notification'],
  ['Tutorial Proposal Deadline', 'Tutorial proposal deadline'],
  ['Tutorial Material Submission', 'Tutorial material submission'],
]);

const roleLabelMap = new Map([
  ['General Chairs', 'General Chair'],
  ['Program Chairs', 'Program Chair'],
  ['Local Chairs', 'Local Chair'],
  ['Website Chairs', 'Website Chair'],
  ['Publicity Chair', 'Publicity Chair'],
  ['Registration Chair', 'Registration Chair'],
  ['Proceeding Chair', 'Proceedings Chair'],
  ['Proceedings Chair', 'Proceedings Chair'],
  ['Tutorial Chairs', 'Tutorial Chair'],
  ['Industry and Government Chairs', 'Industry and Government Chair'],
  ['Competition Chair', 'Competition Chair'],
  ['Competition Chairs', 'Competition Chair'],
  ['Finance Chairs', 'Finance Chair'],
  ['Plenary and Keynote Chairs', 'Plenary and Keynote Chair'],
  ['Collaboration & Engagement Chair', 'Collaboration & Engagement Chair'],
  ['Conflict of Interest Chairs', 'Conflict of Interest Chair'],
  ['Poster Session Chairs', 'Poster Session Chair'],
  ['Journal to Conference Chair', 'Journal to Conference Chair'],
]);

const preferredDateOrder = [
  'Special session proposal due',
  'Special session acceptance notification',
  'Main track paper submission deadline',
  'Main track notification due',
  'Final camera-ready version due',
  'Workshop proposal due',
  'Workshop paper deadline',
  'Workshop paper acceptance notification',
  'Tutorial proposal deadline',
  'Tutorial material submission',
  'Conference dates',
];

const run = (cmd, cmdArgs, options = {}) => {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    env: {
      ...process.env,
      ...options.env,
    },
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    throw new Error([`Command failed: ${cmd} ${cmdArgs.join(' ')}`, stderr, stdout].filter(Boolean).join('\n'));
  }

  return result.stdout || '';
};

const hasBinary = (name) => {
  const result = spawnSync('command', ['-v', name], {
    shell: true,
    encoding: 'utf8',
  });
  return result.status === 0;
};

const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const writeJson = async (relativePath, value) => {
  await writeFile(path.join(root, relativePath), `${JSON.stringify(value, null, 2)}\n`);
};

const getFlag = (name) => {
  const prefix = `--${name}=`;
  const match = commandArgs.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
};

const hasFlag = (name) => commandArgs.includes(`--${name}`);

const normalizeWhitespace = (value) => value
  .replace(/\r/g, '')
  .replace(/\f/g, '\n')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const extractPdfText = (pdfPath) => {
  if (!hasBinary('pdftotext')) {
    throw new Error('pdftotext is required for PDF extraction. Install poppler, then rerun the command.');
  }

  return run('pdftotext', ['-layout', pdfPath, '-']);
};

const parseDateValue = (rawValue) => {
  const cleaned = rawValue
    .replace(/\([^)]*\)/g, '')
    .replace(/[,.;]+$/g, '')
    .trim();
  const monthFirst = cleaned.match(/^([A-Za-z]+)\.?\s+(\d{1,2}(?:\s*[-–]\s*\d{1,2})?),?\s+(\d{4})$/);
  if (monthFirst) {
    const month = monthNames[monthFirst[1].toLowerCase()];
    return month ? `${monthFirst[2].replace(/\s+/g, '')} ${month} ${monthFirst[3]}` : cleaned;
  }

  const dayFirst = cleaned.match(/^(\d{1,2}(?:\s*[-–]\s*\d{1,2})?)\s+([A-Za-z]+)\.?,?\s+(\d{4})$/);
  if (dayFirst) {
    const month = monthNames[dayFirst[2].toLowerCase()];
    return month ? `${dayFirst[1].replace(/\s+/g, '')} ${month} ${dayFirst[3]}` : cleaned;
  }

  return cleaned;
};

const parseConferenceDate = (text) => {
  const match = text.match(/Proposed Conference date:\s*([A-Za-z]+\.?\s+\d{1,2}\s*[-–]\s*\d{1,2},?\s+\d{4})/i);
  return match ? parseDateValue(match[1]) : '';
};

const parseLocation = (text) => {
  const match = text.match(/We propose\s+([^.\n]+?),\s+as the host city for IEEE SSCI 2027/i);
  return match ? match[1].trim() : '';
};

const parseImportantDates = (text) => {
  const dates = new Map();
  const lines = normalizeWhitespace(text).split('\n').map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(.+?)(?:\s*:)\s*([A-Za-z]+\.?\s+\d{1,2}(?:\s*[-–]\s*\d{1,2})?,?\s+\d{4})/);
    if (!match) continue;

    const rawLabel = match[1].trim();
    const label = dateLabelMap.get(rawLabel);
    if (!label) continue;

    dates.set(label, parseDateValue(match[2]));
  }

  const conferenceDate = parseConferenceDate(text);
  if (conferenceDate) {
    dates.set('Conference dates', conferenceDate);
  }

  return [...dates].map(([label, date]) => ({ label, date }));
};

const normalizeRole = (rawRole) => {
  const cleaned = rawRole.replace(/：/g, ':').replace(/\s+/g, ' ').trim();
  return roleLabelMap.get(cleaned) || cleaned.replace(/s$/, '');
};

const cleanName = (value) => value
  .replace(/\b(?:Professor|Prof|A\/Prof|Dr|Ms|Mr)\.?\s*/gi, '')
  .replace(/\[[^\]]*\]/g, '')
  .replace(/[\[\]]/g, '')
  .replace(/\?/g, '')
  .replace(/^\.\s*/, '')
  .replace(/\band one more.*$/i, '')
  .replace(/\bTBD\.?/i, '')
  .replace(/\s+/g, ' ')
  .trim();

const splitAffiliationAndNote = (detail) => {
  const parts = detail.split(',').map((part) => part.trim()).filter(Boolean);
  const email = (detail.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0];
  const affiliationParts = [];
  const noteParts = [];

  for (const part of parts) {
    if (part.includes('@')) continue;
    if (/IEEE|Member|Fellow|invited|pending|补邮件/i.test(part)) {
      noteParts.push(part.replace(/补邮件/g, '').trim());
    } else {
      affiliationParts.push(part);
    }
  }

  return {
    email,
    affiliation: affiliationParts.join(', '),
    note: noteParts.filter(Boolean).join('; '),
  };
};

const normalizePersonKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');

const affiliationAliases = new Map([
  ['griffith u', 'Griffith University'],
  ['uts', 'University of Technology Sydney'],
  ['rmit', 'RMIT University'],
  ['lingnan univ', 'Lingnan University'],
  ['monash uni', 'Monash University'],
  ['uq', 'University of Queensland'],
]);

const normalizeAffiliation = (value = '') => affiliationAliases.get(value.toLowerCase()) || value;

const chooseAffiliation = (parsed = '', existing = '') => {
  const normalized = normalizeAffiliation(parsed);
  if (!normalized) return existing || '';
  if (!existing) return normalized;
  return normalized.length > existing.length ? normalized : existing;
};

const extractOrganizerBlocks = (text) => {
  const section = text.match(/2\.\s*Conference Organizers([\s\S]*?)Symposium Chairs:/i)?.[1] || '';
  if (!section) return [];

  const lines = section
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*[▪•]\s*/, '%%BULLET%%').trim())
    .filter(Boolean);

  const blocks = [];
  let current = '';

  for (const line of lines) {
    if (line.startsWith('%%BULLET%%')) {
      if (current) blocks.push(current.trim());
      current = line.replace('%%BULLET%%', '');
    } else {
      current = `${current} ${line}`;
    }
  }

  if (current) blocks.push(current.trim());
  return blocks;
};

const parseOrganizerMembers = (text) => {
  const members = [];
  const unresolved = [];

  for (const block of extractOrganizerBlocks(text)) {
    const [rawRole, ...rest] = block.replace(/：/g, ':').split(':');
    const role = normalizeRole(rawRole || '');
    const body = rest.join(':').trim();

    if (!role || !body) continue;

    const matches = [...body.matchAll(/((?:Prof\.?|Professor|A\/Prof\.?|Dr\.?|Ms\.?|Mr\.?)?\s*[^(),;]+?)\s*\(([^)]*)\)/gi)];
    const parsedNames = new Set();

    for (const match of matches) {
      const name = cleanName(match[1]);
      if (!name || /one more/i.test(name)) continue;

      const details = splitAffiliationAndNote(match[2]);
      parsedNames.add(normalizePersonKey(name));
      members.push({
        role,
        name,
        affiliation: details.affiliation,
        email: details.email,
        note: details.note,
        photo: '',
      });
    }

    const withoutParenthetical = body.replace(/((?:Prof\.?|Professor|A\/Prof\.?|Dr\.?|Ms\.?|Mr\.?)?\s*[^(),;]+?)\s*\([^)]*\)/gi, ',');
    const looseNames = withoutParenthetical
      .split(/\band\b|,|;/i)
      .map(cleanName)
      .filter((name) => name && !/one more|from CIS society|这个是|随便找个人|补邮件|invited|pending/i.test(name));

    for (const name of looseNames) {
      if (parsedNames.has(normalizePersonKey(name))) continue;
      if (name.length < 3) continue;
      unresolved.push({ role, text: name });
    }
  }

  return { members, unresolved };
};

const applyImportantDates = async (dates) => {
  const importantDatesPath = 'src/data/importantDates.json';
  const current = await readJson(importantDatesPath);
  const byLabel = new Map(current.map((item) => [item.label.toLowerCase(), item]));

  for (const dateItem of dates) {
    const existing = byLabel.get(dateItem.label.toLowerCase());
    if (existing) {
      existing.date = dateItem.date;
      if (dateItem.label === 'Conference dates') existing.status = 'Proposed';
    } else {
      current.push(dateItem.label === 'Conference dates'
        ? { ...dateItem, status: 'Proposed' }
        : dateItem);
    }
  }

  current.sort((a, b) => {
    const aIndex = preferredDateOrder.indexOf(a.label);
    const bIndex = preferredDateOrder.indexOf(b.label);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  await writeJson(importantDatesPath, current);
  await syncCallForPapersDates(current);
  return [importantDatesPath, 'src/data/pages/submissions/call-for-papers.json'];
};

const syncCallForPapersDates = async (importantDates) => {
  const pagePath = 'src/data/pages/submissions/call-for-papers.json';
  const page = await readJson(pagePath);
  const dateRows = importantDates
    .filter((item) => item.label !== 'Conference dates')
    .map((item) => [item.label, item.date]);

  for (const section of page.sections || []) {
    if (section.heading === 'Dates and Deadlines' && section.table?.rows) {
      section.table.rows = dateRows;
    }
  }

  await writeJson(pagePath, page);
};

const applySiteFacts = async ({ location, conferenceDate }) => {
  const sitePath = 'src/data/site.json';
  const site = await readJson(sitePath);
  if (location) site.locationLabel = location;
  if (conferenceDate) site.datesLabel = conferenceDate;
  if (location || conferenceDate) await writeJson(sitePath, site);
  return location || conferenceDate ? [sitePath] : [];
};

const applyOrganizerMembers = async (members) => {
  if (!members.length) return [];

  const committeesPath = 'src/data/committees.json';
  const committees = await readJson(committeesPath);
  const organizing = committees.find((committee) => committee.slug === 'organizing-committee');
  if (!organizing) return [];

  const existingByName = new Map(organizing.members.map((member) => [normalizePersonKey(member.name), member]));
  const used = new Set();
  const merged = [];

  for (const parsed of members) {
    const key = normalizePersonKey(parsed.name);
    if (!key || used.has(key)) continue;
    used.add(key);

    const existing = existingByName.get(key);
    merged.push({
      ...(existing || {}),
      role: parsed.role || existing?.role || '',
      name: existing?.name || parsed.name,
      affiliation: chooseAffiliation(parsed.affiliation, existing?.affiliation),
      note: /IEEE|IET/i.test(existing?.note || '') ? '' : existing?.note || '',
      status: existing?.status || '',
      photo: existing?.photo || parsed.photo || '',
    });
  }

  for (const member of organizing.members) {
    const key = normalizePersonKey(member.name);
    if (!used.has(key)) merged.push(member);
  }

  organizing.members = merged.map((member) => {
    const clean = {};
    for (const [key, value] of Object.entries(member)) {
      if (key === 'email') continue;
      if (key === 'note' && /IEEE|IET/i.test(String(value))) continue;
      if (value !== '') clean[key] = value;
    }
    if (!('photo' in clean)) clean.photo = '';
    return clean;
  });

  await writeJson(committeesPath, committees);
  return [committeesPath];
};

const writeReport = async (reportPath, report) => {
  await mkdir(path.dirname(reportPath), { recursive: true });
  const markdown = [
    `# PDF Update Report: ${report.pdf}`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Detected Site Facts',
    '',
    `- Location: ${report.detected.location || 'Not detected'}`,
    `- Conference dates: ${report.detected.conferenceDate || 'Not detected'}`,
    '',
    '## Detected Important Dates',
    '',
    report.detected.importantDates.length
      ? report.detected.importantDates.map((item) => `- ${item.label}: ${item.date}`).join('\n')
      : '- None detected',
    '',
    '## Detected Organizer Members',
    '',
    report.detected.organizerMembers.length
      ? report.detected.organizerMembers.map((member) => `- ${member.role}: ${member.name}${member.email ? ` <${member.email}>` : ''}${member.affiliation ? `, ${member.affiliation}` : ''}`).join('\n')
      : '- None detected',
    '',
    '## Needs Manual Review',
    '',
    report.detected.unresolved.length
      ? report.detected.unresolved.map((item) => `- ${item.role}: ${item.text}`).join('\n')
      : '- None',
    '',
    '## Files Changed',
    '',
    report.changedFiles.length ? report.changedFiles.map((file) => `- ${file}`).join('\n') : '- None; rerun with --apply to update JSON files.',
    '',
  ].join('\n');

  await writeFile(reportPath, markdown);
};

const pdfUpdate = async () => {
  const pdfArg = commandArgs.find((arg) => !arg.startsWith('--'));
  if (!pdfArg) {
    console.error(usage);
    process.exit(1);
  }

  const pdfPath = path.resolve(root, pdfArg);
  if (!existsSync(pdfPath)) {
    throw new Error(`PDF not found: ${pdfPath}`);
  }

  const apply = hasFlag('apply');
  const text = extractPdfText(pdfPath);
  const normalizedText = normalizeWhitespace(text);
  const location = parseLocation(normalizedText);
  const conferenceDate = parseConferenceDate(normalizedText);
  const importantDates = parseImportantDates(normalizedText);
  const { members: organizerMembers, unresolved } = parseOrganizerMembers(text);
  const baseName = path.basename(pdfPath, path.extname(pdfPath)).replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-');
  const reportPath = path.resolve(root, getFlag('report') || path.join(pdfUpdatesDir, `${baseName}.md`));
  const textPath = path.join(pdfUpdatesDir, `${baseName}.txt`);

  await mkdir(pdfUpdatesDir, { recursive: true });
  await writeFile(textPath, normalizedText);

  const changedFiles = [];
  if (apply) {
    changedFiles.push(...await applySiteFacts({ location, conferenceDate }));
    changedFiles.push(...await applyImportantDates(importantDates));
    changedFiles.push(...await applyOrganizerMembers(organizerMembers));
  }

  const report = {
    pdf: path.relative(root, pdfPath),
    detected: {
      location,
      conferenceDate,
      importantDates,
      organizerMembers,
      unresolved,
    },
    changedFiles: [...new Set(changedFiles)],
  };

  await writeReport(reportPath, report);

  console.log(`PDF text: ${path.relative(root, textPath)}`);
  console.log(`Report: ${path.relative(root, reportPath)}`);
  if (apply) {
    console.log(`Updated ${report.changedFiles.length} file(s). Review with git diff before committing.`);
  } else {
    console.log('Dry run only. Rerun with --apply to update JSON files.');
  }
};

const exportWordPress = async () => {
  const forwardArgs = commandArgs.filter((arg) => arg.startsWith('--asset-base=') || arg.startsWith('--wordpress-base='));
  run(process.execPath, ['scripts/export-wordpress-html.mjs', ...forwardArgs], { stdio: 'inherit' });

  if (hasFlag('zip')) {
    if (!hasBinary('zip')) {
      throw new Error('zip is required to create ssci-2027-wordpress-page-deploy.zip.');
    }

    await rm(path.join(root, 'ssci-2027-wordpress-page-deploy.zip'), { force: true });
    run('zip', ['-rq', 'ssci-2027-wordpress-page-deploy.zip', 'wordpress-export'], { stdio: 'inherit' });
    console.log('Created ssci-2027-wordpress-page-deploy.zip');
  }
};

try {
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(usage);
  } else if (command === 'pdf-update') {
    await pdfUpdate();
  } else if (command === 'export-wordpress') {
    await exportWordPress();
  } else {
    console.error(`Unknown command: ${command}\n`);
    console.error(usage);
    process.exit(1);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
