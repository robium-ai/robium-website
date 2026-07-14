import { useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type { Status } from '../../lib/demoClient';
import { start as apiStart, status as apiStatus } from '../../lib/demoClient';
import { createInstance, deleteInstance, deleteInstanceBeacon } from '../../lib/orchestrator';
import Controls from './Controls';
import WorkTabs, { type Tab } from './WorkTabs';
import FileTree from './FileTree';
import './demo.css';

// 'orchestrator' = Start asks the orchestrator to spawn a container (real
// lifecycle). 'direct:<host>' = talk to a hand-started container directly
// (dev bypass for gateway-only work). ?host= forces direct mode.
type Mode = 'orchestrator' | string; // string = a direct host like 'localhost:8765'

export default function Workspace({ host: hostProp }: { host: string }) {
  const [mode, setModeState] = useState<Mode>(() => {
    if (typeof window === 'undefined') return 'orchestrator';
    const q = new URLSearchParams(window.location.search).get('host');
    if (q) return q; // ?host= → direct
    return localStorage.getItem('demoMode') || 'orchestrator';
  });
  const [host, setHost] = useState<string>(hostProp); // the sim's address, once known
  const [session, setSession] = useState<string | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [file, setFile] = useState<{ path: string; content: string } | null>(null);
  const [tab, setTab] = useState<Tab>('about');
  const timer = useRef<number | null>(null);
  const sessionRef = useRef<string | null>(null);
  const instanceRef = useRef<string | null>(null); // orchestrator instance id (null in direct mode)
  const hostRef = useRef<string>(host); // the sim's address the poll loop must query (avoids stale closure)

  function stopPolling() {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  }

  async function poll() {
    const s = sessionRef.current;
    const h = hostRef.current;
    if (!s) return;
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
    setTab('logs');
    let simHost = host;
    if (mode === 'orchestrator') {
      try {
        const inst = await createInstance('nav-trial', s); // spawns the container
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
    hostRef.current = simHost; // poll loop + children read the live host
    setHost(simHost);
    apiStart(simHost, s).catch(() => {}); // claim the sim's gateway
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
    setFile(null);
    setTab('about');
    // Orchestrator owns teardown: deleting the instance removes the container
    // (real stop, local + cloud). Direct mode leaves the hand-started
    // container alone (you manage it via docker).
    if (id) await deleteInstance(id);
  }

  function changeMode(m: Mode) {
    if (m === mode) return;
    stop();
    localStorage.setItem('demoMode', m);
    setModeState(m);
  }

  useEffect(() => {
    // Tab close → tear the instance down (orchestrator mode only; direct mode
    // leaves your managed container running).
    const onHide = () => { if (instanceRef.current) deleteInstanceBeacon(instanceRef.current); };
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); stopPolling(); };
  }, []);

  return (
    <div className="ws-root">
      <div className="ws-topbar">
        <span className="brand">robium</span>
        <span className="sep">·</span>
        <span>nav-trial live demo</span>
        {import.meta.env.DEV && (
          <label className="host-switch" title="Dev only — pick the backend">
            backend:
            <select value={mode} onChange={(e) => changeMode(e.target.value)}>
              <option value="orchestrator">orchestrator (spawns)</option>
              <option value="localhost:8765">direct localhost:8765</option>
            </select>
          </label>
        )}
        <a className="home" href="/">← Robium.ai</a>
      </div>
      <Group orientation="horizontal" className="ws-panels">
        <Panel defaultSize={20} minSize={14}>
          <Controls host={host} session={session} st={st} onStart={start} onStop={stop} />
        </Panel>
        <Separator className="ws-resize" />
        <Panel defaultSize={56} minSize={30}>
          <WorkTabs host={host} session={session} st={st} file={file} activeTab={tab} setActiveTab={setTab} />
        </Panel>
        <Separator className="ws-resize" />
        <Panel defaultSize={24} minSize={14}>
          <FileTree host={host} session={session} ready={!!st?.claimed} onOpen={(path, content) => { setFile({ path, content }); setTab('editor'); }} />
        </Panel>
      </Group>
    </div>
  );
}
