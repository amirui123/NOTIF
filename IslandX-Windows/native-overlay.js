/* Native overlay adapter. The embedded prototype and its trained weights stay unchanged. */
(() => {
  const bridge = window.chrome && window.chrome.webview;
  if (!bridge) return;
  let lastPower = null, observed = null, lastSize = '';
  document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `html,body,#stage{background:transparent!important;overflow:hidden!important}#stage>.wall,#win,#city,#glow,#dock{display:none!important}#wrap{top:0!important}`;
    document.head.appendChild(style);
    document.documentElement.dataset.nativeOverlay = 'true';
    const observer = new ResizeObserver(reportSize);
    function reportSize() {
      const active = document.querySelector('#island .st.on');
      if (!active) return;
      if (active !== observed) { if (observed) observer.unobserve(observed); observed = active; observer.observe(active); }
      const width = Math.ceil(active.offsetWidth + 56);
      const extra = document.querySelector('#wrap.nav') ? 46 : 26;
      const height = Math.ceil(active.offsetHeight + extra);
      const key = width + ':' + height;
      if (key !== lastSize) { lastSize = key; bridge.postMessage({type:'size',width,height}); }
    }
    const changes = new MutationObserver(reportSize);
    document.querySelectorAll('#island .st').forEach(el => changes.observe(el,{attributes:true,attributeFilter:['class']}));
    changes.observe(document.querySelector('#wrap'),{attributes:true,attributeFilter:['class']});
    reportSize();
    bridge.addEventListener('message', event => {
      const data = event.data;
      if (!data || data.type !== 'power' || !Number.isFinite(data.percent)) return;
      const pct = Math.max(0,Math.min(100,Math.round(data.percent))), plugged = data.plugged === true;
      batt.pct = pct;
      /* 1 is a boolean sentinel: Windows' power status API does not report charger wattage. */
      batt.w = plugged ? 1 : 0;
      renderBatt();
      clearInterval(chgT); chgT = 0; // Never simulate charging on a real battery.
      const charge = document.querySelector('#s-chg');
      if (plugged) { charge.dataset.mode='fast'; document.querySelector('#c-txt').textContent = pct >= 100 ? 'Full · plugged in' : 'Plugged in'; }
      else document.querySelector('#c-txt').textContent = 'On battery';
      document.querySelector('#l-txt').textContent = batt.saver ? 'Battery saver (demo)' : 'Battery low';
      if (lastPower && plugged !== lastPower.plugged) {
        if (ctx.fs) pulse(plugged ? '#34D399' : '#E5E5EA');
        else transient('chg', 3400);
      } else if (lastPower && pct <= 15 && lastPower.percent > 15 && !plugged) transient('lowbat', 5000);
      lastPower = {percent:pct,plugged};
    });
    bridge.postMessage({type:'ready'});
  }, {once:true});
})();
