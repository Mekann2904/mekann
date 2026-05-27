/**
 * model-optimizer — module registry.
 *
 * All provider optimizer modules are registered here.  The root orchestrator
 * uses this list to find the active module for the current model.
 *
 * To add a new provider optimizer:
 * 1. Create `mekann/core/model-optimizer/<provider>/index.ts` implementing
 *    `ProviderOptimizerModule`.
 * 2. Import and add it to this array.
 */

import type { ProviderOptimizerModule } from "./types.js";
import { openaiModule } from "./openai/index.js";
import { deepseekModule } from "./deepseek/index.js";

export const optimizerModules: ProviderOptimizerModule[] = [
	openaiModule,
	deepseekModule,
];
