/**
 * @privapilot/scripts - Minimal Chrome DevTools Protocol client
 *
 * CDP is a WebSocket carrying JSON-RPC. Node 22 ships a global WebSocket, so this
 * needs no dependency at all - which matters for a repo with three devDependencies.
 * Adding puppeteer to run fourteen fixtures would be a poor trade.
 *
 * Supports flat sessions (Target.attachToTarget with flatten:true) so page and
 * service-worker targets can be driven over the single browser-level socket.
 */

import { fetchJson } from './chrome-launcher.mjs';

export class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closed = false;

    this.ws.addEventListener('message', (event) => this._onMessage(event));
    this.ws.addEventListener('close', () => {
      this.closed = true;
      for (const { reject } of this.pending.values()) {
        reject(new Error('CDP connection closed'));
      }
      this.pending.clear();
    });
  }

  static async connect(port = 9222, timeoutMs = 10000) {
    const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
    const url = version.webSocketDebuggerUrl;
    if (!url) throw new Error('No webSocketDebuggerUrl reported by Chrome');

    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`CDP WebSocket timeout after ${timeoutMs}ms`)), timeoutMs);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP WebSocket error')); }, { once: true });
    });

    return new CdpClient(ws);
  }

  _onMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.id !== undefined) {
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.error) {
        entry.reject(new Error(`${entry.method}: ${msg.error.message || JSON.stringify(msg.error)}`));
      } else {
        entry.resolve(msg.result);
      }
      return;
    }

    if (msg.method) {
      const handlers = this.listeners.get(msg.method);
      if (handlers) {
        for (const h of handlers) {
          try { h(msg.params, msg.sessionId); } catch (_) {}
        }
      }
    }
  }

  /** Issues a CDP command. Pass sessionId to target an attached page/worker. */
  send(method, params = {}, sessionId = undefined, timeoutMs = 30000) {
    if (this.closed) return Promise.reject(new Error('CDP connection closed'));

    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method} after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, {
        method,
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      });

      this.ws.send(JSON.stringify(payload));
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(handler);
    return () => this.listeners.get(method)?.delete(handler);
  }

  /** Waits for a single occurrence of a CDP event. */
  once(method, { timeoutMs = 30000, filter = () => true } = {}) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out waiting for CDP event ${method}`));
      }, timeoutMs);
      const off = this.on(method, (params, sessionId) => {
        if (!filter(params, sessionId)) return;
        clearTimeout(timer);
        off();
        resolve(params);
      });
    });
  }

  async listTargets() {
    const { targetInfos } = await this.send('Target.getTargets');
    return targetInfos;
  }

  /** Attaches to a target and returns its flat sessionId. */
  async attach(targetId) {
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true });
    return sessionId;
  }

  /** Opens a new page target and attaches to it. */
  async newPage(url = 'about:blank') {
    const { targetId } = await this.send('Target.createTarget', { url });
    const sessionId = await this.attach(targetId);
    return { targetId, sessionId };
  }

  close() {
    try { this.ws.close(); } catch (_) {}
    this.closed = true;
  }
}

/**
 * Convenience wrapper around one attached page session.
 */
export class CdpPage {
  constructor(client, sessionId, targetId) {
    this.client = client;
    this.sessionId = sessionId;
    this.targetId = targetId;
  }

  send(method, params, timeoutMs) {
    return this.client.send(method, params, this.sessionId, timeoutMs);
  }

  async enableDomains() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Performance.enable');
  }

  async setViewport(width = 1280, height = 800) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false
    });
  }

  /** Navigates and waits for the load event. */
  async goto(url, { timeoutMs = 20000 } = {}) {
    const loaded = this.client.once('Page.loadEventFired', {
      timeoutMs,
      filter: (_p, sid) => sid === this.sessionId
    });
    await this.send('Page.navigate', { url });
    await loaded;
  }

  /**
   * Evaluates an expression in the page and returns its value by value.
   * Rejects on thrown exceptions rather than silently yielding undefined.
   */
  async evaluate(expression, { awaitPromise = true, timeoutMs = 60000 } = {}) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true
    }, timeoutMs);

    if (result.exceptionDetails) {
      const d = result.exceptionDetails;
      throw new Error(`Page evaluation failed: ${d.exception?.description || d.text}`);
    }
    return result.result?.value;
  }

  async captureScreenshot({ format = 'png' } = {}) {
    const { data } = await this.send('Page.captureScreenshot', { format, fromSurface: true });
    return `data:image/${format};base64,${data}`;
  }

  async metrics() {
    const { metrics } = await this.send('Performance.getMetrics');
    return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  }

  async close() {
    try { await this.client.send('Target.closeTarget', { targetId: this.targetId }); } catch (_) {}
  }
}
