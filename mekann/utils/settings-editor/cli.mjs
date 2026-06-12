#!/usr/bin/env node
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const mod = await jiti.import('./cli.ts');
await mod.runSettingsEditorCli(process.argv.slice(2));
