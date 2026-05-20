import net from "node:net";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";

export type ParentToChild =
  | { type: "followup"; id: string; message: string }
  | { type: "message"; id: string; fromAgentPath: string; message: string }
  | { type: "interrupt"; id: string }
  | { type: "shutdown"; id: string };

export type ChildToParent =
  | { type: "hello"; agentId: string; agentPath: string; pid: number; cwd: string; capabilities: string[] }
  | { type: "status"; agentId: string; status: "pending_init" | "running" | "completed" | "errored" | "shutdown" }
  | { type: "final"; agentId: string; status: "completed" | "errored" | "shutdown"; message: string }
  | { type: "log"; agentId: string; line: string }
  | { type: "ack"; id: string }
  | { type: "error"; id?: string; agentId?: string; message: string };

type Listener<T> = (message: T) => void;

function unsupportedOnWindows(): void {
  if (process.platform === "win32") throw new Error("Subagent IPC over Unix domain sockets is not supported on Windows.");
}
function writeJson(sock: net.Socket, msg: unknown): Promise<void> {
  return new Promise((resolve, reject) => sock.write(`${JSON.stringify(msg)}\n`, (err) => err ? reject(err) : resolve()));
}
function attachParser<T>(sock: net.Socket, emit: (m: T) => void, onParseError: (message: string) => void): void {
  let buf = "";
  sock.setEncoding("utf8");
  sock.on("data", (chunk) => {
    buf += chunk;
    for (;;) {
      const idx = buf.indexOf("\n");
      if (idx < 0) break;
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try { emit(JSON.parse(line) as T); } catch (err) { onParseError(err instanceof Error ? err.message : String(err)); }
    }
  });
}

export class SubagentHub {
  private server?: net.Server;
  private clients = new Map<string, net.Socket>();
  private listeners = new Set<Listener<ChildToParent>>();
  constructor(public readonly socketPath: string) {}
  async start(): Promise<void> {
    unsupportedOnWindows();
    await mkdir(path.dirname(this.socketPath), { recursive: true });
    await unlink(this.socketPath).catch((e: any) => { if (e?.code !== "ENOENT") throw e; });
    this.server = net.createServer((sock) => {
      let agentId: string | undefined;
      attachParser<ChildToParent>(sock, (msg) => {
        if (msg.type === "hello") { agentId = msg.agentId; this.clients.set(agentId, sock); }
        this.emit(msg);
      }, (message) => this.emit({ type: "error", agentId, message: `IPC parse error: ${message}` }));
      sock.on("close", () => { if (agentId) this.clients.delete(agentId); });
      sock.on("error", (err) => this.emit({ type: "error", agentId, message: err.message }));
    });
    await new Promise<void>((resolve, reject) => this.server!.once("error", reject).listen(this.socketPath, () => { this.server!.off("error", reject); resolve(); }));
  }
  async stop(): Promise<void> {
    for (const c of this.clients.values()) c.destroy();
    this.clients.clear();
    if (this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = undefined;
    await unlink(this.socketPath).catch(() => undefined);
  }
  waitForHello(agentId: string, timeoutMs: number): Promise<Extract<ChildToParent,{type:"hello"}>> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { off(); reject(new Error(`hello timeout for ${agentId}`)); }, timeoutMs);
      const off = this.onMessage((m) => { if (m.type === "hello" && m.agentId === agentId) { clearTimeout(t); off(); resolve(m); } });
    });
  }
  async send(agentId: string, message: ParentToChild): Promise<void> {
    const sock = this.clients.get(agentId); if (!sock) throw new Error(`No IPC client connected for ${agentId}`);
    await writeJson(sock, message);
  }
  onMessage(listener: Listener<ChildToParent>): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  hasClient(agentId: string): boolean { return this.clients.has(agentId); }
  private emit(m: ChildToParent): void { for (const l of this.listeners) l(m); }
}

export class SubagentClient {
  private socket?: net.Socket;
  private listeners = new Set<Listener<ParentToChild>>();
  constructor(private readonly socketPath: string, private readonly agentId: string, private readonly agentPath: string) {}
  async connect(): Promise<void> {
    unsupportedOnWindows();
    this.socket = net.createConnection(this.socketPath);
    attachParser<ParentToChild>(this.socket, (msg) => {
      if ("id" in msg) void this.send({ type: "ack", id: msg.id });
      for (const l of this.listeners) l(msg);
    }, (message) => void this.send({ type: "error", agentId: this.agentId, message: `IPC parse error: ${message}` }));
    await new Promise<void>((resolve, reject) => this.socket!.once("error", reject).once("connect", () => { this.socket!.off("error", reject); resolve(); }));
  }
  async send(message: ChildToParent): Promise<void> { if (!this.socket) throw new Error("IPC client is not connected"); await writeJson(this.socket, message); }
  onMessage(listener: Listener<ParentToChild>): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async close(): Promise<void> { this.socket?.end(); this.socket?.destroy(); this.socket = undefined; }
}
