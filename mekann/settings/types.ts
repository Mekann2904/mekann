export type SettingsScope = "global" | "workspace";
export type SettingType = "number" | "string" | "boolean" | "enum" | "modelRef";

export interface SettingSchema<T = unknown> {
  key: string;
  type: SettingType;
  defaultValue: T;
  description: string;
  category: string;
  scopes: SettingsScope[];
  restartRequired: boolean;
  enumValues?: string[];
  validate(value: unknown): string[];
}

export interface FeatureSettingsSchema {
  feature: string;
  title: string;
  settings: SettingSchema[];
}

export interface MekannSettingsFile {
  version: 1;
  features: Record<string, Record<string, unknown>>;
}

export interface EffectiveSetting {
  feature: string;
  key: string;
  schema: SettingSchema;
  defaultValue: unknown;
  globalValue?: unknown;
  workspaceValue?: unknown;
  effectiveValue: unknown;
  source: "default" | SettingsScope;
  diagnostics: string[];
}
