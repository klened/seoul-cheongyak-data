// 매일 수집 뒤, 접수 중·예정인 청년안심주택 공고문을 읽어 자격 기준(el)을 넣는다.
// 사람이 확인한 facts.json 공고는 건너뛴다. 공고문은 같은 파일을 한 번만 내려받고 결과를 notice.auto 에 남긴다.
// 단지 전체 임대 조건(plans)은 매일 다시 수집되므로, 읽은 결과로 이번 모집 구분만 남기는 일은 매번 한다.
import { docText, parseYouthNotice, plansFor, STD } from './notice-doc.mjs';

const MAX_PER_RUN = 10;

export async function applyAutoDocs(byId, facts, today, log = console.log) {
  let fetched = 0;
  for (const n of byId.values()) {
    if (!/^soco-/.test(n.id) || facts[n.id]) continue;
    if (n.auto && n.auto.doc !== n.docUrl) delete n.auto; // 공고문이 바뀌면 다시 읽는다
    const open = !n.end || n.end >= today;
    if (!n.auto && open && n.docUrl && fetched < MAX_PER_RUN) {
      fetched++;
      try {
        const r = await fetch(n.docUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (seoul-cheongyak-data; daily)' }, signal: AbortSignal.timeout(60000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const got = parseYouthNotice(await docText(Buffer.from(await r.arrayBuffer())));
        n.auto = got.ok
          ? { doc: n.docUrl, at: today, ok: true, std: STD.year, groups: got.groups, who: got.who, el: got.el }
          : { doc: n.docUrl, at: today, ok: false, why: got.why };
        log(`공고문 읽기 ${n.id}: ${got.ok ? '반영' : '보류 - ' + got.why}`);
      } catch (e) {
        log(`공고문 읽기 ${n.id}: 실패 - ${e.message} (다음 실행에 다시 읽음)`);
      }
    }
    if (n.auto && n.auto.ok) {
      n.el = n.auto.el;
      n.plans = plansFor(n.plans, n.auto.groups, n.auto.who);
      n.planScope = 'auto';
      n.who = `이번 모집: ${n.auto.who.join('·')} ${n.auto.groups.join('·')}`;
    }
  }
}
