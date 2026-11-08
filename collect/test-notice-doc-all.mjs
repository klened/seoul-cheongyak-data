// 데이터에 있는 청년안심주택 공고 전부를 읽어 결과 분포와 안전장치를 확인한다. 파일은 메모리에서만 읽는다.
import { readFileSync } from 'node:fs';
import { docText, parseYouthNotice } from './notice-doc.mjs';
const notices = JSON.parse(readFileSync(new URL('../data/notices.json', import.meta.url), 'utf8')).filter((n) => /^soco-/.test(n.id) && n.docUrl);
let sample = '';
for (const n of notices) {
  const t0 = Date.now();
  try {
    const buf = Buffer.from(await (await fetch(n.docUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (seoul-cheongyak-data)' } })).arrayBuffer());
    const text = await docText(buf);
    if (n.id === 'soco-6724') sample = text;
    const r = parseYouthNotice(text);
    console.log(n.id, n.end, r.ok ? `ok ${r.groups.join('+')} / ${r.who.join('+')} / ${r.basis}` : `실패: ${r.why}`, `${Date.now() - t0}ms`, n.name.slice(0, 18));
  } catch (e) { console.log(n.id, n.end, '오류:', e.message, n.name.slice(0, 18)); }
}
// 안전장치: 자산 기준 숫자가 바뀐 공고는 넣지 않아야 한다
const changed = sample.replace(/251/g, '260').replace(/25,100/g, '26,000');
const r = parseYouthNotice(changed);
console.log('\n자산 기준을 바꾼 글:', r.ok ? '잘못 통과' : `막힘(${r.why})`);
const r2 = parseYouthNotice(sample.replace(/4,576,036/g, '4,700,000'));
console.log('소득 기준을 바꾼 글:', r2.ok ? '잘못 통과' : `막힘(${r2.why})`);
