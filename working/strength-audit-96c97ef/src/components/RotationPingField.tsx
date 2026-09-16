import { useState } from "react";
import { PingInput } from "./PingInput";
import { UiIcon } from "../UiIcon";
import { t } from "../i18n";

type RotationPingFieldProps = {
  value: number | undefined;
  inheritedValue: number;
  disabled: boolean;
  onCommit: (value: number | undefined) => void;
};

export function RotationPingField({ value, inheritedValue, disabled, onCommit }: RotationPingFieldProps) {
  const [editing, setEditing] = useState(false);
  const [resetRevision, setResetRevision] = useState(0);
  const modified = editing || value !== undefined;

  if (disabled) {
    return (
      <label className="field compact-field rotation-target-hp rotation-ping-field ping-field">
        <span className="field-label">{t("ui.app.ping")}</span>
        <PingInput disabled value={value ?? inheritedValue} onCommit={onCommit} />
      </label>
    );
  }

  return (
    <label
      className={`field compact-field rotation-target-hp rotation-ping-field ping-field ${modified ? "modified-field" : ""}`}
    >
      <span className="field-label">
        <span>{t("ui.app.ping")}</span>
        {modified && (
          <button
            className="stat-reset-button"
            type="button"
            aria-label={t("ui.app.resetNamedValue", { name: t("ui.app.ping") })}
            title={t("ui.app.pingInherit")}
            onClick={(event) => {
              event.preventDefault();
              setEditing(false);
              setResetRevision((revision) => revision + 1);
              onCommit(undefined);
            }}
          >
            <UiIcon name="reset" />
          </button>
        )}
      </span>
      <PingInput
        key={resetRevision}
        allowEmpty
        placeholder={String(inheritedValue)}
        title={t("ui.app.pingInherit")}
        value={value}
        onEditingChange={setEditing}
        onCommit={onCommit}
      />
    </label>
  );
}
