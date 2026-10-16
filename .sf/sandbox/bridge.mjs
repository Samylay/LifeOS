// Byte pipe between a Unix socket and a loopback TCP port. The sandbox server lives in
// its own network namespace; the socket file is the only way in.
//   node bridge.mjs inner <socketPath> <serverPort>   (inside the namespace)
//   node bridge.mjs outer <socketPath> <listenPort>   (on the host, 127.0.0.1 only)
import net from "node:net";
import fs from "node:fs";

const [mode, socketPath, port] = process.argv.slice(2);
if (!["inner", "outer"].includes(mode) || !socketPath || !port) {
  console.error("usage: node bridge.mjs inner|outer <socketPath> <port>");
  process.exit(2);
}

function pipe(a, b) {
  a.pipe(b).on("error", () => a.destroy());
  b.pipe(a).on("error", () => b.destroy());
  a.on("error", () => b.destroy());
  b.on("error", () => a.destroy());
}

if (mode === "inner") {
  fs.rmSync(socketPath, { force: true });
  net.createServer((client) => pipe(client, net.connect({ host: "127.0.0.1", port: Number(port) })))
    .listen(socketPath, () => console.log(`bridge inner ${socketPath} -> 127.0.0.1:${port}`));
} else {
  net.createServer((client) => pipe(client, net.connect({ path: socketPath })))
    .listen(Number(port), "127.0.0.1", () => console.log(`bridge outer 127.0.0.1:${port} -> ${socketPath}`));
}
