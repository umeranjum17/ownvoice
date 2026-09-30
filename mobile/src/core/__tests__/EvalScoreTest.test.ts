import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { cases } from '../../../eval/cases';

test('eval scores both permitted apostrophe forms and rejects missed cleanup', () => {
  const evalPath = resolve(__dirname, '../../../eval');
  const temporary = mkdtempSync(join(__dirname, 'eval-score-'));
  const outputDir = join(evalPath, 'out');
  const output = join(outputDir, 'scores.json');
  const hadDir = existsSync(outputDir);
  const previous = existsSync(output) ? readFileSync(output) : null;
  const variants = [
    { label: 'advisory', change: (text: string) => text, pass: true, voice: true },
    { label: 'writer', change: (text: string) => text.replace(/^Its/, "It's"), pass: true, voice: true },
    { label: 'spelling', change: (text: string) => text.replace('should', 'shoud'), pass: false, voice: false },
    { label: 'double', change: (text: string) => text.replace('the evening', 'the the evening'), pass: false, voice: false },
    { label: 'punctuation', change: (text: string) => text.replace(/\.$/, '!'), pass: false, voice: false },
    { label: 'casing', change: (text: string) => text.toLowerCase(), pass: true, voice: false },
  ];
  try {
    mkdirSync(outputDir, { recursive: true });
    const files = variants.map(variant => {
      const file = join(temporary, `${variant.label}.json`);
      const results = cases.filter(c => c.id === 'P14-cleaned-slips' || c.id === 'P15-cleaned-name').map(c => {
        if (c.kind !== 'polish' || !Array.isArray(c.exact)) throw new Error('Missing cleanup alternatives');
        return { id: c.id, shown: [{ slot: 0, text: variant.change(c.exact[0]) }], calls: [], wallMs: 0 };
      });
      writeFileSync(file, JSON.stringify({ label: variant.label, results }));
      return file;
    });
    const scored = spawnSync(process.execPath, [join(evalPath, 'score.ts'), ...files], { encoding: 'utf8' });
    expect(scored.status).toBe(0);
    const tables = JSON.parse(readFileSync(output, 'utf8')) as { label: string; rows: { pass: boolean; voice: number }[] }[];
    for (const variant of variants) {
      const table = tables.find(t => t.label === variant.label)!;
      expect(table.rows).toHaveLength(2);
      expect(table.rows.map(row => [row.pass, row.voice])).toEqual(Array(2).fill([variant.pass, Number(variant.voice)]));
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
    if (previous) writeFileSync(output, previous);
    else rmSync(output, { force: true });
    if (!hadDir) rmSync(outputDir, { recursive: true, force: true });
  }
});
