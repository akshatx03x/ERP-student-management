import { chromium, Page } from "playwright";
import fs from "fs";
import path from "path";

export interface RouteMetrics {
  route: string;
  dnsMs: number;
  tcpMs: number;
  tlsMs: number;
  ttfbMs: number;
  downloadMs: number;
  fcpMs: number;
  lcpMs: number;
  cls: number;
  domContentLoadedMs: number;
  loadEventMs: number;
  hydrationMs: number;
  jsExecutionMs: number;
  totalBrowserMs: number;
  totalRequests: number;
  largestRequestBytes: number;
  slowestRequestMs: number;
  longTasksCount: number;
  longTasksTotalDurationMs: number;
  unusedJsBytes: number;
  unusedCssBytes: number;
  renderBlockingResourcesCount: number;
}

const TARGET_ROUTES = [
  "/dashboard",
  "/students",
  "/classes",
  "/fees",
  "/examinations",
  "/settings",
];

async function profileRoute(
  baseUrl: string,
  route: string,
  outputDir: string
): Promise<RouteMetrics> {
  console.log(`\n--- Profiling Route: ${route} ---`);
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const harPath = path.join(outputDir, `${route.replace(/\//g, "_") || "root"}.har`);
  const context = await browser.newContext({
    recordHar: { path: harPath },
  });

  // Enable CDP tracing for trace.json
  const cdpSession = await context.newCDPSession(context.pages()[0] || (await context.newPage()));

  await cdpSession.send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: {
      includedCategories: [
        "v8",
        "blink.user_timing",
        "devtools.timeline",
        "disabled-by-default-devtools.timeline",
      ],
    },
  });

  const page = await context.newPage();
  
  // Track JS & CSS Coverage via CDP safely
  const sendCdp = cdpSession.send.bind(cdpSession) as any;
  try {
    await sendCdp("DOM.enable");
    await sendCdp("CSS.enable");
    await sendCdp("Page.enable");
    await sendCdp("Profiler.enable");
    await sendCdp("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
  } catch {}

  const requests: { url: string; size: number; duration: number; status: number }[] = [];

  page.on("response", async (response) => {
    const request = response.request();
    const timing = request.timing();
    const duration = timing.responseEnd > 0 ? timing.responseEnd : 0;
    let size = 0;
    try {
      const buffer = await response.body();
      size = buffer.length;
    } catch {}
    requests.push({
      url: response.url(),
      size,
      duration,
      status: response.status(),
    });
  });

  const targetUrl = `${baseUrl}${route}`;
  const response = await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 45000 });

  if (!response || !response.ok()) {
    console.warn(`Warning: Navigation to ${targetUrl} returned status ${response?.status()}`);
  }

  // Collect performance metrics from page browser context
  const perfMetrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((p) => p.name === "first-contentful-paint")?.startTime || 0;

    let lcp = 0;
    const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
    if (lcpEntries.length > 0) {
      lcp = lcpEntries[lcpEntries.length - 1].startTime;
    }

    let cls = 0;
    const clsEntries = performance.getEntriesByType("layout-shift") as any[];
    for (const entry of clsEntries) {
      if (!entry.hadRecentInput) {
        cls += entry.value;
      }
    }

    const longTasks = performance.getEntriesByType("longtask");
    const longTasksCount = longTasks.length;
    const longTasksTotalDurationMs = longTasks.reduce((acc, t) => acc + t.duration, 0);

    // Next.js hydration marks if present
    const marks = performance.getEntriesByType("mark");
    const hydrateMark = marks.find((m) => m.name.includes("beforeHydrate") || m.name.includes("hydrate"));
    const hydrationEndMark = marks.find((m) => m.name.includes("mark_hydration_end") || m.name.includes("hydrated"));
    const hydrationMs =
      hydrateMark && hydrationEndMark
        ? hydrationEndMark.startTime - hydrateMark.startTime
        : Math.max(0, nav.domContentLoadedEventEnd - nav.responseEnd);

    const dnsMs = Math.max(0, Math.round(nav.domainLookupEnd - nav.domainLookupStart));
    const tcpMs = Math.max(0, Math.round(nav.connectEnd - nav.connectStart));
    const tlsMs = nav.secureConnectionStart > 0 ? Math.max(0, Math.round(nav.connectEnd - nav.secureConnectionStart)) : 0;
    const ttfbMs = Math.max(0, Math.round(nav.responseStart - nav.requestStart));
    const downloadMs = Math.max(0, Math.round(nav.responseEnd - nav.responseStart));
    const domContentLoadedMs = Math.max(0, Math.round(nav.domContentLoadedEventEnd - nav.fetchStart));
    const loadEventMs = Math.max(0, Math.round(nav.loadEventEnd - nav.fetchStart));
    const totalBrowserMs = Math.max(0, Math.round(nav.loadEventEnd - nav.startTime));
    const jsExecutionMs = Math.max(0, Math.round(nav.domInteractive - nav.responseEnd));

    return {
      dnsMs,
      tcpMs,
      tlsMs,
      ttfbMs,
      downloadMs,
      fcpMs: Math.round(fcp),
      lcpMs: Math.round(lcp || fcp),
      cls: Number(cls.toFixed(4)),
      domContentLoadedMs,
      loadEventMs,
      hydrationMs: Math.round(hydrationMs),
      jsExecutionMs,
      totalBrowserMs,
      longTasksCount,
      longTasksTotalDurationMs: Math.round(longTasksTotalDurationMs),
    };
  });

  // Stop JS & CSS coverage safely
  let unusedJsBytes = 0;
  let unusedCssBytes = 0;
  try {
    const jsCoverage = await sendCdp("Profiler.takePreciseCoverage");
    await sendCdp("Profiler.stopPreciseCoverage");
    for (const script of jsCoverage.result) {
      for (const func of script.functions) {
        for (const range of func.ranges) {
          if (range.count === 0) {
            unusedJsBytes += range.endOffset - range.startOffset;
          }
        }
      }
    }
  } catch {}

  // Stop CDP tracing & write trace.json
  const events: any[] = [];
  cdpSession.on("Tracing.dataCollected", (event) => {
    events.push(...event.value);
  });

  await new Promise<void>((resolve) => {
    cdpSession.once("Tracing.tracingComplete", () => resolve());
    cdpSession.send("Tracing.end");
  });

  const tracePath = path.join(outputDir, `trace_${route.replace(/\//g, "_") || "root"}.json`);
  fs.writeFileSync(tracePath, JSON.stringify({ traceEvents: events }, null, 2));

  await browser.close();

  const largestRequestBytes = requests.reduce((max, r) => Math.max(max, r.size), 0);
  const slowestRequestMs = requests.reduce((max, r) => Math.max(max, r.duration), 0);
  const renderBlockingResourcesCount = requests.filter(
    (r) => r.url.endsWith(".css") || (r.url.endsWith(".js") && !r.url.includes("async"))
  ).length;

  const result: RouteMetrics = {
    route,
    ...perfMetrics,
    totalRequests: requests.length,
    largestRequestBytes,
    slowestRequestMs: Math.round(slowestRequestMs),
    unusedJsBytes,
    unusedCssBytes,
    renderBlockingResourcesCount,
  };

  console.log(`Route ${route} Profile Completed:`);
  console.log(`  TTFB: ${result.ttfbMs}ms | FCP: ${result.fcpMs}ms | LCP: ${result.lcpMs}ms | Hydration: ${result.hydrationMs}ms | Total Browser: ${result.totalBrowserMs}ms`);

  return result;
}

export async function runBrowserAudit(baseUrl: string = "http://localhost:3000"): Promise<RouteMetrics[]> {
  console.log(`\n========================================`);
  console.log(`STARTING PLAYWRIGHT BROWSER AUDIT`);
  console.log(`Target Base URL: ${baseUrl}`);
  console.log(`========================================`);

  const outputDir = path.join(process.cwd(), "perf-artifacts");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const results: RouteMetrics[] = [];
  for (const route of TARGET_ROUTES) {
    try {
      const metric = await profileRoute(baseUrl, route, outputDir);
      results.push(metric);
    } catch (err) {
      console.error(`Failed to profile route ${route}:`, err);
    }
  }

  const summaryPath = path.join(outputDir, "browser-audit-summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  console.log(`Saved browser audit summary to ${summaryPath}`);

  return results;
}

if (require.main === module) {
  const urlArg = process.argv[2] || "http://localhost:3000";
  runBrowserAudit(urlArg).catch((err) => {
    console.error("Browser Audit failed:", err);
    process.exit(1);
  });
}
