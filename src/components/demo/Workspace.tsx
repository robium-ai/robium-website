import { useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import type { Status } from '../../lib/demoClient';
import { start as apiStart, status as apiStatus, shutdown as apiShutdown } from '../../lib/demoClient';
import { wsShutdownUrl } from '../../lib/demoClient';
import Controls from './Controls';
import WorkTabs, { type Tab } from './WorkTabs';
import FileTree from './FileTree';
import './demo.css';

export default function Workspace({ host: hostProp }: { host: string }) {
  // Backend selection order: ?host= query param > persisted dev choice > prop.
  // In dev, a top-bar switcher lets you flip prod ↔ local without editing the
  // URL; it's hidden on the deployed site so visitors never see it.
  const [host, setHostState] = useState(() => {
    if (typeof window === 'undefined') return hostProp;
    const q = new URLSearchParams(window.location.search).get('host');
    return q || localStorage.getItem('demoHost') || hostProp;
  });
  const [session, setSession] = useState<string | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [file, setFile] = useState<{ path: string; content: string } | null>(null);
  const [tab, setTab] = useState<Tab>('about');
  const timer = useRef<number | null>(null);
  const sessionRef = useRef<string | null>(null);

  function stopPolling() {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
  }

  async function poll() {
    const s = sessionRef.current;
    if (!s) return;
    const st = await apiStatus(host, s).catch(() => null);
    if (!st) return; // 409 or error — keep polling
    if (!st.claimed) { apiStart(host, s).catch(() => {}); return; } // watchdog restarted → re-claim
    setSt(st);
  }

  function start() {
    const s = crypto.randomUUID();
    sessionRef.current = s;
    setSession(s);
    setSt(null);
    setTab('logs');
    apiStart(host, s).catch(() => {});
    stopPolling();
    timer.current = window.setInterval(poll, 2000);
    poll();
  }

  async function stop() {
    stopPolling();
    const s = sessionRef.current;
    if (s) await apiShutdown(host, s).catch(() => {});
    sessionRef.current = null;
    setSession(null);
    setSt(null);
    setFile(null);
    setTab('about');
  }

  function changeHost(h: string) {
    if (h === host) return;
    stop();                              // never leak a session across backends
    localStorage.setItem('demoHost', h);
    setHostState(h);
  }

  useEffect(() => {
    const onHide = () => { if (sessionRef.current) navigator.sendBeacon(wsShutdownUrl(host, sessionRef.current)); };
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); stopPolling(); };
  }, [host]);

  return (
    <div className="ws-root">
      <div className="ws-topbar">
        <span className="brand">robium</span>
        <span className="sep">·</span>
        <span>nav-trial live demo</span>
        {import.meta.env.DEV && (
          <label className="host-switch" title="Dev only — pick the backend">
            backend:
            <select value={host} onChange={(e) => changeHost(e.target.value)}>
              <option value={hostProp}>{hostProp} (cloud)</option>
              <option value="localhost:8765">localhost:8765 (local)</option>
            </select>
          </label>
        )}
        <a className="home" href="/">← robium.org</a>
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
          <FileTree host={host} session={session} onOpen={(path, content) => { setFile({ path, content }); setTab('editor'); }} />
        </Panel>
      </Group>
    </div>
  );
}
