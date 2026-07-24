export interface TimerMark {
  label: string;
  durationMs: number;
  timestamp: number;
}

export interface RequestTimer {
  name: string;
  startTime: number;
  marks: TimerMark[];
  mark: (label: string) => number;
  end: () => { name: string; totalMs: number; marks: TimerMark[] };
}

export function startTimer(name: string): RequestTimer {
  const startTime = performance.now();
  let lastMarkTime = startTime;
  const marks: TimerMark[] = [];

  return {
    name,
    startTime,
    marks,
    mark(label: string): number {
      const now = performance.now();
      const durationMs = Math.round(now - lastMarkTime);
      lastMarkTime = now;
      marks.push({ label, durationMs, timestamp: now });
      return durationMs;
    },
    end() {
      const totalMs = Math.round(performance.now() - startTime);
      console.log(`\n========================================`);
      console.log(`${name}`);
      console.log(`Request Started`);

      for (const m of marks) {
        const dots = ".".repeat(Math.max(2, 25 - m.label.length));
        console.log(`${m.label} ${dots} ${m.durationMs}ms`);
      }

      console.log(`Total Server Time ....... ${totalMs}ms`);
      console.log(`========================================\n`);

      return { name, totalMs, marks };
    },
  };
}

export async function profileAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  console.log(`[AsyncStart] ${name}`);
  try {
    const result = await fn();
    const duration = performance.now() - start;
    console.log(`[AsyncEnd] ${name} Duration: ${duration.toFixed(2)}ms`);
    return result;
  } catch (err) {
    const duration = performance.now() - start;
    console.log(`[AsyncError] ${name} Duration: ${duration.toFixed(2)}ms`);
    throw err;
  }
}
