import { useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type { Status } from '../../lib/demoClient';
import { start as apiStart, status as apiStatus, uiUrl } from '../../lib/demoClient';
import { createInstance, deleteInstance, deleteInstanceBeacon } from '../../lib/orchestrator';
import './demo.css';

// vla-trial's minimal workspace (v1): Controls + one Robot pane (the
// in-container Gradio app with the embedded Rerun viewer). Terminal/Editor/
// Files return in a later cut. Lifecycle machinery mirrors Workspace.tsx —
// including the hostRef pattern (the poll loop must read the live host, not a
// stale closure).
//
// v1 is LOCAL-ONLY: the orchestrator runs on localhost (`npm run dev`) and
// spawns the vla-trial container on the visitor's own Docker. On the deployed
// site the page shows an honest "run it locally" notice instead of Start.
type Mode = 'orchestrator' | string; // string = a direct host like 'localhost:8765'

const isLocalPage = () =>
  typeof window !== 'undefined' && /^(localhost|127\.)/.test(window.location.hostname);

export default function VlaWorkspace() {
  const [mode, setModeState] = useState<Mode>(() => {
    if (typeof window === 'undefined') return 'orchestrator';
    const q = new URLSearchParams(window.location.search).get('host');
    if (q) return q; // ?host= → direct (e.g. a native `make demo` gateway on MPS)
    return localStorage.getItem('vlaDemoMode') || 'orchestrator';
  });
  const [host, setHost] = useState<string>('');
  const [session, setSession] = useState<string | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const timer = useRef<number | null>(null);
  const sessionRef = useRef<string | null>(null);
  const instanceRef = useRef<string | null>(null);
  const hostRef = useRef<string>('');

  // Cloud hosting for this demo doesn't exist yet — only say so when the page
  // isn't running locally and no direct host was forced.
  const cloudUnsupported = !isLocalPage() && mode === 'orchestrator';

  function stopPolling() {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  }

  async function poll() {
    const s = sessionRef.current;
    const h = hostRef.current;
    if (!s || !h) return;
    const status = await apiStatus(h, s).catch(() => null);
    if (!status) return; // 409 or error — keep polling
    if (!status.claimed) { apiStart(h, s).catch(() => {}); return; } // (re)claim
    setSt(status);
  }

  async function start() {
    const s = crypto.randomUUID();
    sessionRef.current = s;
    setSession(s);
    setSt(null);
    let simHost = '';
    if (mode === 'orchestrator') {
      try {
        const inst = await createInstance('vla-trial', s); // spawns the container
        instanceRef.current = inst.id;
        simHost = inst.host;
      } catch (e) {
        sessionRef.current = null;
        setSession(null);
        alert((e as Error).message);
        return;
      }
    } else {
      simHost = mode; // direct host
    }
    hostRef.current = simHost;
    setHost(simHost);
    apiStart(simHost, s).catch(() => {}); // claim the gateway
    stopPolling();
    timer.current = window.setInterval(poll, 2000);
    poll();
  }

  async function stop() {
    stopPolling();
    const id = instanceRef.current;
    instanceRef.current = null;
    sessionRef.current = null;
    setSession(null);
    setSt(null);
    // Orchestrator owns teardown; direct mode leaves your hand-started
    // process alone (you manage it in the terminal that ran `make demo`).
    if (id) await deleteInstance(id);
  }

  function changeMode(m: Mode) {
    if (m === mode) return;
    stop();
    localStorage.setItem('vlaDemoMode', m);
    setModeState(m);
  }

  useEffect(() => {
    const onHide = () => { if (instanceRef.current) deleteInstanceBeacon(instanceRef.current); };
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); stopPolling(); };
  }, []);

  const running = !!session;
  const ready = !!st?.ready;
  const pill = !running ? 'idle' : ready ? 'ready' : (st?.claimed ? 'booting…' : 'starting…');
  const mm = st ? String(Math.floor(st.remaining_s / 60)).padStart(2, '0') : '30';
  const ss = st ? String(st.remaining_s % 60).padStart(2, '0') : '00';

  return (
    <div className="ws-root">
      <div className="ws-topbar">
        <span className="brand">robium</span>
        <span className="sep">·</span>
        <span>vla-trial live demo</span>
        {import.meta.env.DEV && (
          <label className="host-switch" title="Dev only — pick the backend">
            backend:
            <select value={mode} onChange={(e) => changeMode(e.target.value)}>
              <option value="orchestrator">orchestrator (spawns container, CPU)</option>
              <option value="localhost:8765">direct localhost:8765 (make demo, MPS)</option>
            </select>
          </label>
        )}
        <a className="home" href="/">← Robium.ai</a>
      </div>
      <Group orientation="horizontal" className="ws-panels">
        <Panel defaultSize={22} minSize={16}>
          <div className="ws-pane">
            <div className="pane-head">Controls</div>
            <div className="controls">
              <span className="pill">{pill}</span>
              {cloudUnsupported ? (
                <>
                  <button className="btn primary" disabled>Start instance</button>
                  <span className="metric">
                    The hosted version of this demo isn't up yet. Run it locally:
                    clone robium-applications, `make demo-image` in apps/vla-trial,
                    then `npm run dev` in robium-website and open this page on
                    localhost.
                  </span>
                </>
              ) : !running ? (
                <button className="btn primary" onClick={start}>Start instance</button>
              ) : (
                <button className="btn" onClick={stop}>Stop instance</button>
              )}
              {running && (
                <>
                  <span className="metric">uptime {st?.uptime_s ?? 0}s</span>
                  <span className="metric">session ends in {mm}:{ss}</span>
                </>
              )}
              <span className="metric">budget: {st?.fleet?.budget ?? 1} concurrent</span>
              {!cloudUnsupported && (
                <span className="metric">
                  controllers: a scripted oracle that completes the pick, and the
                  SmolVLA fine-tune-in-progress (currently flails — the page is
                  honest about it).
                </span>
              )}
            </div>
          </div>
        </Panel>
        <Separator className="ws-resize" />
        <Panel defaultSize={78} minSize={40}>
          <div className="ws-pane">
            <div className="pane-head">Robot</div>
            {ready && host ? (
              <iframe
                className="robot-frame"
                src={uiUrl(host)}
                title="vla-trial robot UI (Gradio + Rerun)"
              />
            ) : running ? (
              <div className="tab-hint">
                <p>Booting — loading the SmolVLA checkpoint and the MuJoCo scene…</p>
                <pre className="bootlog">{(st?.log ?? []).slice(-12).join('\n')}</pre>
              </div>
            ) : (
              <div className="tab-hint">
                {cloudUnsupported
                  ? 'This demo currently runs on your own machine — see the Controls pane.'
                  : 'Start an instance: the arm, its cameras, and the Rerun timeline appear here.'}
              </div>
            )}
          </div>
        </Panel>
      </Group>
    </div>
  );
}
