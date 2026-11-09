// Usage: node design/scripts/contrast.mjs  (reads ../tokens.css, checks declared pairings)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'tokens.css'), 'utf8');
const t = {'success-soft':'#e2f3e8','warning-soft':'#fdf1d8','danger-soft':'#fbe6e4','info-soft':'#e4effb'}; // status tints are NOT tokens; see components.md
for (const m of css.matchAll(/--(?:color-)?([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) t[m[1]] = m[2];
const lum = h => { const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
const ratio=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05)};
const P = [
 ['text','surface',4.5],['text','surface-alt',4.5],['text','brand-soft',4.5],
 ['text-muted','surface',4.5],['text-muted','surface-alt',4.5],['text-muted','brand-soft',4.5],
 ['surface','brand',4.5],['surface','brand-strong',4.5],['brand','surface',4.5],['brand','brand-soft',4.5],['brand-strong','brand-soft',4.5],['brand-strong','surface',4.5],
 ['text','accent',4.5],['accent','brand-strong',3],['accent','brand',3],
 ['border','surface',3],['border','surface-alt',3],['brand','surface-alt',3],
 ['success','surface',4.5],['warning','surface',4.5],['danger','surface',4.5],['info','surface',4.5],
 ['success','surface-alt',4.5],['warning','surface-alt',4.5],['danger','surface-alt',4.5],['info','surface-alt',4.5],
 ['surface','danger',4.5],['surface','success',4.5],['surface','info',4.5],
 ['text','success-soft',4.5],['text','warning-soft',4.5],['text','danger-soft',4.5],['text','info-soft',4.5],
 ['success','success-soft',4.5],['warning','warning-soft',4.5],['danger','danger-soft',4.5],['info','info-soft',4.5],
];
let fail=0; console.log('| Foreground | Background | Ratio | Need | Result |\n|---|---|---|---|---|');
for (const [f,b,n] of P){ if(!t[f]||!t[b]){console.log('missing',f,b);fail++;continue;} const r=ratio(t[f],t[b]); const ok=r>=n; if(!ok)fail++; console.log(`| ${f} ${t[f]} | ${b} ${t[b]} | ${r.toFixed(2)} | ${n} | ${ok?'PASS':'FAIL'} |`);}
process.exit(fail?1:0);
