"use client";

import { useState } from "react";
import { Save, Plus, X, Shield, Clock } from "lucide-react";
import { useProfile } from "@/lib/use-profile";
import type { UserProfile } from "@/lib/types";

export default function FocusSettingsPage() {
  const { profile, loading, updateFocusSettings } = useProfile();
  const [newSite, setNewSite] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p style={{ color: "var(--text-tertiary)" }}>Loading settings...</p>
      </div>
    );
  }

  const { focusSettings } = profile;

  const handleUpdateDuration = (key: keyof typeof focusSettings, value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num)) {
      updateFocusSettings({ [key]: num });
    }
  };

  const handleToggleAutoStart = () => {
    updateFocusSettings({ autoStartNext: !focusSettings.autoStartNext });
  };

  const handleAddSite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSite.trim()) return;
    
    let site = newSite.trim().toLowerCase();
    // Simple cleaning
    site = site.replace(/^https?:\/\//, "").replace(/\/$/, "");
    
    if (!focusSettings.blocklist.includes(site)) {
      updateFocusSettings({
        blocklist: [...focusSettings.blocklist, site],
      });
    }
    setNewSite("");
  };

  const handleRemoveSite = (site: string) => {
    updateFocusSettings({
      blocklist: focusSettings.blocklist.filter((s) => s !== site),
    });
  };

  return (
    <div className="max-w-3xl pb-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Focus Settings
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Personalize your deep work experience and Focus Shield.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Timer Defaults */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <div className="flex items-center gap-2 mb-6">
            <Clock size={20} className="text-sage-500" />
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Timer Defaults
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Focus Duration (min)
              </label>
              <input
                type="number"
                value={focusSettings.defaultFocus}
                onChange={(e) => handleUpdateDuration("defaultFocus", e.target.value)}
                className="w-full bg-tertiary border-primary rounded-xl px-4 py-2 text-primary focus:ring-1 focus:ring-accent outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Short Break (min)
              </label>
              <input
                type="number"
                value={focusSettings.defaultBreak}
                onChange={(e) => handleUpdateDuration("defaultBreak", e.target.value)}
                className="w-full bg-tertiary border-primary rounded-xl px-4 py-2 text-primary focus:ring-1 focus:ring-accent outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Long Break (min)
              </label>
              <input
                type="number"
                value={focusSettings.defaultLongBreak}
                onChange={(e) => handleUpdateDuration("defaultLongBreak", e.target.value)}
                className="w-full bg-tertiary border-primary rounded-xl px-4 py-2 text-primary focus:ring-1 focus:ring-accent outline-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Long Break After (sessions)
              </label>
              <input
                type="number"
                value={focusSettings.longBreakAfter}
                onChange={(e) => handleUpdateDuration("longBreakAfter", e.target.value)}
                className="w-full bg-tertiary border-primary rounded-xl px-4 py-2 text-primary focus:ring-1 focus:ring-accent outline-none"
              />
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-primary flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Auto-start breaks & sessions
              </p>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Automatically transition to the next session type when the timer ends.
              </p>
            </div>
            <button
              onClick={handleToggleAutoStart}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                focusSettings.autoStartNext ? "bg-sage-500" : "bg-slate-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  focusSettings.autoStartNext ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Focus Shield */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <div className="flex items-center gap-2 mb-6">
            <Shield size={20} className="text-sage-500" />
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Focus Shield
            </h2>
          </div>

          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            List the websites you want to block during focus sessions. 
            <span className="ml-1 opacity-75">(Requires browser extension for full blocking)</span>
          </p>

          <form onSubmit={handleAddSite} className="flex gap-2 mb-6">
            <input
              type="text"
              placeholder="e.g. twitter.com, youtube.com"
              value={newSite}
              onChange={(e) => setNewSite(e.target.value)}
              className="flex-1 bg-tertiary border-primary rounded-xl px-4 py-2 text-primary focus:ring-1 focus:ring-accent outline-none"
            />
            <button
              type="submit"
              className="bg-tertiary border-primary hover:bg-bg-tertiary rounded-xl px-4 py-2 text-secondary transition-colors"
            >
              <Plus size={20} />
            </button>
          </form>

          <div className="space-y-2">
            {focusSettings.blocklist.length === 0 ? (
              <p className="text-sm italic text-center py-4" style={{ color: "var(--text-tertiary)" }}>
                No sites blocked yet.
              </p>
            ) : (
              focusSettings.blocklist.map((site) => (
                <div
                  key={site}
                  className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ background: "var(--bg-tertiary)" }}
                >
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {site}
                  </span>
                  <button
                    onClick={() => handleRemoveSite(site)}
                    className="text-tertiary hover:text-red-500 transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
