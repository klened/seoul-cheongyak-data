// 청년안심주택 공고문 원본(PDF·hwpx)을 읽어 공급 구분별 자격 기준을 만든다.
// 규칙으로만 읽으므로, 표준 기준(standards.json)과 다른 숫자가 나오거나 구분을 못 찾으면 ok:false 로 돌려준다.
// 그 공고는 el 을 바꾸지 않고 「확인 필요」로 남긴다.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const require = createRequire(import.meta.url);
export const STD = JSON.parse(readFileSync(new URL('./standards.json', import.meta.url), 'utf8'));

// 파일 형식을 보고 글자만 꺼낸다
export async function docText(buf) {
  const head = Buffer.from(buf.slice(0, 4)).toString('latin1');
  if (head.startsWith('%PDF')) return pdfText(buf);
  if (head.startsWith('PK')) return hwpxText(buf);
  throw new Error('읽을 수 없는 형식(' + JSON.stringify(head) + ')');
}

async function pdfText(buf) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const root = dirname(require.resolve('pdfjs-dist/package.json'));
  const doc = await getDocument({
    data: new Uint8Array(buf),
    cMapUrl: join(root, 'cmaps') + '/',
    cMapPacked: true,
    standardFontDataUrl: join(root, 'standard_fonts') + '/',
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  const out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    out.push(c.items.map((x) => x.str).join(' '));
  }
  await doc.destroy();
  return out.join('\n');
}

function hwpxText(buf) {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => /^Contents\/section\d+\.xml$/i.test(f.name) });
  const names = Object.keys(files).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  if (!names.length) throw new Error('hwpx 본문 없음');
  return names.map((n) => strFromU8(files[n]).replace(/<hp:t[^>]*>/g, '').replace(/<\/hp:p>/g, '\n').replace(/<[^>]+>/g, ' ')).join('\n')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

const won = (n) => n.toLocaleString('en-US');
const youth = (basis, g) => ({ n: `청년 ${g}`, g, who: '청년', m: ['single'], docM: ['parent'], house: 'me', age: [19, 39], basis, car: STD.car, v: 1, ...(g === '특별공급' ? { inc: STD.inc120, asset: STD.youthAsset } : {}) });
const newly = (basis, g) => ({ n: `신혼부부 ${g}`, g, who: '신혼부부', m: ['newly', 'engaged'], docM: ['parent'], house: 'all', age: [19, 39], basis, car: STD.car, v: 1, ...(g === '특별공급' ? { inc: STD.inc120, asset: STD.newlyAsset } : {}) });

// 공고문 글자에서 기준을 찾는다. 띄어쓰기와 줄바꿈은 무시한다
export function parseYouthNotice(raw) {
  const T = raw.replace(/\s+/g, '');
  const fail = (why) => ({ ok: false, why });

  // PDF 에 따라 글자 순서가 섞여 날짜가 조금 뒤에 나오기도 한다
  const d = T.match(/공고일[은는이]?(?:\(|:)?(20\d\d)[.\-](\d{1,2})[.\-](\d{1,2})/) || T.match(/모집공고일[은는]?.{0,40}?(20\d\d)\.(\d{1,2})\.(\d{1,2})/);
  if (!d) return fail('공고일을 찾지 못함');
  const basis = `${d[1]}-${d[2].padStart(2, '0')}-${d[3].padStart(2, '0')}`;

  // 이번 모집의 공급 구분: 개요의 공급호수 줄에서 찾는다
  const ov = (T.match(/공급(?:호수|규모)[:：]?(.{0,160})/) || [])[1] || '';
  const groups = ['특별공급', '일반공급'].filter((g) => ov.includes(g));
  if (!groups.length) return fail('공급 구분을 찾지 못함');

  // 대상: 공급 표(「공급유형」부터 「합계」까지)에 나온 계층
  const tables = [...T.matchAll(/공급유형(.{0,1500}?)합계/g)].map((m) => m[1]).join(' ');
  const who = [];
  if (/청년/.test(tables)) who.push('청년');
  if (/신혼/.test(tables)) who.push('신혼부부');
  if (!who.length) return fail('공급 대상을 찾지 못함');

  // 표준 기준과 같은지 확인한다. 하나라도 다르면 넣지 않는다
  if (!T.includes(won(STD.car))) return fail('자동차가액이 표준과 다름');
  if (groups.includes('특별공급')) {
    if (!STD.inc120.slice(1, 3).every((v) => T.includes(won(v)))) return fail('소득 기준이 표준과 다름');
    // 「2억 5,100만 원」, 표의 「251 345 단위: 백만원」, 글자 순서가 섞인 「자산가액억만원이하25,100」을 모두 받는다
    const assetSeen = (man) => {
      const eok = Math.floor(man / 10000), rest = won(man % 10000);
      return T.includes(`${eok}억${rest}만`) || new RegExp(`자산가액.{0,16}?${eok}\\D{0,3}${rest}`).test(T);
    };
    const tableSeen = T.includes(`${STD.youthAsset / 100}${STD.newlyAsset / 100}단위:백만원`);
    if (!(tableSeen || (assetSeen(STD.youthAsset) && assetSeen(STD.newlyAsset)))) return fail('자산 기준이 표준과 다름');
  }

  const el = [];
  for (const g of groups) {
    if (who.includes('청년')) el.push(youth(basis, g));
    if (who.includes('신혼부부')) el.push(newly(basis, g));
  }
  return { ok: true, basis, groups, who, el };
}

// 단지 전체 임대 조건 가운데 이번 모집 구분에 해당하는 줄만 남긴다
export function plansFor(plans, groups, who) {
  if (!Array.isArray(plans)) return plans;
  const kept = plans.filter((p) => groups.includes(p.g) && String(p.who || '').split(/,\s*/).some((w) => who.includes(w)));
  return kept.length ? kept : plans;
}
