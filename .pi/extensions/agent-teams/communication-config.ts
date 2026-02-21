/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/communication-config.ts
 * role: コミュニケーションモジュールのfeature flag管理
 * why: 段階的導入とロールバックを可能にするため
 * related: .pi/extensions/agent-teams/communication.ts
 * public_api: CommunicationConfig, getCommunicationConfig
 * invariants: なし
 * side_effects: なし
 * failure_modes: なし
 */

export interface CommunicationConfig {
  linksV2: boolean;
  contextV2: boolean;
  referencesV3: boolean;
  terminationV2: boolean;
}

const DEFAULTS: CommunicationConfig = {
  linksV2: true,
  contextV2: true,
  referencesV3: true,
  terminationV2: true,
};

export function getCommunicationConfig(): CommunicationConfig {
  return {
    linksV2: parseEnvBool("PI_COMMUNICATION_LINKS_V2", DEFAULTS.linksV2),
    contextV2: parseEnvBool("PI_COMMUNICATION_CONTEXT_V2", DEFAULTS.contextV2),
    referencesV3: parseEnvBool("PI_COMMUNICATION_REFERENCES_V3", DEFAULTS.referencesV3),
    terminationV2: parseEnvBool("PI_COMMUNICATION_TERMINATION_V2", DEFAULTS.terminationV2),
  };
}

function parseEnvBool(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

export function isCommunicationV2Enabled(): boolean {
  const config = getCommunicationConfig();
  return config.linksV2 || config.contextV2 || config.referencesV3 || config.terminationV2;
}
