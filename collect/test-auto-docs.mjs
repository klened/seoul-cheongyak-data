// facts.json 이 없다고 치고 자동 읽기 단계를 돌려, 결과를 사람이 확인한 값과 견준다. 데이터 파일은 쓰지 않는다.
import { readFileSync } from 'node:fs';
import { applyAutoDocs } from './auto-docs.mjs';
const facts = JSON.parse(readFileSync(new URL('./facts.json', import.meta.url), 'utf8'));
const notices = JSON.parse(readFileSync(new URL('../data/notices.json', import.meta.url), 'utf8'));
const byId = new Map(notices.map((n) => [n.id, structuredClone(n)]));
for (const n of byId.values()) delete n.auto;
await applyAutoDocs(byId, { _about: '' }, '2026-11-08');
for (const id of Object.keys(facts).filter((k) => k !== '_about')) {
  const n = byId.get(id), f = facts[id];
  const sig = (el) => (el || []).map((t) => `${t.g}/${t.who}/${t.asset || '-'}`).sort().join(',');
  console.log(id, sig(n.el) === sig(f.el) ? '자격 같음' : '자격 다름', '|', n.who, '| 표 줄', n.plans?.length, n.plans?.map((p) => `${p.g[0]}${p.who}`).filter((v, i, a) => a.indexOf(v) === i).join(' '));
}
// 두 번째 실행은 내려받지 않아야 한다
let fetched = 0;
const orig = globalThis.fetch;
globalThis.fetch = (...a) => { fetched++; return orig(...a); };
await applyAutoDocs(byId, { _about: '' }, '2026-11-08', () => {});
console.log('두 번째 실행에서 내려받은 파일:', fetched);
