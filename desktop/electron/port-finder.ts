import net from "net";

export function isPortVacant(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ port, host }, () => {
      server.close(() => resolve(true));
    });
  });
}

export async function findVacantPort(
  preferredPorts: number[] = [3000, 5000, 8000]
): Promise<number> {
  // 1. Check preferred candidates (3000, 5000, 8000)
  for (const port of preferredPorts) {
    if (await isPortVacant(port)) {
      return port;
    }
  }

  // 2. Check nearby fallback ranges
  const fallbackRanges = [
    [3001, 3010],
    [5001, 5010],
    [8001, 8010],
  ];

  for (const [start, end] of fallbackRanges) {
    for (let p = start; p <= end; p++) {
      if (await isPortVacant(p)) {
        return p;
      }
    }
  }

  // 3. Fallback to OS-assigned port
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address() as net.AddressInfo;
      const port = addr.port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}
