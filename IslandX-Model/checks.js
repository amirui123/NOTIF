// Behavioural test-suite (CheckList style, Ribeiro et al. 2020) run against the SHIPPED engine (engine.js + weights.json).
const fs=require('fs');global.WB=JSON.parse(fs.readFileSync(__dirname+'/weights.json'));global.localStorage={getItem(){return null},setItem(){}};
eval(fs.readFileSync(__dirname+'/engine.js','utf8')+`
const out={};const C0={fs:false,priv:false,dnd:false},CF={fs:true,priv:false,dnd:false};
const P=(n,C=C0)=>predictF(features(n,C));
// 0. parity with the Python implementation
if(fs.existsSync('/tmp/ref.json')){const ref=JSON.parse(fs.readFileSync('/tmp/ref.json'));let w=0;
  for(const [s,p] of ref.texts){const q=textModel(s);w=Math.max(w,Math.abs(p[0]-q.pu),...q.pt.map((v,i)=>Math.abs(v-p[i+1])))}
  w=Math.max(w,Math.abs(sigm(ref.z23)-sigm(netZ(NETS[0],ref.x23))),...ref.z41.map((z,i)=>Math.abs(sigm(z)-sigm(netZ(NETS[i+1],ref.x41)))));
  out.parity_max_abs_diff=+w.toExponential(2)}
const rate=(name,arr,f)=>{const ok=arr.filter(f).length;out[name]=ok+'/'+arr.length;return arr.filter(x=>!f(x))};
const msg=(body,o={})=>({app:'Telegram',from:'Test',body,direct:1,...o});
// 1. hand-written modern messages, none taken from the training data
const personal=['Hey, are you coming to dinner tonight?','Can you send me the slides before the meeting?','Running late, be there in 10','Happy birthday! Hope you have a great day','Did you see the game last night?','Call me when you get home','Thanks for yesterday, it really helped','Where should we meet tomorrow?',
 'سلام، امشب شام میای؟','جلسه فردا ساعت ۱۰ یادت نره','رسیدم خونه، نگران نباش','مامان گفت نون بگیر سر راه','فایل رو برات فرستادم، یه نگاه بنداز','کجایی؟ ده دقیقه دیگه می‌رسم','تولدت مبارک عزیزم','فردا بریم کوه؟'];
const promo=['Black Friday starts now: 60% off sitewide','Your cart misses you! Complete your order and get free shipping','New season, new styles. Shop the collection today','Weekend deal: buy one get one free on all drinks','Upgrade to Pro and save 30% this month only','Top 10 playlists picked for you this week',
 'حراج بزرگ پاییزه شروع شد، تا ۷۰٪ تخفیف','سبد خریدت منتظرته! همین حالا با ارسال رایگان سفارش بده','کد تخفیف ۵۰ هزار تومانی فقط برای امروز','پیشنهاد ویژه آخر هفته: دو تا بخر یکی ببر','اشتراک ویژه را با ۴۰ درصد تخفیف تمدید کنید','جدیدترین محصولات فصل رسید، همین حالا خرید کنید'];
const scam=['Your bank account has been suspended. Verify your identity now at secure-login-check.com','You have won a $1000 gift card! Claim it here: bit.ly/win-now','Unusual sign-in detected. Confirm your password at account-verify.net to avoid closure','Final notice: your package is on hold, pay the customs fee at track-parcel.co','Urgent: your card will be blocked today, call 09061234567 immediately',
 'هموطن گرامی، ابلاغیه قضایی برای شما صادر شده. مشاهده در: sana-adl.co','حساب بانکی شما مسدود شده است. برای رفع مسدودی وارد لینک شوید: bank-meli.co','یارانه معیشتی شما واریز نشد. برای ثبت نام به لینک زیر مراجعه کنید: yaraneh.me','شما برنده قرعه کشی همراه اول شده‌اید. برای دریافت جایزه کد تایید را ارسال کنید','سهام عدالت شما آزاد شد. جهت دریافت سود وارد سامانه شوید: sahamedalat.ly','من کارمند بانک هستم، برای واریز سود کد تایید پیامک شده را بفرستید'];
const trans=['Your verification code is 482913','731904 is your login code','Use 5521 to sign in. Do not share this code.','Your order #48213 has shipped and will arrive Friday','کد تایید شما: 48291','رمز پویا 918273','سفارش شما ثبت شد و امروز تحویل می‌شود','برداشت مبلغ 250,000 ریال از حساب شما'];
const T=s=>textModel(s);
out.failed_examples={
 personal:rate('text: personal messages NOT flagged as unwanted',personal,s=>T(s).pu<.5),
 promo:rate('text: promotions flagged as unwanted',promo,s=>T(s).pu>.5),
 scam_unwanted:rate('text: scams flagged as unwanted',scam,s=>T(s).pu>.5),
 scam_type:rate('text: scams recognised as type "scam"',scam,s=>T(s).pt[3]>.5),
 trans:rate('text: codes / receipts NOT flagged as scam or promo',trans,s=>T(s).pt[3]<.5&&T(s).pt[2]<.5)};
// 2. directional expectations of the full pipeline (fresh memory)
rate('policy: login codes are always shown (also in full-screen)',trans.slice(0,3).concat(trans.slice(4,6)),s=>decide(msg(s,{app:'Bank',direct:0}),P(msg(s,{app:'Bank',direct:0}),CF),CF)==='show');
rate('policy: scams are never promoted',scam,s=>['scam','silent'].includes(decide(msg(s,{direct:0}),P(msg(s,{direct:0})),C0)));
rate('full-screen lowers the score of ordinary messages',personal,s=>P(msg(s),CF)<P(msg(s),C0));
rate('a known contact scores at least as high as an unknown one',personal,s=>P(msg(s,{known:1}))>=P(msg(s))-.01);
rate('promotion from the same sender scores lower than a personal message',promo,s=>P(msg(s))<P(msg(personal[0])));
rate('adding "urgent" / "فوری" does not lower the score',personal,s=>P(msg((/[آ-ی]/.test(s)?'فوری: ':'Urgent: ')+s))>=P(msg(s))-.01);
// 3. learning
const a=msg('lunch pics from the team',{app:'Slack',from:'#random',direct:0});const p0=P(a);for(let i=0;i<3;i++){const f=features(a,C0);memArrive(a,f);memLearn(a,0)}const pd=P(a);
MEM=freshMem();const b=msg(promo[0],{app:'Shop',from:'Shop',direct:0});const q0=P(b);for(let i=0;i<3;i++){const f=features(b,C0);memArrive(b,f);memLearn(b,1)}const qo=P(b);MEM=freshMem();
out.learning={'3 dismissals':p0.toFixed(2)+' -> '+pd.toFixed(2),'3 opens of a promo sender':q0.toFixed(2)+' -> '+qo.toFixed(2)};
// 4. speed
let t=process.hrtime.bigint();for(let i=0;i<300;i++){for(const k in textCache)delete textCache[k];P(msg(personal[i%16]+i))}
out.latency_ms_per_notification=+(Number(process.hrtime.bigint()-t)/3e8).toFixed(2);
out.model_size_kb=Math.round(fs.statSync(__dirname+'/weights.json').size/1024);
console.log(JSON.stringify(out,null,1));fs.writeFileSync(__dirname+'/metrics_checks.json',JSON.stringify(out,null,1));
`)
