import { useState } from "react";

type PingInputProps = {
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  allowEmpty?: boolean;
  onEditingChange?: (editing: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  title?: string;
};

export function PingInput({ value, onCommit, allowEmpty = false, onEditingChange, ...inputProps }: PingInputProps) {
  const [draft, setDraft] = useState<string>();

  function commit() {
    if (draft === undefined) return;
    const number = Number(draft);
    const ping =
      allowEmpty && draft === "" ? undefined : Math.min(999, Math.max(0, Number.isFinite(number) ? number : 0));
    onCommit(ping);
    setDraft(undefined);
    onEditingChange?.(false);
  }

  return (
    <input
      {...inputProps}
      type="number"
      min="0"
      max="999"
      step="1"
      inputMode="numeric"
      value={draft ?? value ?? ""}
      onChange={(event) => {
        setDraft(event.target.value);
        onEditingChange?.(true);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}
