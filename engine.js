/* ===== IslandX attention model v4 — inference + on-device memory (port of IslandX-Model) ===== */
const b64=s=>{const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
const sigm=z=>1/(1+Math.exp(-z));
const TX=WB.text, TXE=new Int8Array(b64(TX.E).buffer);
const deq=t=>{const q=new Int16Array(b64(t.d).buffer),f=new Float32Array(q.length);for(let i=0;i<q.length;i++)f[i]=q[i]*t.s;return f};
const NETS=WB.nets.map(n=>{const o={mu:n.mu,sd:n.sd,d:n.mu.length};for(const k of ['W1','b1','W2','b2','W3','b3','W4','b4','W5','b5','Ww'])o[k]=deq(n[k]);o.H=o.b1.length;return o});
function dense(x,W,b,nout){const nin=x.length,o=new Float32Array(nout);for(let j=0;j<nout;j++){let s=b?b[j]:0;for(let i=0;i<nin;i++)s+=x[i]*W[i*nout+j];o[j]=s}return o}
const relu=a=>{for(let i=0;i<a.length;i++)if(a[i]<0)a[i]=0;return a};
function netZ(N,xr){
  const x=new Float32Array(N.d);for(let i=0;i<N.d;i++)x[i]=(xr[i]-N.mu[i])/N.sd[i];
  const h1=relu(dense(x,N.W1,N.b1,N.H)), r=relu(dense(h1,N.W2,N.b2,N.H)), h2=dense(r,N.W3,N.b3,N.H);
  for(let i=0;i<N.H;i++)h2[i]=Math.max(0,h2[i]+h1[i]);
  const h3=relu(dense(h2,N.W4,N.b4,N.H/2));
  return dense(h3,N.W5,N.b5,1)[0]+dense(x,N.Ww,null,1)[0];
}
/* --- text model: hashed character n-grams -> embedding bag -> hidden -> P(promo) --- */
const FA_FROM="۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩يكۀة", FA_TO="01234567890123456789یکهه";
function normalizeText(t){
  t=t.toLowerCase().replace(/[۰-۹٠-٩يكۀة]/g,c=>FA_TO[FA_FROM.indexOf(c)]).replace(/\u200c/g,' ');
  t=t.replace(/(https?:\/\/|www\.)\S+|\S+\.(com|ir|net|org|co|me|ly)\b\S*/gi,' ~url ');
  return t.replace(/\[random_number\]|\d/g,'0').replace(/0{3,}/g,'000').replace(/\s+/g,' ').trim().slice(0,320);
}
const normalizeDigits=t=>t.replace(/[۰-۹٠-٩]/g,c=>FA_TO[FA_FROM.indexOf(c)]);
const ENC=new TextEncoder();
function fnv1a(s){let h=0x811C9DC5;for(const b of ENC.encode(s))h=Math.imul(h^b,0x01000193)>>>0;return h}
const textCache={}, TYPES=['personal','transactional','promotional','scam'];
function textModel(raw){                       /* -> {pu: P(unwanted), pt: [personal, transactional, promotional, scam]} */
  if(raw in textCache)return textCache[raw];
  const t=' '+normalizeText(raw)+' ', cnt=new Map(), add=s=>{const k=fnv1a(s)%8192;cnt.set(k,(cnt.get(k)||0)+1)};
  for(const n of [2,3,4])for(let i=0;i+n<=t.length;i++)add(t.slice(i,i+n));
  t.split(' ').filter(Boolean).forEach(w=>add('w:'+w));
  let tot=0;cnt.forEach(c=>tot+=Math.sqrt(c));
  const D=24,H=48,a=new Float32Array(D);
  cnt.forEach((c,k)=>{const w=Math.sqrt(c)/tot*TX.scale*8;for(let j=0;j<D;j++)a[j]+=w*TXE[k*D+j]});
  for(let j=0;j<D;j++)a[j]+=TX.be[j];
  const h=relu(dense(a,TX.W1,TX.b1,H));let zu=TX.bu[0];for(let j=0;j<H;j++)zu+=h[j]*TX.Wu[j];
  const zt=dense(h,TX.Wt,TX.bt,4),mx=Math.max(...zt),ex=Array.from(zt,v=>Math.exp(v-mx)),sm=ex.reduce((x,y)=>x+y);
  return textCache[raw]={pu:sigm(zu),pt:ex.map(v=>v/sm)};
}
/* --- memory: how THIS user reacts to each sender / app type / time block / busy state --- */
const CAT={Telegram:0,WhatsApp:0,Slack:1,Mail:2,Bank:3,Shop:4,Instagram:5};
const RX={promo:/% ?off|sale|discount|digest|newsletter|تخفیف|٪/i,urg:/urgent|asap|right now|فوری|همین الان/i,otp:/(code|otp|کد|رمز).{0,24}\d{4,8}|\d{4,8}.{0,24}(code|کد|رمز)/i,q:/[?؟]/,men:/@you\b|@me\b/i};
const blank=()=>({n:0,e:0,r:0,lastT:-1e9,lastE:-1e9,lastO:0});
let MEM=loadMem();
function freshMem(){return {s:{},c:{},h:{},rb:{},u:blank(),b:blank(),recent:[],events:0}}
function loadMem(){try{return JSON.parse(localStorage.getItem('islandx-mem3'))||freshMem()}catch(e){return freshMem()}}
function saveMem(){try{localStorage.setItem('islandx-mem3',JSON.stringify(MEM))}catch(e){}}
const slot=(g,k)=>MEM[g][k]||blank();
const nowMin=()=>Date.now()/60000;
const hasOtp=n=>RX.otp.test(n.body);
function features(n,C){
  const t=nowMin(), d=new Date(), hour=d.getHours()+d.getMinutes()/60, c=CAT[n.app]??6, sk=n.app+'|'+n.from, hb=Math.floor(hour/6);
  const busy=(C.fs||C.priv)?1:0, S=slot('s',sk), Cc=slot('c',c), Hh=slot('h',hb), U=MEM.u, Bz=MEM.b, Rb=slot('rb',busy);
  const x=[0,0,0,0,0,0,0], tm=textModel(n.body); x[c]=1;
  x.push(n.direct?1:0, RX.men.test(n.body)?1:0, RX.q.test(n.body)?1:0, RX.urg.test(n.body)?1:0, hasOtp(n)?1:0, RX.promo.test(n.body)?1:0,
    n.known?1:0, t-S.lastE<10?1:0, C.fs?1:0, C.priv?1:0, hour>=9&&hour<18?1:0, hour>=23||hour<7?1:0, Math.min(1,n.body.length/120),
    tm.pu, Math.sin(hour/24*2*Math.PI), Math.cos(hour/24*2*Math.PI), tm.pt[0], tm.pt[1], tm.pt[2], tm.pt[3],
    (S.e+.5)/(S.n+1), Math.log1p(S.n), (Cc.e+.5)/(Cc.n+1), Math.log1p(Cc.n), (U.e+.5)/(U.n+1), (Hh.e+.5)/(Hh.n+1), (Bz.e+.5)/(Bz.n+1),
    Math.log1p(MEM.recent.filter(r=>t-r<10).length), Math.log1p(Math.min(t-S.lastT,1e4)), Math.log1p(Math.min(t-U.lastE,1e4)), S.lastO, Math.log1p(U.n));
  const p0=sigm(netZ(NETS[0],x.slice(0,27))), L=WB.lam;
  x.push(S.r/(S.n+L), Cc.r/(Cc.n+L), U.r/(U.n+L), Hh.r/(Hh.n+L), Rb.r/(Rb.n+L), p0);
  return {x,p0,c,sk,hb,busy};
}
function predictF(f){return sigm((netZ(NETS[1],f.x)+netZ(NETS[2],f.x)+netZ(NETS[3],f.x))/3/WB.T)}
function memArrive(n,f){n._f=f;const S=MEM.s[f.sk]=slot('s',f.sk);S.lastT=nowMin();MEM.recent=MEM.recent.filter(r=>nowMin()-r<10);MEM.recent.push(nowMin());saveMem()}
function memLearn(n,y){
  const f=n._f, t=nowMin(), d=y-f.p0;
  const up=(g,k)=>{const o=MEM[g][k]=slot(g,k);o.n++;o.e+=y;o.r+=d;return o};
  const S=up('s',f.sk);S.lastO=y?1:-1;if(y)S.lastE=t;up('c',f.c);up('h',f.hb);up('rb',f.busy);
  MEM.u.n++;MEM.u.e+=y;MEM.u.r+=d;if(y)MEM.u.lastE=t;if(f.busy){MEM.b.n++;MEM.b.e+=y}
  MEM.events++;saveMem();
}
const isCode=n=>hasOtp(n)||(textModel(n.body).pt[1]>.6&&/\d{4,8}/.test(normalizeDigits(n.body)));
/* --- decision policy: expected utility with context-dependent costs + safety rules --- */
function decide(n,p,C){
  const tm=textModel(n.body);
  if(C.dnd)return 'silent';
  const trusted=n.known||slot('s',n.app+'|'+n.from).e>0;     /* a contact, or someone you have answered before */
  if(tm.pt[3]>.5&&!trusted)return 'scam';                    /* never promoted; listed with a warning */
  if(isCode(n))return 'show';                                /* login codes are always shown */
  const busy=C.fs||C.priv, cost=busy?1.5:.5, miss=RX.urg.test(n.body)?3:1;
  if(p<cost/(1+cost+miss))return 'silent';
  return p>=(busy?.7:.6)?'show':'glance';
}
