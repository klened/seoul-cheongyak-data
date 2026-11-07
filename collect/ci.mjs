// GitHub Actions 에서 매일 실행. daily.mjs 결과를 data/notices.json 에 반영한다.
// 기존 공고의 el(자격 조건)과 지원 체크 id 규칙은 바꾸지 않는다. 체크·숨김·내 조건은 Cloudflare 저장소에 있어 여기서 건드리지 않는다.
import { readFileSync, writeFileSync, mkdirSync, rmSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const here = (p) => new URL(p, import.meta.url);
const noticesFile = here('../data/notices.json');
const notices = JSON.parse(readFileSync(noticesFile, 'utf8'));

// 기존 공고를 daily.mjs 가 읽는 폴더 모양으로 푼다
const tmp = join(tmpdir(), 'seoul-board-' + Date.now());
mkdirSync(join(tmp, 'existing'), { recursive: true });
for (const { id, ...data } of notices) writeFileSync(join(tmp, 'existing', `${id}.json`), JSON.stringify(data));

const reportFile = join(tmp, 'report.json');
const run = spawnSync(process.execPath, [new URL('./daily.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), join(tmp, 'existing'), reportFile], { encoding: 'utf8' });
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
const report = JSON.parse(readFileSync(reportFile, 'utf8'));

// 새 공고의 자격 조건. Claude 없이 돌아가므로 확인된 값이 없으면 v:0(「확인 필요」)으로 넣는다
function defaultEl(r) {
  if (r.el) return r.el;
  const text = `${r.name} ${r.text || ''}`;
  if (r.cat === '청년안심주택') {
    const t = { n: '청년안심주택', age: [19, 39], house: 'me', v: 0 };
    return [t];
  }
  if (r.cat === '아파트 분양') return [{ n: '분양', age: [19, 200], bank: true, v: 0 }];
  if (/고령자/.test(text) && !/청년|신혼/.test(text)) return [{ n: '고령자', age: [65, 200], v: 0 }];
  if (/공공기숙사|희망하우징/.test(text)) return [{ n: '대학생', student: true, v: 0 }];
  if (/신혼/.test(r.name) && !/청년/.test(r.name)) return [{ n: '신혼부부', m: ['newly', 'engaged', 'parent'], v: 0 }];
  if (/도전숙|창업/.test(r.name)) return [{ n: '청년 창업', age: [19, 39], founder: true, v: 0 }];
  return [{ n: r.cat || '공고', age: [19, 200], v: 0 }];
}

const byId = new Map(notices.map((n) => [n.id, n]));
const sme = [];
for (const a of report.added) {
  const { needs_el, text, ...row } = a;
  row.el = defaultEl(a);
  byId.set(row.id, row);
  if (row.sme) sme.push(row);
}
for (const c of report.changed) {
  const old = byId.get(c.id);
  if (old) Object.assign(old, c.diff);
}
const failedAll = Object.keys(report.errors).length >= Object.keys(report.counts).length;
if (!failedAll) {
  const merged = [...byId.values()].sort((x, y) => x.id.localeCompare(y.id));
  writeFileSync(noticesFile, JSON.stringify(merged, null, 1) + '\n');
}
writeFileSync(here('../data/last-run.json'), JSON.stringify({ date: report.date, counts: report.counts, errors: report.errors, added: report.added.length, changed: report.changed.length }, null, 1) + '\n');

// 새 중기청 추천 공고는 GitHub 이슈로 올려 메일 알림을 받는다
if (process.env.GITHUB_OUTPUT && sme.length) {
  const title = `서울중기청 새 추천 공고: ${sme.map((s) => s.name).join(', ')}`;
  const body = sme.map((s) => `- ${s.name} (${s.gu || '-'}) 신청 ${s.start} ~ ${s.end}, ${s.units || ''}\n  ${s.url}`).join('\n');
  writeFileSync(join(tmp, 'alert.md'), body);
  appendFileSync(process.env.GITHUB_OUTPUT, `alert_title=${title}\nalert_body=${join(tmp, 'alert.md')}\n`);
}
console.log(`반영: 추가 ${report.added.length}, 변경 ${report.changed.length}, 실패 출처 ${Object.keys(report.errors).length}`);
if (failedAll) { rmSync(tmp, { recursive: true, force: true }); process.exit(1); }
