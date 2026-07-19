"use client";

// "Edit presets" — VoicePal's format editor. A transform preset owns the tone
// + audience that turn a raw voice stream into a first draft in Samy's voice,
// so this is where those instructions live. Builtin presets can be edited but
// not deleted (they re-seed on the server otherwise).
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        showCloseButton
        className="inset-x-0 bottom-0 top-auto left-0 flex max-h-[85vh] w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-t-2xl rounded-b-none border-t border-border bg-card p-0 sm:inset-auto sm:top-[50%] sm:left-[50%] sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:border"
      >
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="text-sm font-semibold text-foreground">
            Transform presets
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {editing !== null || presets.length === 0 ? null : (
            <ul className="space-y-2">
              {presets.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start gap-3 rounded-xl bg-muted px-3 py-2.5"
                >
                  <button
                    onClick={() => startEdit(p)}
                    className="min-w-0 flex-1 text-left transition-transform duration-150 active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {p.name}
                      </span>
                      {p.builtin && (
                        <Badge variant="secondary" className="rounded-full text-[10px] font-medium">
                          builtin
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {p.instruction}
                    </p>
                  </button>
                  {!p.builtin && (
                    <button
                      onClick={() => remove(p)}
                      aria-label={`Delete ${p.name}`}
                      className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-transform duration-150 active:scale-[0.9]"
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
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Preset name (e.g. LinkedIn post)"
                className="text-sm"
              />
              <Textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={4}
                placeholder="How should this format read? Own the tone and audience — e.g. 'Turn this into a LinkedIn post in Samy's voice: hook, one idea, no hashtags.'"
                className="resize-none text-sm"
              />
              <div className="flex items-center justify-end gap-2">
                {presets.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => startEdit(null)}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={save}
                  disabled={saving}
                  className="text-xs font-medium"
                >
                  {saving ? "Saving…" : editing?.id ? "Save changes" : "Add preset"}
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => startEdit({ id: "", name: "", instruction: "" })}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-transform duration-150 active:scale-[0.98]"
            >
              <Plus size={15} /> New preset
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
