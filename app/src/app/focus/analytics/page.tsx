"use client";

import { useMemo } from "react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from "recharts";
import { 
  ArrowLeft, 
  Timer, 
  TrendingUp, 
  PieChart as PieChartIcon, 
  Calendar,
  Zap,
  CheckCircle2,
  XCircle,
  Clock
} from "lucide-react";
import Link from "next/link";
import { useFocusSessions } from "@/lib/use-focus-sessions";
import { AREAS } from "@/lib/types";
import type { AreaId } from "@/lib/types";

const AREA_COLORS: Record<string, string> = {
  health: "#14B8A6", // teal
  career: "#6366F1", // indigo
  finance: "#F59E0B", // amber
  brand: "#8B5CF6", // violet
  admin: "#64748B", // slate
  other: "#94A3B8",
};

export default function FocusAnalyticsPage() {
  const { sessions, loading } = useFocusSessions(14); // Fetch 14 days for more context

  const stats = useMemo(() => {
    if (sessions.length === 0) return null;

    const totalMinutes = sessions
      .filter(s => s.status === "completed" || s.status === "partial")
      .reduce((sum, s) => sum + (s.actualDuration || 0), 0);
    
    const completedCount = sessions.filter(s => s.status === "completed").length;
    const completionRate = Math.round((completedCount / sessions.length) * 100);
    
    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
    
    // Group by day for the last 7 days
    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split("T")[0];
    }).reverse();

    const barData = last7Days.map(date => {
      const daySessions = sessions.filter(s => 
        new Date(s.startedAt).toISOString().split("T")[0] === date && 
        (s.status === "completed" || s.status === "partial")
      );
      
      const entry: any = { date: new Date(date).toLocaleDateString("en-US", { weekday: "short", day: "numeric" }) };
      Object.keys(AREAS).forEach(areaId => {
        entry[areaId] = daySessions
          .filter(s => s.area === areaId)
          .reduce((sum, s) => sum + (s.actualDuration || 0), 0);
      });
      
      // Also handle sessions with no area
      entry.other = daySessions
        .filter(s => !s.area)
        .reduce((sum, s) => sum + (s.actualDuration || 0), 0);
        
      return entry;
    });

    // Group by area for pie chart
    const areaDataMap: Record<string, number> = {};
    sessions.filter(s => s.status === "completed" || s.status === "partial").forEach(s => {
      const a = s.area || "other";
      areaDataMap[a] = (areaDataMap[a] || 0) + (s.actualDuration || 0);
    });

    const pieData = Object.entries(areaDataMap).map(([id, mins]) => ({
      name: id === "other" ? "Uncategorized" : AREAS[id as AreaId]?.name || id,
      value: mins,
      color: AREA_COLORS[id] || AREA_COLORS.other,
    })).sort((a, b) => b.value - a.value);

    return {
      totalHours,
      completionRate,
      avgSessionsPerDay: Math.round((sessions.length / 14) * 10) / 10,
      barData,
      pieData,
      totalSessions: sessions.length
    };
  }, [sessions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Clock className="animate-spin text-tertiary mr-2" size={20} />
        <p className="text-tertiary">Analyzing your focus patterns...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <div className="flex items-center gap-4 mb-8">
        <Link 
          href="/focus" 
          className="p-2 rounded-xl hover:bg-bg-secondary transition-colors border border-transparent hover:border-primary"
        >
          <ArrowLeft size={20} className="text-secondary" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-primary">Focus Analytics</h1>
          <p className="text-sm text-secondary">Your deep work patterns and consistency.</p>
        </div>
      </div>

      {!stats || stats.totalSessions === 0 ? (
        <div className="py-20 text-center bg-bg-secondary rounded-3xl border border-dashed border-primary">
          <Timer size={48} className="mx-auto text-tertiary mb-4 opacity-20" />
          <h2 className="text-lg font-medium text-secondary mb-2">No data yet</h2>
          <p className="text-sm text-tertiary max-w-xs mx-auto">
            Complete some focus sessions to see your deep work analytics here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard 
              label="Total Focus" 
              value={`${stats.totalHours}h`} 
              subtext="Last 14 days" 
              icon={<Timer size={20} className="text-sage-500" />} 
            />
            <StatCard 
              label="Completion Rate" 
              value={`${stats.completionRate}%`} 
              subtext={`${stats.totalSessions} total sessions`} 
              icon={<TrendingUp size={20} className="text-indigo-500" />} 
            />
            <StatCard 
              label="Daily Average" 
              value={`${stats.avgSessionsPerDay}`} 
              subtext="Sessions per day" 
              icon={<Zap size={20} className="text-amber-500" />} 
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Bar Chart */}
            <div 
              className="lg:col-span-2 rounded-3xl p-6 bg-bg-secondary border border-primary"
            >
              <div className="flex items-center gap-2 mb-8">
                <Calendar size={18} className="text-tertiary" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-secondary">Weekly Distribution</h2>
              </div>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-primary)" />
                    <XAxis 
                      dataKey="date" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: "var(--text-tertiary)" }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                      unit="m"
                    />
                    <Tooltip 
                      contentStyle={{ 
                        background: "var(--bg-secondary)", 
                        border: "1px solid var(--border-primary)",
                        borderRadius: "12px",
                        fontSize: "12px"
                      }}
                      cursor={{ fill: "var(--bg-tertiary)", opacity: 0.4 }}
                    />
                    {Object.keys(AREAS).map(areaId => (
                      <Bar 
                        key={areaId} 
                        dataKey={areaId} 
                        stackId="a" 
                        fill={AREA_COLORS[areaId]} 
                        radius={[2, 2, 0, 0]}
                        barSize={24}
                      />
                    ))}
                    <Bar dataKey="other" stackId="a" fill={AREA_COLORS.other} radius={[4, 4, 0, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie Chart */}
            <div className="rounded-3xl p-6 bg-bg-secondary border border-primary">
              <div className="flex items-center gap-2 mb-8">
                <PieChartIcon size={18} className="text-tertiary" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-secondary">By Area</h2>
              </div>
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {stats.pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        background: "var(--bg-secondary)", 
                        border: "1px solid var(--border-primary)",
                        borderRadius: "12px",
                        fontSize: "12px"
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 mt-4">
                {stats.pieData.slice(0, 4).map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
                      <span className="text-xs text-secondary">{entry.name}</span>
                    </div>
                    <span className="text-xs font-mono text-tertiary">
                      {Math.round((entry.value / stats.pieData.reduce((s, i) => s + i.value, 0)) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Sessions */}
          <div className="rounded-3xl p-6 bg-bg-secondary border border-primary">
             <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-bold uppercase tracking-widest text-secondary">Recent Sessions</h2>
                <span className="text-xs text-tertiary">{sessions.length} recorded</span>
             </div>
             <div className="space-y-2">
                {sessions.slice(0, 10).map((session) => (
                  <div 
                    key={session.id} 
                    className="flex items-center justify-between p-3 rounded-2xl bg-bg-tertiary border border-primary"
                  >
                    <div className="flex items-center gap-3">
                      <SessionStatusIcon status={session.status} />
                      <div>
                        <p className="text-sm font-medium text-primary">
                          {session.area ? AREAS[session.area as AreaId]?.name : "Deep Work"}
                        </p>
                        <p className="text-[10px] text-tertiary">
                          {new Date(session.startedAt).toLocaleDateString()} at {new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-mono font-bold text-secondary">{session.actualDuration || 0}m</p>
                      <p className="text-[10px] text-tertiary uppercase tracking-tighter">
                        {session.status}
                      </p>
                    </div>
                  </div>
                ))}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, subtext, icon }: { label: string; value: string; subtext: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-3xl p-6 bg-bg-secondary border border-primary">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-bold uppercase tracking-widest text-tertiary">{label}</span>
        {icon}
      </div>
      <p className="text-3xl font-bold text-primary mb-1">{value}</p>
      <p className="text-xs text-tertiary">{subtext}</p>
    </div>
  );
}

function SessionStatusIcon({ status }: { status: FocusSession["status"] }) {
  switch (status) {
    case "completed": return <CheckCircle2 size={16} className="text-sage-500" />;
    case "partial": return <Zap size={16} className="text-amber-500" />;
    default: return <XCircle size={16} className="text-tertiary" />;
  }
}
