// Keeps the screen on during timed practices where the platform allows it.
type Sentinel = { release(): Promise<void> };

let sentinel: Sentinel | null = null;
let wanted = false;

async function acquire() {
  try {
    const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<Sentinel> } }).wakeLock;
    sentinel = wl ? await wl.request('screen') : null;
  } catch {
    sentinel = null;
  }
}

export function keepAwake() {
  wanted = true;
  void acquire();
}

export function releaseAwake() {
  wanted = false;
  const s = sentinel;
  sentinel = null;
  s?.release().catch(() => undefined);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (wanted && !document.hidden) void acquire();
  });
}
