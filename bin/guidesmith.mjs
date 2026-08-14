#!/usr/bin/env node
import { run } from '../src/cli.mjs';

run(process.argv).catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
