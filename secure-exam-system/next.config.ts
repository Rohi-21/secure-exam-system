import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents + partialPrefetching removed — cacheComponents is incompatible
  // with dynamic [id] pages that use useParams() in Client Components.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
