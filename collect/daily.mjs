// 서울 청약 보드 일일 수집. 사용: node daily.mjs <기존 notices 폴더> <결과 파일>
// 공고 사이트를 읽어 새 공고(added)와 일정이 바뀐 공고(changed)를 결과 파일에 쓴다. 저장소에는 쓰지 않는다.
// 문서 id 규칙(바꾸면 지원 체크가 풀린다): mss-글번호, ah-/ahx-/ahr-공고번호, sh-SH글번호, soco-글번호, lh-공고번호(LH API 연결 후)
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [, , existingDir, outFile] = process.argv;
if (!existingDir || !outFile) { console.error('사용: node daily.mjs <기존 notices 폴더> <결과 파일>'); process.exit(2); }
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const dec = (s) => { s = String(s ?? ''); for (let i = 0; i < 3; i++) s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;|&#034;/g, '"').replace(/&#x27;|&#039;|&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/&times;/g, '×').replace(/&rarr;/g, '→').replace(/&Omicron;/g, '○').replace(/&amp;/g, '&'); return s; };
const strip = (s) => dec(String(s ?? '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u, opt = {}) => { const r = await fetch(u, { ...opt, headers: { 'User-Agent': UA, ...(opt.headers || {}) }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); };
const kst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const year = Number(kst.slice(0, 4));

const rows = []; const errors = {}; const counts = {}; const texts = {};
async function source(name, fn) { try { const before = rows.length; await fn(); counts[name] = rows.length - before; } catch (e) { errors[name] = String(e.message || e); counts[name] = 0; } }
const row = (r) => { const o = { sme: false, seen: kst, ...r }; Object.keys(o).forEach((k) => { if (o[k] === '' || o[k] == null) delete o[k]; }); rows.push(o); };

// 기존 공고 읽기: {id, data, version} 또는 본문만 있는 파일 모두 받는다
const existing = {};
if (existsSync(existingDir)) {
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith('.json')) { const j = JSON.parse(readFileSync(p, 'utf8')); const id = j.id || f.name.replace(/\.json$/, ''); existing[id] = { data: j.data || j, version: j.version }; } } };
  walk(existingDir);
}
const norm = (s) => String(s || '').replace(/\s|\(.*?\)|입주자|모집|공고|추가|최초|청년안심주택/g, '');
const known = Object.values(existing).map((e) => norm(e.data.name));
const knownUrls = new Set(Object.values(existing).map((e) => e.data.url).filter(Boolean));

// 1) 서울중기청: (모집) 글만, 본문에서 기간·세대수·발표일을 읽는다
await source('서울중기청', async () => {
  const base = 'https://www.mss.go.kr/site/seoul/ex/bbs/';
  const seen = new Set();
  for (let p = 1; p <= 2; p++) {
    const html = await get(`${base}List.do?cbIdx=359${p > 1 ? '&pageIndex=' + p : ''}`);
    for (const m of html.matchAll(/<tr[^>]*onclick="doBbsFView\('359','(\d+)'[^>]*title="([^"]*)"/g)) {
      const [id, title] = [m[1], dec(m[2])];
      if (seen.has(id) || !/\(모집\)/.test(title)) continue;
      seen.add(id);
      const url = `${base}View.do?cbIdx=359&bcIdx=${id}&parentSeq=${id}`;
      const t = strip((await get(url)).replace(/^[\s\S]*?board_view/, ''));
      const per = t.match(/신청기간\s*:\s*'(\d\d)\.\s*(\d+)\.\s*(\d+)\.[^~]*~\s*(?:'(\d\d)\.\s*)?(\d+)\.\s*(\d+)/);
      if (!per) continue;
      const start = `20${per[1]}-${pad(per[2])}-${pad(per[3])}`;
      const end = `20${per[4] || per[1]}-${pad(per[5])}-${pad(per[6])}`;
      const units = (t.match(/세대수\s*:\s*(\d+)\s*세대\s*\(예비\s*(\d+)/) || []);
      const ann = t.match(/발표일\s*:\s*'(\d\d)\.\s*(\d+)\.\s*(\d+)/);
      const pub = t.match(/입주자모집공고가\s*(\d+)\.\s*(\d+)\.\s*로\s*변경/) || t.match(/입주자 모집공고일\(\s*(\d+)\.\s*(\d+)\./);
      const quit = t.match(/신청 취하하실 분은\s*(\d+)\.\s*(\d+)\./);
      const nm = title.match(/'([^']+?)\(([^()]*?구)\s*[^()]*\)'/) || title.match(/'([^']+)'/);
      row({
        id: 'mss-' + id, src: '서울중기청', cat: '중기청 추천', sme: true, name: nm ? nm[1].trim() : title, gu: nm && nm[2] ? nm[2] : '',
        start, end, ann: ann ? `20${ann[1]}-${pad(ann[2])}-${pad(ann[3])}` : '', units: units[1] ? `${units[1]}세대(예비 ${units[2]})` : '',
        who: '중소기업 5년 이상(동일 기업 3년 이상) 재직, 무주택 세대구성원', url,
        note: [pub ? `입주자모집공고 ${Number(pub[1])}월 ${Number(pub[2])}일 예정` : '', quit ? `취하 ${Number(quit[1])}월 ${Number(quit[2])}일까지` : ''].filter(Boolean).join(', '),
        pubKey: pub ? `${Number(pub[1])}월 ${Number(pub[2])}일` : '',
        el: [{ n: '중소기업 재직자 추천', sme: true, house: 'all', bank: true }],
      });
      await wait(300);
    }
  }
});

// 2) 청약홈: 이번 달·다음 달 서울
const home = 'https://www.applyhome.co.kr/ai/aia/';
const period = (s) => { const m = String(s).match(/(20\d\d-\d\d-\d\d)\s*~\s*(20\d\d-\d\d-\d\d)/); return m ? [m[1], m[2]] : ['', '']; };
const months = (() => { const y = Number(kst.slice(0, 4)), m = Number(kst.slice(5, 7)); return [`${y}${pad(m)}`, m === 12 ? `${y + 1}01` : `${y}${pad(m + 1)}`]; })();
for (const [name, path, pre, cat] of [
  ['청약홈 아파트', 'selectAPTLttotPblancListView.do', 'ah', '아파트 분양'],
  ['청약홈 오피스텔', 'selectOtherLttotPblancListView.do', 'ahx', '오피스텔·도시형'],
  ['청약홈 무순위', 'selectAPTRemndrLttotPblancListView.do', 'ahr', '무순위·임의공급'],
]) {
  await source(name, async () => {
    const seen = new Set();
    for (const pd of months) {
      for (let p = 1; p <= 5; p++) {
        const body = new URLSearchParams({ beginPd: pd, endPd: pd, suplyAreaCode: '서울', houseNm: '', pageIndex: String(p), pageSelAt: 'Y' });
        const html = await get(home + path, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: home + path } });
        const trs = [...html.matchAll(/<tr[^>]*data-pbno="(\d+)"[\s\S]*?<\/tr>/gi)];
        if (!trs.length) break;
        for (const m of trs) {
          const attr = (k) => m[0].match(new RegExp(`data-${k}="([^"]*)"`))?.[1] || '';
          const pbno = attr('pbno'); if (seen.has(pbno)) continue; seen.add(pbno);
          const tds = [...m[0].matchAll(/<td[\s\S]*?<\/td>/gi)].map((t) => strip(t[0]));
          const [start, end] = period(tds.join(' '));
          if (end && end < kst) continue;
          const ann = (tds.join(' ').match(/~\s*20\d\d-\d\d-\d\d\s+(?:☎\s*\S+\s+)?(20\d\d-\d\d-\d\d)/) || [])[1] || '';
          let gu = '', units = '', url = home + path;
          if (pre !== 'ahr') {
            const hm = attr('hmno');
            const du = pre === 'ah' ? `${home}selectAPTLttotPblancDetail.do?houseManageNo=${hm}&pblancNo=${pbno}` : `${home}selectPRMOLttotPblancDetailView.do?houseManageNo=${hm}&pblancNo=${pbno}&houseSecd=${attr('hsecd') || '01'}`;
            try { const t = strip(await get(du, { headers: { Referer: home + path } })); gu = (t.match(/서울특별시\s+(\S+구)/) || [])[1] || ''; units = (t.match(/공급규모\s*(\d[\d,]*\s*(?:세대|실|호))/) || [])[1] || ''; if (gu) url = du; } catch { /* 상세가 안 열리면 목록 주소를 쓴다 */ }
            await wait(300);
          }
          row({ id: `${pre}-${pbno}`, src: '청약홈', cat, name: dec(attr('honm')), gu, start, end, ann, units, who: pre === 'ah' ? `${tds[1]} ${tds[2]}` : tds[1], url });
        }
        await wait(300);
      }
    }
  });
}

// 3) 서울주거포털(SH): 모집중·공고 글
await source('SH', async () => {
  for (const [kind, base, pages] of [['lease', 'https://housing.seoul.go.kr/site/main/sh/publicLease/list', 2], ['sale', 'https://housing.seoul.go.kr/site/main/sh/publicSale/list', 1]]) {
    for (let cp = 1; cp <= pages; cp++) {
      const html = await get(`${base}?cp=${cp}`);
      for (const m of html.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
        const tds = [...m[0].matchAll(/<td[\s\S]*?<\/td>/gi)].map((t) => strip(t[0]));
        if (!tds.length) continue;
        const links = [...m[0].matchAll(/href="([^"]+)"/g)].map((x) => dec(x[1]));
        const joined = tds.join(' ');
        if (kind === 'lease' && !/모집중|모집예정/.test(joined)) continue;
        const posted = tds.find((x) => /^20\d\d-\d\d-\d\d$/.test(x)) || '';
        const title = (tds.find((x) => x.startsWith('-->')) || '').replace(/^-->\s*/, '');
        if (!title || /연기 안내|결과/.test(title)) continue;
        const head = norm(title.replace(/^\[[^\]]+\]\s*/, '')).slice(0, 6);
        if (kind === 'sale' && (rows.some((r) => norm(r.name).startsWith(head)) || known.some((k) => k.startsWith(head)))) continue;
        if (known.includes(norm(title))) continue;
        const age = posted ? (Date.parse(kst) - Date.parse(posted)) / 864e5 : 999;
        const ext = links.find((l) => /i-sh/.test(l)) || '';
        const seq = (ext.match(/seq=(\d+)/) || [])[1]; if (!seq) continue;
        const v = links.find((l) => /view/.test(l));
        const body = v ? strip((await get('https://housing.seoul.go.kr' + v)).replace(/^[\s\S]*?상세 정보/, '')) : '';
        const p = body.match(/(?:접수\s*기간|인터넷접수)\s*[:：]?\s*(20\d\d)\.\s*(\d+)\.\s*(\d+)\.[^~]*~\s*(?:(20\d\d)\.\s*)?(\d+)\.\s*(\d+)/);
        const start = p ? `${p[1]}-${pad(p[2])}-${pad(p[3])}` : '';
        const end = p ? `${p[4] || p[1]}-${pad(p[5])}-${pad(p[6])}` : '';
        if (end && end < kst) continue;
        if (!end && age > 30) continue;
        const id = 'sh-' + seq;
        const units = (body.match(/공급호수\s*[:：]\s*([^■○(]{1,18})/) || [])[1]?.trim() || '';
        row({ id, src: 'SH', cat: kind === 'sale' ? '아파트 분양' : 'SH 임대', name: title, gu: (title.match(/(\S+구)\s/) || [])[1] || '', start, end, units, url: ext, posted });
        texts[id] = body.slice(0, 1500);
        await wait(300);
      }
    }
  }
});

// 4) 청년안심주택: 목록 JSON의 content 에 기간이 있다
await source('청년안심주택', async () => {
  for (let p = 1; p <= 2; p++) {
    const text = await get('https://soco.seoul.go.kr/youth/pgm/home/yohome/bbsListJson.json', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest', Referer: 'https://soco.seoul.go.kr/youth/bbs/BMSR00015/list.do?menuNo=400008' }, body: new URLSearchParams({ bbsId: 'BMSR00015', pageIndex: String(p), searchAdresGu: '', searchCondition: '', searchKeyword: '', optn2: '', optn5: '' }) });
    for (const x of JSON.parse(text).resultList) {
      const c = strip(x.content);
      const m = c.match(/청약\s*신청[^:：]*[:：]\s*[‘'’]?(\d\d)\.\s*(\d+)\.\s*(\d+)\.[^~]{0,20}~\s*(?:[‘'’]?(\d\d)\.\s*)?(\d+)\.\s*(\d+)/);
      const one = c.match(/청약\s*신청[^:：]*[:：]\s*[‘'’]?(\d\d)\.\s*(\d+)\.\s*(\d+)\.[^~]{0,20}~\s*\d\d:\d\d/);
      const start = m ? `20${m[1]}-${pad(m[2])}-${pad(m[3])}` : one ? `20${one[1]}-${pad(one[2])}-${pad(one[3])}` : (x.optn4 || '');
      const end = m ? `20${m[4] || m[1]}-${pad(m[5])}-${pad(m[6])}` : one ? start : '';
      if ((end || start) && (end || start) < kst) continue;
      const uu = c.match(/공급호수\s*[:：]\s*([^■]{1,70})/)?.[1] || '';
      const id = 'soco-' + x.boardId;
      row({ id, src: '서울시 청년안심주택', cat: '청년안심주택', name: x.nttSj.replace(/^\[[^\]]+\]\s*/, ''), gu: (c.match(/서울특별시\s+(\S+구)/) || [])[1] || '', start, end, units: /예비자/.test(uu) ? '예비자 모집' : (uu.match(/공공지원민간임대\s*(\d[\d,]*세대)/)?.[1] || uu.match(/(\d[\d,]*세대)/)?.[1] || ''), posted: x.optn1, url: `https://soco.seoul.go.kr/youth/bbs/BMSR00015/view.do?boardId=${x.boardId}&menuNo=400008` });
      texts[id] = c.slice(0, 800);
    }
    await wait(300);
  }
});


// 비교
const added = []; const changed = [];
const uniq = new Map(rows.map((r) => [r.id, r]));
for (const r of uniq.values()) {
  const old = existing[r.id];
  const { pubKey, ...clean } = r;
  if (!old) {
    if (r.end && r.end < kst) continue; // 이미 끝난 옛 공고는 새로 넣지 않는다
    added.push({ ...clean, needs_el: !r.el, text: texts[r.id] || '' });
    continue;
  }
  const diff = {};
  for (const k of ['start', 'end', 'ann', ...(r.sme ? ['units'] : [])]) if (r[k] && r[k] !== old.data[k]) diff[k] = r[k];
  if (r.sme && pubKey && !String(old.data.note || '').includes(pubKey)) diff.note = r.note; // 입주자모집공고일이 바뀐 경우만
  if (Object.keys(diff).length) changed.push({ id: r.id, version: old.version, name: old.data.name, diff: { ...diff, seen: kst } });
}
const report = { date: kst, existing: Object.keys(existing).length, counts, errors, added, changed };
writeFileSync(outFile, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ date: kst, existing: report.existing, counts, errors, added: added.map((a) => `${a.id} ${a.name} ${a.start || '-'}~${a.end || '-'}${a.needs_el ? ' (el 필요)' : ''}`), changed: changed.map((c) => `${c.id} ${c.name} ${JSON.stringify(c.diff)}`) }, null, 1));
if (Object.keys(errors).length === Object.keys(counts).length) process.exit(1);
