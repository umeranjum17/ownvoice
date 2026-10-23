#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const tag = process.argv[2];
if (!tag) throw new Error('Usage: node scripts/release-notes.mjs <tag>');
const tags = execFileSync('git', ['tag', '--list', 'v[0-9]*', '--sort=-version:refname'], { encoding: 'utf8' }).trim().split('\n');
const previous = tags[tags.indexOf(tag) + 1];
if (!previous) throw new Error(`No earlier version tag found for ${tag}`);
const repo = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim().replace(/^.*github\.com[:/]/, '').replace(/\.git$/, '');
const compare = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/compare/${previous}...${tag}`], { encoding: 'utf8' }));
const prs = new Map();
for (const commit of compare.commits) {
  const linked = JSON.parse(execFileSync('gh', ['api', `repos/${repo}/commits/${commit.sha}/pulls`, '-H', 'Accept: application/vnd.github+json'], { encoding: 'utf8' }));
  for (const pr of linked) if (pr.merged_at && pr.base.ref === 'main' && !/^(chore|docs|test|refactor)(\([^)]*\))?:/i.test(pr.title)) prs.set(pr.number, pr);
}
const lines = { New: [], Fixed: [], 'Known issues': [] };
const plainTitles = {
  260: 'Write drafts on your computer from your phone',
  261: 'See the first writing suggestion sooner',
  262: 'Sign in to ChatGPT without typing a code',
  263: 'Keep computer links safe and helper instructions short',
  264: 'Forgetting a computer also removes its trust',
  266: 'Write and review posts on X',
  268: 'Keep the app responsive when saving a post',
};
for (const pr of [...prs.values()].sort((a, b) => a.number - b.number)) {
  if ([258, 259, 265, 269, 270].includes(pr.number)) continue;
  const title = plainTitles[pr.number] ?? pr.title.replace(/^(feat|fix|chore|docs|test|refactor)(\([^)]*\))?:\s*/i, '').replace(/[.!?]+$/, '');
  const kind = /^(fix|bug)/i.test(pr.title) ? 'Fixed' : 'New';
  lines[kind].push(`- ${title} ([#${pr.number}](${pr.html_url}))`);
}
for (const section of Object.keys(lines)) if (!lines[section].length) lines[section].push('- None');
console.log(`Download Ownvoice.apk on your Android phone, tap Open, then Install. If asked, allow your browser to install it, then come back and tap Install. Open Ownvoice to get started.\n\n## New\n${lines.New.join('\n')}\n\n## Fixed\n${lines.Fixed.join('\n')}\n\n## Known issues\n${lines['Known issues'].join('\n')}`);
