import { useState } from "preact/hooks";

interface ConfigProps {
  config: Record<string, unknown>;
}

export function ConfigPanel({ config }: ConfigProps) {
  const [values, setValues] = useState(config);
  const [saved, setSaved] = useState(false);

  const handleChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      setSaved(true);
    } catch (e) {
      console.error("Failed to save config:", e);
    }
  };

  return (
    <div class="config-panel">
      <h2>Configuration</h2>

      {Object.entries(values).map(([key, value]) => (
        <div class="config-item" key={key}>
          <label>{key}</label>
          <input
            type="text"
            value={String(value)}
            onInput={(e) => handleChange(key, e.currentTarget.value)}
          />
        </div>
      ))}

      <div class="actions">
        <button class="primary" onClick={handleSave}>
          Save Changes
        </button>
        {saved && <span class="saved">Saved!</span>}
      </div>
    </div>
  );
}
