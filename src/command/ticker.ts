/**
 * A clock that keeps time when the tab is in the background.
 *
 * Browsers slow an ordinary `setInterval` in a hidden tab to once a second, then once a minute, so a
 * command centre left behind another window would sound its siren late. A dedicated worker's timer
 * is not slowed that way, so the beat comes from one. If the browser will not make the worker (a strict
 * policy, an old engine), the ordinary timer is used and the screen says nothing different: it is only
 * later when hidden.
 */
export function steadyInterval(fn: () => void, ms: number): () => void {
  let stop: () => void = () => undefined;
  const plain = () => {
    const h = window.setInterval(fn, ms);
    stop = () => window.clearInterval(h);
  };
  try {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) { plain(); return () => stop(); }
    const url = URL.createObjectURL(new Blob([`setInterval(function(){postMessage(0)},${Math.max(100, Math.round(ms))})`], { type: 'text/javascript' }));
    const worker = new Worker(url);
    let alive = true;
    worker.onmessage = () => { if (alive) fn(); };
    worker.onerror = () => { if (!alive) return; alive = false; worker.terminate(); URL.revokeObjectURL(url); plain(); };
    stop = () => { alive = false; worker.terminate(); URL.revokeObjectURL(url); };
  } catch { plain(); }
  return () => stop();
}
