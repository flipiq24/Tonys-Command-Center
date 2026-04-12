// Vercel serverless entry point
// Exports the Express app without calling .listen() — Vercel handles the HTTP layer.
//
// The esbuild output bundles src/index.ts → dist/index.mjs which calls app.listen().
// For Vercel, we need a separate entry that just re-exports the app.
// This file imports the app directly from the built app module.

// NOTE: For Vercel deployment, the build script should produce dist/app.mjs
// (a separate entry point that just exports the Express app without .listen()).
// See build.mjs for the dual-entry build configuration.
import app from "../dist/app.mjs";
export default app;
