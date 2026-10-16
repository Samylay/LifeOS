// Preloaded into the sandbox server with `node --require`. Records every attempt to
// leave the machine (TCP to a non-loopback host, DNS lookups, fetch to a non-loopback
// URL, child processes) to $SF_OUTBOUND_LOG as JSON lines. The sandbox runs in a
// network namespace with only loopback, so these attempts also fail at the kernel.
// The log is the observation that proves side effects were cut, not the cut itself.
"use strict";
const fs = require("node:fs");
const net = require("node:net");
const dns = require("node:dns");
const childProcess = require("node:child_process");

const logPath = process.env.SF_OUTBOUND_LOG;
if (!logPath) throw new Error("outbound-guard: SF_OUTBOUND_LOG is not set; refusing to start unobserved.");

function record(kind, target) {
  const caller = (new Error().stack || "").split("\n").slice(3, 6).map((l) => l.trim()).join(" | ");
  fs.appendFileSync(logPath, JSON.stringify({ t: new Date().toISOString(), kind, target, caller }) + "\n");
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost", "0.0.0.0", "::"]);
const isLoopback = (host) => !host || LOOPBACK.has(String(host).replace(/^\[|\]$/g, ""));

const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function connect(...args) {
  const first = args[0];
  const opts = Array.isArray(first) ? first[0] : first;
  if (opts && typeof opts === "object" && !opts.path && !isLoopback(opts.host)) {
    record("tcp", `${opts.host}:${opts.port}`);
  } else if (typeof first === "number" && !isLoopback(args[1])) {
    record("tcp", `${args[1]}:${first}`);
  }
  return originalConnect.apply(this, args);
};

for (const mod of [dns, dns.promises]) {
  const originalLookup = mod.lookup;
  mod.lookup = function lookup(host, ...rest) {
    if (!isLoopback(host)) record("dns", host);
    return originalLookup.call(this, host, ...rest);
  };
}

if (typeof globalThis.fetch === "function") {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function fetch(input, init) {
    let url = "";
    try { url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url; } catch {}
    try { if (url && !isLoopback(new URL(url).hostname)) record("fetch", url.split("?")[0]); } catch {}
    return originalFetch.call(this, input, init);
  };
}

for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) {
  const original = childProcess[name];
  childProcess[name] = function wrapped(command, ...rest) {
    record("process", String(command).slice(0, 120));
    return original.call(this, command, ...rest);
  };
}

record("guard-loaded", process.pid);
