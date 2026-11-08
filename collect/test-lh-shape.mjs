// 키 없이 LH 처리 코드를 시험한다: 명세 예시 모양의 가짜 응답을 넣어 daily.mjs 의 LH 구간만 돌린다.
// 실행: node collect/test-lh-shape.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const src = readFileSync(new URL('./daily.mjs', import.meta.url), 'utf8');
const lh = src.slice(src.indexOf('// 5) LH 임대'), src.indexOf('// 비교'));
const sample = [{ dsSch: [{ PAGE: '1' }] }, { resHeader: [{ SS_CODE: 'Y' }], dsList: [
  { PAN_ID: '0000061234', UPP_AIS_TP_NM: '임대주택', AIS_TP_CD_NM: '행복주택', PAN_NM: '서울 강서구 마곡 행복주택 예비입주자 모집', CNP_CD_NM: '서울특별시', PAN_SS: '공고중', PAN_NT_ST_DT: '2026.11.03', CLSG_DT: '2026.11.20', DTL_URL: 'https://apply.lh.or.kr/LH/index.html?gv_param=PAN_ID:0000061234' },
  { PAN_ID: '0000061235', UPP_AIS_TP_NM: '분양주택', AIS_TP_CD_NM: '공공분양', PAN_NM: '서울 고덕 공공분양', CNP_CD_NM: '서울특별시', PAN_SS: '공고중', CLSG_DT: '2026.11.21' },
  { PAN_ID: '0000061236', UPP_AIS_TP_NM: '임대주택', AIS_TP_CD_NM: '든든전세', PAN_NM: '든든전세주택 3차', CNP_CD_NM: '경기도', CLSG_DT: '2026.11.22' },
  { PAN_ID: '0000061237', UPP_AIS_TP_NM: '임대주택', AIS_TP_CD_NM: '매입임대', PAN_NM: '서울지역 청년 매입임대', CNP_CD_NM: '서울특별시', CLSG_DT: '20261125', DTL_URL: 'http://evil.example/x' },
] }];
const code = `const rows=[];const errors={};const counts={};const wait=()=>0;const strip=s=>s;const dec=s=>s;
const row=r=>{const o={...r};for(const k of Object.keys(o))if(o[k]===''||o[k]==null)delete o[k];rows.push(o)};
async function source(n,fn){try{const b=rows.length;await fn();counts[n]=rows.length-b}catch(e){errors[n]=e.message}}
let calls=0;const get=async(u)=>{calls++;if(!u.includes('CNP_CD=11'))throw new Error('지역 조건 없음');if(u.includes('fake%2Fkey'))return JSON.stringify(SAMPLE);return 'X'};
${lh}
console.log(JSON.stringify({counts,errors,calls,rows},null,1));`;
const dir = mkdtempSync(join(tmpdir(), 'lh-test-'));
writeFileSync(join(dir, 't.mjs'), `const SAMPLE=${JSON.stringify(sample)};process.env.LH_API_KEY='fake/key';\n` + code);
await import('file://' + join(dir, 't.mjs').replace(/\\/g, '/'));
