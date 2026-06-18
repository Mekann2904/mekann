import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import net from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SubagentHub, SubagentClient } from "./ipc.js";

const isWindows = process.platform === "win32";

describe.skipIf(isWindows)("SubagentHub", () => {
  let tmpDir: string;
  let socketPath: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "ipc-test-"));
    socketPath = path.join(tmpDir, "test.sock");
  });

  afterAll(() => {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
  });

  it("starts and stops the server", async () => {
    const hub = new SubagentHub(socketPath);
    await hub.start();
    expect(hub.hasClient("a1")).toBe(false);
    await hub.stop();
  });

  it("accepts client connections and receives hello", async () => {
    const hub = new SubagentHub(socketPath + "1");
    await hub.start();

    const client = new SubagentClient(socketPath + "1", "agent-1", "/root/task1");
    await client.connect();

    // Wait for hello to be received
    const helloReceived = hub.waitForHello("agent-1", 2000);
    await client.send({ type: "hello", agentId: "agent-1", agentPath: "/root/task1", pid: process.pid, cwd: "/tmp", capabilities: ["status"] });
    const hello = await helloReceived;

    expect(hello.agentId).toBe("agent-1");
    expect(hello.capabilities).toContain("status");
    expect(hub.hasClient("agent-1")).toBe(true);

    await client.close();
    await hub.stop();
  });

  it("receives messages via onMessage listener", async () => {
    const hub = new SubagentHub(socketPath + "2");
    await hub.start();

    const messages: any[] = [];
    const off = hub.onMessage((msg) => messages.push(msg));

    const client = new SubagentClient(socketPath + "2", "agent-2", "/root/task2");
    await client.connect();

    await client.send({ type: "status", agentId: "agent-2", status: "running" });

    // Wait for message to arrive
    await new Promise((r) => setTimeout(r, 100));

    expect(messages.some((m) => m.type === "status" && m.agentId === "agent-2")).toBe(true);

    off();
    await client.close();
    await hub.stop();
  });

  it("sends message from hub to client", async () => {
    const hub = new SubagentHub(socketPath + "3");
    await hub.start();

    const client = new SubagentClient(socketPath + "3", "agent-3", "/root/task3");
    await client.connect();

    // Send hello first so hub registers the client
    const helloP = hub.waitForHello("agent-3", 2000);
    await client.send({ type: "hello", agentId: "agent-3", agentPath: "/root/task3", pid: process.pid, cwd: "/tmp", capabilities: [] });
    await helloP;

    const received: any[] = [];
    client.onMessage((msg) => received.push(msg));

    await hub.send("agent-3", { type: "followup", id: "1", message: "more work" });

    await new Promise((r) => setTimeout(r, 100));

    expect(received.some((m) => m.type === "followup" && m.message === "more work")).toBe(true);

    await client.close();
    await hub.stop();
  });

  it("throws when sending to unknown agent", async () => {
    const hub = new SubagentHub(socketPath + "4");
    await hub.start();

    await expect(hub.send("unknown", { type: "shutdown", id: "1" })).rejects.toThrow("No IPC client");

    await hub.stop();
  });

  it("handles client disconnection", async () => {
    const hub = new SubagentHub(socketPath + "5");
    await hub.start();

    const client = new SubagentClient(socketPath + "5", "agent-5", "/root/task5");
    await client.connect();
    await client.send({ type: "hello", agentId: "agent-5", agentPath: "/root/task5", pid: process.pid, cwd: "/tmp", capabilities: [] });

    await new Promise((r) => setTimeout(r, 50));
    expect(hub.hasClient("agent-5")).toBe(true);

    await client.close();
    await new Promise((r) => setTimeout(r, 100));

    expect(hub.hasClient("agent-5")).toBe(false);

    await hub.stop();
  });

  it("waitForHello times out", async () => {
    const hub = new SubagentHub(socketPath + "6");
    await hub.start();

    await expect(hub.waitForHello("no-agent", 100)).rejects.toThrow("hello timeout");

    await hub.stop();
  });

  it("onMessage unsubscribe works", async () => {
    const hub = new SubagentHub(socketPath + "7");
    await hub.start();

    const messages: any[] = [];
    const off = hub.onMessage((msg) => messages.push(msg));
    off();

    const client = new SubagentClient(socketPath + "7", "agent-7", "/root/task7");
    await client.connect();
    await client.send({ type: "status", agentId: "agent-7", status: "running" });

    await new Promise((r) => setTimeout(r, 100));
    expect(messages).toHaveLength(0);

    await client.close();
    await hub.stop();
  });
});

describe.skipIf(isWindows)("SubagentClient", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), "ipc-client-test-"));
  });

  afterAll(() => {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
  });

  it("throws when sending before connecting", async () => {
    const client = new SubagentClient(path.join(tmpDir, "x.sock"), "agent-x", "/root/x");
    await expect(client.send({ type: "status", agentId: "agent-x", status: "running" })).rejects.toThrow("not connected");
  });

  it("connects and sends messages", async () => {
    const sockPath = path.join(tmpDir, "client-test.sock");
    const hub = new SubagentHub(sockPath);
    await hub.start();

    const client = new SubagentClient(sockPath, "agent-c", "/root/c");
    await client.connect();

    const received: any[] = [];
    hub.onMessage((msg) => received.push(msg));

    await client.send({ type: "status", agentId: "agent-c", status: "running" });

    await new Promise((r) => setTimeout(r, 100));
    expect(received.some((m) => m.type === "status")).toBe(true);

    await client.close();
    await hub.stop();
  });

  it("close is safe to call multiple times", async () => {
    const sockPath = path.join(tmpDir, "multi-close.sock");
    const hub = new SubagentHub(sockPath);
    await hub.start();

    const client = new SubagentClient(sockPath, "agent-mc", "/root/mc");
    await client.connect();
    await client.close();
    await client.close(); // should not throw

    await hub.stop();
  });

  it("sends ack for messages with id", async () => {
    const sockPath = path.join(tmpDir, "ack-test.sock");
    const hub = new SubagentHub(sockPath);
    await hub.start();

    const client = new SubagentClient(sockPath, "agent-ack", "/root/ack");
    await client.connect();

    // Send hello first
    const helloP = hub.waitForHello("agent-ack", 2000);
    await client.send({ type: "hello", agentId: "agent-ack", agentPath: "/root/ack", pid: process.pid, cwd: "/tmp", capabilities: [] });
    await helloP;

    // Hub sends a message with id → client should auto-ack
    const acks: any[] = [];
    hub.onMessage((msg) => { if (msg.type === "ack") acks.push(msg); });

    await hub.send("agent-ack", { type: "followup", id: "test-id", message: "test" });
    await new Promise((r) => setTimeout(r, 200));

    expect(acks.some((a) => a.id === "test-id")).toBe(true);

    await client.close();
    await hub.stop();
  });
});

describe.skipIf(isWindows)("IPC parser post-destroy behavior (issue #152 / IC-082)", () => {
  let tmpDir: string;
  beforeAll(() => { tmpDir = mkdtempSync(path.join(tmpdir(), "ipc-parse-")); });
  afterAll(() => { try { rmSync(tmpDir, { recursive: true }); } catch {} });

  it("emits a single parse error and ignores further data after destroy on an oversize line", async () => {
    const sockPath = path.join(tmpDir, "oversize.sock");
    const hub = new SubagentHub(sockPath);
    await hub.start();
    const errors: any[] = [];
    hub.onMessage((msg) => { if (msg.type === "error") errors.push(msg); });

    // Open a raw connection and push an oversize line (no trailing newline so it
    // stays in the buffer), then push more bytes afterwards.
    const sock = net.createConnection(sockPath);
    await new Promise<void>((resolve, reject) => sock.once("connect", resolve).once("error", reject));
    const huge = "x".repeat(2 * 1024 * 1024);
    sock.write(huge);
    sock.write(huge); // second write after the first triggered the destroy path
    await new Promise((r) => setTimeout(r, 150));

    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("exceeds");
    sock.destroy();
    await hub.stop();
  });
});

describe("Windows early check in constructors", () => {
  let originalPlatform: PropertyDescriptor;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    Object.defineProperty(process, 'platform', { value: 'win32' });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
  });

  it("SubagentHub constructor throws on win32", () => {
    expect(() => new SubagentHub("C:\\test.sock")).toThrow("not supported on Windows");
  });

  it("SubagentClient constructor throws on win32", () => {
    expect(() => new SubagentClient("C:\\test.sock", "a1", "/root")).toThrow("not supported on Windows");
  });

  it("error message is descriptive", () => {
    expect(() => new SubagentHub("C:\\test.sock")).toThrow(
      /Subagent IPC.*not supported on Windows/i
    );
  });
});

describe("Non-Windows constructors work (regression)", () => {
  it("SubagentHub constructor succeeds on non-Windows", () => {
    if (isWindows) return;
    expect(() => new SubagentHub("/tmp/test.sock")).not.toThrow();
  });

  it("SubagentClient constructor succeeds on non-Windows", () => {
    if (isWindows) return;
    expect(() => new SubagentClient("/tmp/test.sock", "a1", "/root")).not.toThrow();
  });
});

describe.skipIf(!isWindows)("SubagentHub on Windows", () => {
  it("throws on start()", async () => {
    const hub = new SubagentHub("C:\\test.sock");
    await expect(hub.start()).rejects.toThrow("not supported on Windows");
  });
});
