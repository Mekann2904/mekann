const DEFAULT_LLM_BEHAVIOR_CONFIG = {
  enabled: process.env.PI_BEHAVIOR_TRACKING !== "false",
  samplingRate: parseFloat(process.env.PI_BEHAVIOR_SAMPLING || "1.0"),
  thresholds: {
    efficiencyDrop: -0.3,
    formatViolationRate: 0.2,
    timeoutSpikeMultiplier: 2,
    zScoreThreshold: 2
  },
  retention: {
    recordsDays: 30,
    aggregatesDays: 365,
    anomaliesDays: 90
  },
  aggregation: {
    hourly: true,
    daily: true,
    weekly: true
  }
};
export {
  DEFAULT_LLM_BEHAVIOR_CONFIG
};
