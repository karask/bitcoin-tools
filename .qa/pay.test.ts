import { test } from 'vitest';
import * as B from '../src/lib/bip21'; import * as L from '../src/lib/bolt11'; import { decodeAddress } from '../src/lib/address';
const show=(x:any)=>{try{return JSON.stringify(x,(k,v)=>typeof v==='bigint'?String(v):v instanceof Uint8Array?'bytes':v).slice(0,300)}catch(e){return String(e)}};
test('p',()=>{
 for(const a of ['BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ','tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7','tb1qw508d6qejxtdg4c3t5w76wt5rm6q40zxfaj9'.replace('40zxfaj9','40zxfaj9')]) console.log(a.slice(0,20),show(decodeAddress(a)));
 const fns:any=B; const ln:any=L;
 for(const u of ['bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.001&label=Test&message=hi%20there','bitcoin:BC1QAR0SRRR7XFKVY5L643LYDNW9RE59GTZZWF5MDQ?amount=1e-3','bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=-1','bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=21000001','bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?req-foo=1','bitcoin:tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7?amount=0.00001','bitcoin:?lightning=lnbc1','bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.123456789'])
  for(const k of Object.keys(fns)) if(typeof fns[k]==='function'&&/parse|decode/i.test(k)) {let r;try{r=fns[k](u)}catch(e){r='THROW '+e}console.log(k,u.slice(8,40),u.slice(-25),show(r))}
 for(const i of ['lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh','lntb1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5','garbage','lnbc1'])
  for(const k of Object.keys(ln)) if(typeof ln[k]==='function'&&/decode/i.test(k)) {let r;try{r=ln[k](i)}catch(e){r='THROW '+e}console.log(k,i.slice(0,12),show(r))}
});
