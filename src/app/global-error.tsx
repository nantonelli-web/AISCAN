"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * App Router top-level error boundary. Catches render errors that
 * escape every nested boundary and reports them to Sentry. Must render
 * its own <html>/<body> because it replaces the root layout when it
 * triggers.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="it">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
        }}
      >
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <h2 style={{ marginBottom: "0.5rem" }}>Qualcosa è andato storto</h2>
          <p style={{ color: "#666", marginBottom: "1.5rem" }}>
            L&apos;errore è stato registrato. Riprova tra poco.
          </p>
          <button
            onClick={() => reset()}
            style={{
              cursor: "pointer",
              padding: "0.6rem 1.2rem",
              borderRadius: "0.5rem",
              border: "1px solid #ccc",
              background: "#111",
              color: "#fff",
            }}
          >
            Riprova
          </button>
        </div>
      </body>
    </html>
  );
}
