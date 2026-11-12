/* Native overlay adapter. The embedded prototype and its trained weights stay unchanged. */
(() => {
  const bridge = window.chrome && window.chrome.webview;
  if (!bridge) return;
  let lastPower = null, observed = null, lastSize = '', shrinkTimer = 0, currentWidth = 0, currentHeight = 0;
  document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `html,body,#stage{background:transparent!important;overflow:hidden!important}#stage>.wall,#win,#city,#glow,#dock,#a-pal,#a-shot,#a-dnd,#l-save{display:none!important}#wrap{top:0!important}`;
    document.head.appendChild(style);
    document.documentElement.dataset.nativeOverlay = 'true';
    // The prototype palette exposes simulated music, meetings, screenshots and DND.
    // Do not offer it on the real desktop until those actions are actually integrated.
    window.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); e.stopImmediatePropagation();
      }
    }, true);
    // Clipboard access is explicit and text stays in memory only.
    const clipboard = document.createElement('div');
    clipboard.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;min-width:0';
    const read = document.createElement('button');
    read.id='native-clipboard'; read.type='button'; read.textContent='Clipboard'; read.title='Read clipboard text once';
    read.className='chip';
    const value = document.createElement('span');
    value.className='xs t2 ell'; value.style.cssText='flex:1;min-width:0';
    read.addEventListener('click', e => { e.stopPropagation(); bridge.postMessage({type:'readClipboard'}); });
    clipboard.append(read,value); document.querySelector('#s-peek').append(clipboard);
    document.querySelector('#wrap').addEventListener('mouseleave', () => { value.textContent=''; });
    const observer = new ResizeObserver(reportSize);
    function reportSize() {
      const active = document.querySelector('#island .st.on');
      if (!active) return;
      if (active !== observed) { if (observed) observer.unobserve(observed); observed = active; observer.observe(active); }
      const width = Math.ceil(active.offsetWidth + 56);
      const extra = document.querySelector('#wrap.nav') ? 46 : 26;
      const height = Math.ceil(active.offsetHeight + extra);
      // Grow immediately; defer shrinking until the closing spring has finished.
      // Otherwise the native window clips the animated shell mid-transition.
      clearTimeout(shrinkTimer);
      function send(w,h) {
        const key = w + ':' + h;
        if (key !== lastSize) { currentWidth=w; currentHeight=h; lastSize=key; bridge.postMessage({type:'size',width:w,height:h}); }
      }
      if (width > currentWidth || height > currentHeight) send(Math.max(width,currentWidth),Math.max(height,currentHeight));
      if (width < currentWidth || height < currentHeight) shrinkTimer=setTimeout(() => send(width,height),700);
    }
    const changes = new MutationObserver(reportSize);
    document.querySelectorAll('#island .st').forEach(el => changes.observe(el,{attributes:true,attributeFilter:['class']}));
    changes.observe(document.querySelector('#wrap'),{attributes:true,attributeFilter:['class']});
    reportSize();
    bridge.addEventListener('message', event => {
      const data = event.data;
      if (data && data.type === 'clipboard') {
        value.textContent = typeof data.text === 'string' ? data.text : 'Clipboard unavailable';
        return;
      }
      if (!data || data.type !== 'power') return;
      if (!data.available || !Number.isFinite(data.percent)) { lastPower = null; return; }
      if (typeof data.plugged !== 'boolean') { lastPower = null; return; }
      const pct = Math.max(0,Math.min(100,Math.round(data.percent))), plugged = data.plugged;
      if (lastPower && lastPower.percent === pct && lastPower.plugged === plugged) return;
      batt.pct = pct;
      /* 1 is a boolean sentinel: Windows' power status API does not report charger wattage. */
      batt.w = plugged ? 1 : 0;
      renderBatt();
      clearInterval(chgT); chgT = 0; // Never simulate charging on a real battery.
      const charge = document.querySelector('#s-chg');
      if (plugged) {
        charge.dataset.mode='fast';
        charge.style.setProperty('--bc','var(--ok)');
        document.querySelector('#c-txt').textContent = pct >= 100 ? 'Full · plugged in' : 'Plugged in';
      } else document.querySelector('#c-txt').textContent = 'On battery';
      document.querySelector('#l-txt').textContent = 'Battery low';
      if (lastPower && plugged !== lastPower.plugged) {
        if (ctx.fs) pulse(plugged ? '#34D399' : '#E5E5EA');
        else transient('chg', 3400);
      } else if (lastPower && pct <= 15 && lastPower.percent > 15 && !plugged) transient('lowbat', 5000);
      lastPower = {percent:pct,plugged};
    });
    bridge.postMessage({type:'ready'});
  }, {once:true});
})();
