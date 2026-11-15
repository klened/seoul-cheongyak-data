// 11/15 추가모집 8건: 공고문 공급 표를 사람이 읽어 이번 모집 호실·금액을 facts.json 에 넣는다.
// 자격 기준(el)은 자동 읽기 결과(notice.auto.el)를 그대로 옮긴다.
import { readFileSync, writeFileSync } from 'node:fs';
const fp = new URL('./facts.json', import.meta.url);
const facts = JSON.parse(readFileSync(fp, 'utf8'));
const notices = JSON.parse(readFileSync(new URL('../data/notices.json', import.meta.url), 'utf8'));
const S = '특별공급', G = '일반공급', YN = '청년, 신혼부부';
const won = (man) => man * 10000;
const row = (g, who, room, dep, rent, extra = {}) => ({ g, who, room, dep, rent, ...extra });
// 보증금 비율별 안: [[비율, 보증금(만원), 월세(만원)], ...]
const ratios = (g, who, room, units, list) => list.map(([pct, d, r]) => row(g, who, room, won(d), won(r), { note: `${units}, 보증금 ${pct}%` }));
const add = {
  'soco-6725': { who: '이번 모집: 청년 일반공급 1세대', plans: [row(G, '청년', '30㎡', 100000000, 700000, { n: 1 })] },
  'soco-6726': { who: '이번 모집: 청년·신혼부부 일반공급 1세대', plans: [row(G, YN, '45.60㎡', 151000000, 680000, { n: 1 })] },
  'soco-6727': { who: '이번 모집: 청년 일반공급 5세대', plans: [
    row(G, '청년', '14.35㎡', 65000000, 305000, { n: 1 }), row(G, '청년', '14.93㎡', 49500000, 344000, { n: 1 }),
    row(G, '청년', '30.01㎡', 65000000, 478000, { n: 1 }), row(G, '청년', '30.03㎡', 91000000, 432000, { n: 1 }),
    row(G, '청년', '31.42㎡', 80000000, 432000, { n: 1 })] },
  'soco-6728': { who: '이번 모집: 청년·신혼부부 일반공급 1세대', plans: [row(G, YN, '38.39㎡', 98000000, 688400, { n: 1 })] },
  'soco-6729': { who: '이번 모집: 청년 일반공급 예비자', plans: ratios(G, '청년', '23.98㎡', '예비자', [[20, 4700, 74], [30, 7100, 65], [40, 9500, 55]]) },
  'soco-6730': { who: '이번 모집: 청년·신혼부부 일반공급 1세대', plans: [row(G, YN, '33㎡', 201700000, 253200, { n: 1 })] },
  'soco-6731': { who: '이번 모집: 특별공급 6세대, 일반공급 5세대', plans: [
    ...ratios(S, '청년', '20.20㎡', '5세대', [[30, 6000, 57], [50, 10000, 40], [70, 14000, 24]]),
    ...ratios(S, YN, '43.61㎡', '1세대', [[30, 10790, 90], [50, 17990, 64], [70, 25190, 38]]),
    ...ratios(G, YN, '59.97㎡', '5세대', [[30, 16230, 132], [50, 27050, 94], [70, 37870, 56]])] },
  'soco-6732': { who: '이번 모집: 청년·신혼부부 일반공급 30세대', plans: [
    ...ratios(G, YN, '37.36㎡', '1세대', [[30, 12820, 109], [35, 14960, 102], [40, 17100, 94]]),
    ...ratios(G, YN, '42.57㎡', '29세대', [[30, 14560, 124], [35, 16990, 116], [40, 19410, 107]])] },
};
for (const [id, f] of Object.entries(add)) {
  const n = notices.find((x) => x.id === id);
  if (!n?.auto?.ok) throw new Error(id + ' 자동 읽기 결과 없음');
  facts[id] = { verified: '2026-11-15', ...f, planScope: 'notice', el: n.auto.el };
}
writeFileSync(fp, JSON.stringify(facts, null, 1) + '\n');
// 지금 데이터에도 반영(시험·확인용). 수집 실행이 같은 값을 다시 덮어쓴다
for (const n of notices) if (add[n.id]) Object.assign(n, facts[n.id]);
writeFileSync(new URL('../data/notices.json', import.meta.url), JSON.stringify(notices, null, 1) + '\n');
console.log('facts 추가', Object.keys(add).length);
