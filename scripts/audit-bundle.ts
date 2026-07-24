import fs from "fs";
import path from "path";

export interface BundleReport {
  largestRoutes: { route: string; sizeKb: number }[];
  largestNpmPackages: { name: string; sizeKb: number }[];
  largestChunks: { chunkName: string; sizeKb: number }[];
  duplicatePackages: string[];
  unusedPackages: string[];
  clientComponentsCount: number;
  serverComponentsCount: number;
  suspenseWaterfallsCount: number;
  dynamicImportCandidates: string[];
}

export async function runBundleAudit(): Promise<BundleReport> {
  console.log("\n--- STARTING BUNDLE & REACT ARCHITECTURE AUDIT ---");
  const rootDir = process.cwd();

  // 1. Read package.json dependencies and get stats
  const pkgJsonPath = path.join(rootDir, "package.json");
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
  const deps = Object.keys(pkgJson.dependencies || {});
  const devDeps = Object.keys(pkgJson.devDependencies || {});
  const duplicatePackages = deps.filter((d) => devDeps.includes(d));

  const pkgSizes: { name: string; sizeKb: number }[] = [];
  const nodeModulesPath = path.join(rootDir, "node_modules");

  for (const dep of deps) {
    const depPath = path.join(nodeModulesPath, dep);
    if (fs.existsSync(depPath)) {
      try {
        let size = 0;
        const files = fs.readdirSync(depPath);
        for (const f of files) {
          const st = fs.statSync(path.join(depPath, f));
          if (st.isFile()) size += st.size;
        }
        pkgSizes.push({ name: dep, sizeKb: Number((size / 1024).toFixed(1)) });
      } catch {}
    }
  }

  pkgSizes.sort((a, b) => b.sizeKb - a.sizeKb);
  const largestNpmPackages = pkgSizes.slice(0, 15);

  // 2. Analyze .next build outputs if existing
  const nextBuildPath = path.join(rootDir, ".next");
  const chunks: { chunkName: string; sizeKb: number }[] = [];
  const routes: { route: string; sizeKb: number }[] = [];

  const staticChunksPath = path.join(nextBuildPath, "static", "chunks");
  if (fs.existsSync(staticChunksPath)) {
    const chunkFiles = fs.readdirSync(staticChunksPath);
    for (const file of chunkFiles) {
      if (file.endsWith(".js")) {
        const sz = fs.statSync(path.join(staticChunksPath, file)).size;
        chunks.push({ chunkName: file, sizeKb: Number((sz / 1024).toFixed(1)) });
      }
    }
  }
  chunks.sort((a, b) => b.sizeKb - a.sizeKb);
  const largestChunks = chunks.slice(0, 15);

  const appBuildManifestPath = path.join(nextBuildPath, "app-build-manifest.json");
  if (fs.existsSync(appBuildManifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(appBuildManifestPath, "utf-8"));
      const pages = manifest.pages || {};
      for (const [route, fileList] of Object.entries<string[]>(pages)) {
        let routeTotalBytes = 0;
        for (const file of fileList) {
          const fp = path.join(nextBuildPath, file);
          if (fs.existsSync(fp)) {
            routeTotalBytes += fs.statSync(fp).size;
          }
        }
        routes.push({ route, sizeKb: Number((routeTotalBytes / 1024).toFixed(1)) });
      }
    } catch {}
  }
  routes.sort((a, b) => b.sizeKb - a.sizeKb);

  // 3. React Component Audit (Scanning src/)
  const srcPath = path.join(rootDir, "src");
  let clientComponentsCount = 0;
  let serverComponentsCount = 0;
  let suspenseWaterfallsCount = 0;
  const dynamicImportCandidates: string[] = [];

  function scanSrcFiles(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanSrcFiles(fullPath);
      } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".jsx")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        if (content.includes('"use client"') || content.includes("'use client'")) {
          clientComponentsCount++;
          if (content.length > 5000) {
            dynamicImportCandidates.push(entry.name);
          }
        } else {
          serverComponentsCount++;
        }

        if (content.includes("<Suspense")) {
          suspenseWaterfallsCount++;
        }
      }
    }
  }

  scanSrcFiles(srcPath);

  const report: BundleReport = {
    largestRoutes: routes.slice(0, 10),
    largestNpmPackages,
    largestChunks,
    duplicatePackages,
    unusedPackages: [],
    clientComponentsCount,
    serverComponentsCount,
    suspenseWaterfallsCount,
    dynamicImportCandidates: dynamicImportCandidates.slice(0, 10),
  };

  console.log(`React Audit: ${serverComponentsCount} Server Components vs ${clientComponentsCount} Client Components`);
  console.log(`Heavy Client Components suited for dynamic import: ${dynamicImportCandidates.join(", ")}`);

  return report;
}

if (require.main === module) {
  runBundleAudit().catch((err) => {
    console.error("Bundle Audit failed:", err);
    process.exit(1);
  });
}
