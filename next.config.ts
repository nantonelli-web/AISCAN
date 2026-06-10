import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Baseline CSP compatible with Next.js App Router.
// `unsafe-inline`/`unsafe-eval` for script-src are required by Next's runtime
// and hydration; this still blocks external script hosts and inline event
// handlers from untrusted sources. Style-src also needs unsafe-inline for
// CSS-in-JS + Tailwind arbitrary styles.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  // media-src must be explicit — otherwise the browser falls back to
  // default-src 'self' and silently blocks every <video>/<audio> with
  // a cross-origin source. Ad creatives play directly from
  // *.fbcdn.net / *.cdninstagram.com / scontent.* without any local
  // proxy, so the policy has to allow https: + blob:.
  "media-src 'self' https: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // 1-year HSTS with subdomains; only emitted on https responses by browsers.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. Without it, a stray
  // package-lock.json higher up the tree (e.g. in the user's home dir)
  // makes Next infer the wrong root, which breaks next/font resolution
  // ("fontLoader is not a function") on local builds. On Vercel the
  // root is already correct; this just makes local builds deterministic
  // and silences the multi-lockfile warning.
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.fbcdn.net" },
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "scontent.**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // Legacy /competitors paths redirect to /brands. The directory
  // moved 2026-05-04 (was /competitors, now /brands) for SEO/GEO
  // reasons — the canonical URL is /brands and we don't want
  // outside links / bookmarks to 404. Permanent (308) so search
  // engines pass authority. Internal codebase links should target
  // /brands directly; this catch-all is purely a courtesy for
  // anything we missed.
  async redirects() {
    return [
      {
        source: "/competitors",
        destination: "/brands",
        permanent: true,
      },
      {
        source: "/competitors/:path*",
        destination: "/brands/:path*",
        permanent: true,
      },
    ];
  },
};

// Wrap with Sentry. This preserves the nextConfig above (CSP, headers,
// redirects, images) untouched — withSentryConfig only injects the
// build-time bundler plugin (sourcemap upload) + the same-origin
// `/monitoring` tunnel route. Sourcemap upload needs SENTRY_ORG /
// SENTRY_PROJECT / SENTRY_AUTH_TOKEN at build time; without them the
// build still succeeds (stacks just stay minified).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
