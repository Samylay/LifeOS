"use client";

import { useState, useEffect } from "react";
import { Sparkles, RefreshCcw, Loader2 } from "lucide-react";

interface DailyBriefProps {
  tasks: any[];
  events: any[];
  stats: {
    habitsDone: number;
    totalHabits: number;
    focusMinutes: number;
  };
}

export function DailyBrief({ tasks, events, stats }: DailyBriefProps) {
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  const fetchBrief = async (force = false) => {
    // Check cache
    const today = new Date().toISOString().split("T")[0];
    const cached = localStorage.getItem(`daily-brief-${today}`);
    
    if (cached && !force) {
      setBrief(cached);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: tasks.slice(0, 10), // only top 10
          events: events.slice(0, 5),
          stats,
        }),
      });
      const data = await res.json();
      if (data.brief) {
        setBrief(data.brief);
        localStorage.setItem(`daily-brief-${today}`, data.brief);
        setLastFetched(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error("Brief error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tasks.length > 0 || events.length > 0) {
      fetchBrief();
    }
  }, [tasks.length, events.length]);

  return (
    <div 
      className="rounded-2xl p-6 transition-all border border-primary overflow-hidden relative"
      style={{ 
        background: "linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)",
        boxShadow: "var(--shadow-md)" 
      }}
    >
      {/* Decorative background element */}
      <div className="absolute -top-4 -right-4 opacity-5 rotate-12">
        <Sparkles size={120} />
      </div>

      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-2">
          <div className="bg-sage-500/10 p-1.5 rounded-lg">
            <Sparkles size={18} className="text-sage-500" />
          </div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-secondary">
            Daily Brief
          </h2>
        </div>
        <button 
          onClick={() => fetchBrief(true)}
          disabled={loading}
          className="text-tertiary hover:text-primary p-1 rounded-lg transition-colors active:rotate-180 duration-500"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
        </button>
      </div>

      <div className="relative z-10">
        {loading && !brief ? (
          <div className="space-y-2 py-2">
            <div className="h-4 bg-primary/10 rounded animate-pulse w-[90%]" />
            <div className="h-4 bg-primary/10 rounded animate-pulse w-[75%]" />
          </div>
        ) : (
          <p className="text-primary text-sm leading-relaxed italic font-medium">
            &quot;{brief || "Syncing your morning briefing..."}&quot;
          </p>
        )}
      </div>
      
      {lastFetched && !loading && (
        <p className="text-[10px] text-tertiary mt-4 opacity-50">
          Last updated at {lastFetched}
        </p>
      )}
    </div>
  );
}
