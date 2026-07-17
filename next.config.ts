import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Optimise barrel-import packages so only actually-used exports are bundled.
  // lucide-react ships 1000+ icons in a barrel; this ensures only the ~17 used
  // icons reach the client. Confirmed present in the 418-*.js (29KB) chunk.
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "@radix-ui/react-tooltip",
    ],
  },
  // Keep heavy server-only dependencies off the edge and client bundles.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;
