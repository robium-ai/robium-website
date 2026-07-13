export interface Demo {
  id: string;
  title: string;
  image: string;
  command: string[];
  gatewayPort: number; // port the gateway listens on inside the container
  readyLog: string; // substring in container logs meaning "booted"
  maxInstances: number;
  sessionSeconds: number;
  env?: Record<string, string>;
}

export interface Instance {
  id: string; // orchestrator instance id (== short container id)
  demo: string; // Demo.id
  session: string; // visitor UUID
  host: string; // where the browser reaches this sim's gateway, e.g. "localhost:32770"
  hostPort: number;
  createdAt: number; // epoch ms
}

export interface CreateInstanceReq {
  demo: string;
  session: string;
}

export interface CreateInstanceRes {
  id: string;
  host: string;
  session: string;
}
