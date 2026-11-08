// 사람이 읽어 확인한 공고(facts.json)와 자동 읽기 결과가 같은지 맞춰 본다. 파일은 메모리에서만 읽는다.
// 실행: node collect/test-notice-doc.mjs
import { readFileSync } from 'node:fs';
import { docText, parseYouthNotice } from './notice-doc.mjs';

const facts = JSON.parse(readFileSync(new URL('./facts.json', import.meta.url), 'utf8'));
const notices = JSON.parse(readFileSync(new URL('../data/notices.json', import.meta.url), 'utf8'));
const pick = (el) => (el || []).map((t) => [t.n, t.basis, t.asset || '-', t.inc ? 'inc' : '-', t.car].join('/')).sort().join(' | ');
let bad = 0;
for (const [id, f] of Object.entries(facts)) {
  if (id === '_about') continue;
  const n = notices.find((x) => x.id === id);
  const r = await fetch(n.docUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (seoul-cheongyak-data)' } });
  const buf = Buffer.from(await r.arrayBuffer());
  let got;
  try { got = parseYouthNotice(await docText(buf)); } catch (e) { got = { ok: false, why: e.message }; }
  const want = pick(f.el), have = got.ok ? pick(got.el) : '';
  const same = want === have;
  if (!same) bad++;
  console.log(`\n${same ? '같음' : '다름'} ${id} ${n.name} (${buf.length}B ${buf.slice(0, 4).toString('latin1').replace(/\W/g, '')})`);
  if (!same) console.log('  사람:', want, '\n  자동:', got.ok ? have : '실패 - ' + got.why);
}
console.log(`\n다름 ${bad}건`);
process.exit(bad ? 1 : 0);
