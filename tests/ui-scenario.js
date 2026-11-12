#!/usr/bin/env node
/* IslandX — boots the prototype in a headless DOM and drives it like a user would.
 *
 *   npm i            # once, for jsdom
 *   node tests/ui-scenario.js
 *
 * This is the safety net for the prototype: it proves the island boots without a single console
 * error, that the pomodoro runs, that the focus shield decides instead of just popping, that the
 * scam guard stays silent during focus, that the priority queue defers an OSD behind a toast,
 * that music+timer collapse into the dual pill, and that reply → sent still works.
 */
const fs=require('fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const path=require('path');
const FILE=process.argv[2]||path.join(__dirname,'..','IslandX-Prototype','index.html');
const html=fs.readFileSync(FILE,'utf8');
const errors=[];const vc=new VirtualConsole();
vc.on('jsdomError',e=>errors.push('jsdomError: '+(e.detail&&e.detail.stack||e.message)));
vc.on('error',(...a)=>errors.push('console.error: '+a.join(' ')));
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/',virtualConsole:vc,beforeParse(w){
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
  w.devicePixelRatio=2;
  const p=new Proxy({},{get:(t,k)=>k==='canvas'?null:((...a)=>p),set:()=>true});
  w.HTMLCanvasElement.prototype.getContext=()=>p;
  w.Element.prototype.setPointerCapture=()=>{};w.Element.prototype.releasePointerCapture=()=>{};
  w.addEventListener('error',e=>errors.push('window.error: '+(e.error&&e.error.stack||e.message)));
}});
const w=dom.window,d=w.document;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const click=s=>{const el=d.querySelector(s);if(!el)return false;el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));return true};
const btn=(sel,txt)=>[...d.querySelectorAll(sel)].find(b=>txt.test(b.textContent));
const state=()=>d.querySelector('#island').dataset.s;
const log=()=>d.querySelector('#log').textContent;
const checks=[];const ok=(n,c,x='')=>checks.push((c?'PASS':'FAIL')+'  '+n+(x?'  ['+x+']':''));
const timer=()=>(d.querySelector('[data-timer]')||{}).textContent;

(async()=>{
  await wait(600);
  ok('boots clean',errors.length===0,errors[0]||'');

  click('#b-ctx button[data-k=timer]'); await wait(200);
  ok('timer starts in focus phase',d.querySelector('#island').dataset.ph==='focus',state()+'/'+d.querySelector('#island').dataset.ph);
  const t0=timer(); await wait(1600); const t1=timer();
  ok('pomodoro counts down',t0!==t1,t0+' → '+t1);

  // notification while focusing → shield decides
  btn('#b-notif button',/Sara/).dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(300);
  ok('focus shield evaluated',/focus|held/i.test(log()),log().slice(0,110));

  // scam during focus must stay silent, never held
  btn('#b-notif button',/Unknown/).dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(300);
  ok('scam silent during focus',/possible scam/i.test(log())&&!/held/i.test(log()),log().slice(0,120));

  // queue: a sys OSD during a toast must wait its turn
  btn('#b-sys button',/65 W/).dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(200);
  const duringToast=state();
  await wait(5200);
  ok('priority queue defers OSD',duringToast==='toast'&&state()==='chg',duringToast+' → '+state());

  // stop the timer → charging/other states must not stick
  click('#b-ctx button[data-k=timer]'); await wait(300);
  ok('timer stops cleanly',d.querySelector('#island').dataset.ph==='ready'&&!d.querySelector('#island').classList.contains('ptimer'),state()+'/'+d.querySelector('#island').dataset.ph);

  // dual pill: music + timer
  await wait(4200);   // let the charging OSD finish, we must be at rest
  click('#b-ctx button[data-k=music]'); await wait(250);
  const musicOnly=state();
  click('#b-ctx button[data-k=timer]'); await wait(350);
  ok('music → music pill',musicOnly==='music',musicOnly);
  ok('music+timer → dual pill',state()==='dual',state());

  click('#b-ctx button[data-k=music]'); click('#b-ctx button[data-k=timer]'); await wait(400);

  // reply → sent
  btn('#b-notif button',/Sara/).dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(300);
  const r=d.querySelector('#t-reply');
  if(r){r.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await wait(250);click('#r-send');await wait(250);
    ok('sent confirmation',state()==='sent',state());}
  else ok('sent confirmation',false,'no reply button, state='+state());

  // reset
  click('#reset'); await wait(150);
  ok('reset clears learning',/reset/i.test(log()));

  // ---- system OSDs each have their own language ----
  await wait(1200);
  btn('#b-sys button',/^Volume/).dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(300);
  const bars=d.querySelectorAll('#vol-lad i').length, lit=d.querySelectorAll('#vol-lad i.on').length;
  ok('volume → segment ladder',state()==='vol'&&bars===14&&lit===9,bars+' bars · '+lit+' lit');

  await wait(2000);
  btn('#b-sys button',/^Brightness/).dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(300);
  const bv=parseFloat(d.querySelector('#s-bri').style.getPropertyValue('--v'));
  ok('brightness → warm beam',state()==='bri'&&bv>60,'level '+bv);

  await wait(2000);
  btn('#b-sys button',/Low battery/).dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(300);
  ok('low battery → hazard battery',state()==='lowbat'&&!!d.querySelector('#l-bat.low i'),state());

  await wait(5200);          // the low-battery card owns the island for 5 s
  btn('#b-sys button',/65 W/).dispatchEvent(new w.MouseEvent('click',{bubbles:true})); await wait(300);
  await wait(700);           // let the count-up finish
  ok('charging → hero capsule',state()==='chg'&&!!d.querySelector('#c-bat.chg')&&/%$/.test(d.querySelector('#c-pct').textContent),state()+' · '+d.querySelector('#c-pct').textContent);

  // persistence
  const ls={};for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);ls[k]=1}
  ok('persists small state',Object.keys(ls).length>0,Object.keys(ls).join(','));

  console.log(checks.join('\n'));
  console.log('\nruntime errors: '+errors.length);
  errors.slice(0,6).forEach(e=>console.log('  '+String(e).split('\n')[0]));
  process.exit(checks.some(c=>c.startsWith('FAIL'))?1:0);
})();
