"use client";

// "Edit presets" — VoicePal's format editor. A transform preset owns the tone
// + audience that turn a raw voice stream into a first draft in Samy's voice,
// so this is where those instructions live. Builtin presets can be edited but
// not deleted (they re-seed on the server otherwise).
import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useToast } from "@/components/toast";

export interface Preset {
  id: string;
  name: string;
  instruction: string;
  builtin?: boolean;
}

export function PresetsModal({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged?: (presets: Preset[]) => void;
}) {
  const { toast } = useToast();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [editing, setEditing] = useState<Preset | null>(null);
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await fetch("/api/voicepal/presets");
    const data = await res.json();
    setPresets(data.presets || []);
    onChanged?.(data.presets || []);
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const startEdit = (p: Preset | null) => {
    setEditing(p);
    setName(p?.name ?? "");
    setInstruction(p?.instruction ?? "");
  };

  const save = async () => {
    if (!name.trim() || !instruction.trim()) {
      toast("Name and instruction are both required", "error");
      return;
    }
    const isEdit = Boolean(editing?.id);
    setSaving(true);
    try {
      const res = await fetch("/api/voicepal/presets", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEdit
            ? { id: editing!.id, name: name.trim(), instruction: instruction.trim() }
            : { name: name.trim(), instruction: instruction.trim() }
        ),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      startEdit(null);
      await load();
      toast(isEdit ? "Preset updated" : "Preset added", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "couldn't save preset", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: Preset) => {
    try {
      const res = await fetch(`/api/voicepal/presets?id=${encodeURIComponent(p.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "couldn't delete preset", "error");
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center"
      style={{ zIndex: 50 }}
    >
      <button
        type="button"
        aria-label="Close presets"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.4)", animation: "enter-fade-up var(--dur-base) var(--ease-out-custom) both" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="pop-in relative m-0 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl sm:m-4 sm:rounded-2xl"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-primary)" }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border-primary)" }}
        >
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Transform presets
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 transition-transform duration-150 active:scale-[0.92]"
            style={{ color: "var(--text-tertiary)" }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {editing !== null || presets.length === 0 ? null : (
            <ul className="space-y-2">
              {presets.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: "var(--bg-secondary)" }}
                >
                  <button
                    onClick={() => startEdit(p)}
                    className="min-w-0 flex-1 text-left transition-transform duration-150 active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {p.name}
                      </span>
                      {p.builtin && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)" }}
                        >
                          builtin
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {p.instruction}
                    </p>
                  </button>
                  {!p.builtin && (
                    <button
                      onClick={() => remove(p)}
                      aria-label={`Delete ${p.name}`}
                      className="shrink-0 rounded-lg p-1.5 transition-transform duration-150 active:scale-[0.9]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Add / edit form */}
          {editing !== null || presets.length === 0 ? (
            <div className="enter space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Preset name (e.g. LinkedIn post)"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
              />
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={4}
                placeholder="How should this format read? Own the tone and audience — e.g. 'Turn this into a LinkedIn post in Samy's voice: hook, one idea, no hashtags.'"
                className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border-primary)" }}
              />
              <div className="flex items-center justify-end gap-2">
                {presets.length > 0 && (
                  <button
                    onClick={() => startEdit(null)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium transition-transform duration-150 active:scale-[0.97]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-transform duration-150 active:scale-[0.97]"
                  style={{ background: "var(--accent)", color: "white", opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? "Saving…" : editing?.id ? "Save changes" : "Add preset"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => startEdit({ id: "", name: "", instruction: "" })}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-transform duration-150 active:scale-[0.98]"
              style={{ border: "1px dashed var(--border-primary)", color: "var(--text-secondary)" }}
            >
              <Plus size={15} /> New preset
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
