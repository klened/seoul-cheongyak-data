// 공고문 원본의 공급 개요와 공급 표 부분만 보여 준다(메모리에서만 읽음). 실행: node collect/peek-supply.mjs soco-6725 soco-6726 ...
import { readFileSync } from 'node:fs';
import { docText } from './notice-doc.mjs';
const ids = process.argv.slice(2);
const notices = JSON.parse(readFileSync(new URL('../data/notices.json', import.meta.url), 'utf8'));
for (const id of ids) {
  const n = notices.find((x) => x.id === id);
  if (!n?.docUrl) { console.log('\n##', id, '공고문 링크 없음'); continue; }
  const buf = Buffer.from(await (await fetch(n.docUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (seoul-cheongyak-data)' } })).arrayBuffer());
  const T = (await docText(buf)).replace(/\s+/g, ' ');
  const ov = (T.match(/공급\s?(?:호수|규모)\s?[:：]?.{0,170}/) || [''])[0];
  const date = (T.match(/공고일[은는이]?\s?\(?\s?(20\d\d[.\-]\s?\d{1,2}[.\-]\s?\d{1,2})/) || [])[1] || '';
  console.log(`\n## ${id} ${n.name} | 공고일 ${date}\n개요: ${ov}`);
  const tables = [...T.matchAll(/공급\s?유형.{0,1400}?합\s?계[^가-힣]{0,40}/g)].map((m) => m[0]).filter((t) => /\d{2,3},\d{3},\d{3}|\d,\d{3}/.test(t));
  tables.slice(0, 3).forEach((t, i) => console.log(`표${i + 1}: ${t}`));
  if (!tables.length) console.log('표 못 찾음');
}
