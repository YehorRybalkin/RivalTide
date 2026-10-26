"use client";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const CAT_COLORS: Record<string, string> = {
  pricing: "var(--chart-1)", product: "var(--chart-2)", features: "var(--chart-3)", positioning: "var(--chart-4)",
  announcement: "var(--chart-5)", general: "var(--chart-6)", unclassified: "var(--danger)",
};
const LABELS: Record<string, string> = { pricing: "Pricing", product: "Product", features: "Features", positioning: "Positioning", announcement: "Announcements", general: "General" };
const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--foreground)" };

export function WeeklyActivityChart({ data }: { data: { week: string; pricing: number; product: number; features: number; positioning: number; announcement: number; general: number }[] }) {
  const keys = ["pricing", "product", "features", "positioning", "announcement", "general"] as const;
  return (
    <div className="h-64 w-full" role="img" aria-label="Verified changes per week by category">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="week" tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }} labelFormatter={(v) => `Week of ${new Date(String(v)).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} formatter={(v: string) => <span style={{ color: "var(--muted)" }}>{LABELS[v] ?? v}</span>} />
          {keys.map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={CAT_COLORS[k]} radius={i === keys.length - 1 ? [3, 3, 0, 0] : 0} name={k} maxBarSize={36} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryDonut({ data }: { data: { category: string; count: number }[] }) {
  const total = data.reduce((n, d) => n + d.count, 0);
  return (
    <div className="flex items-center gap-6">
      <div className="relative size-36 shrink-0" role="img" aria-label="Changes by category in the last 30 days">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="category" innerRadius={46} outerRadius={66} paddingAngle={2} stroke="none">
              {data.map((d) => <Cell key={d.category} fill={CAT_COLORS[d.category] ?? "var(--chart-6)"} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [String(v), LABELS[String(n)] ?? String(n)]} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="tabular text-xl font-semibold">{total}</span><span className="text-[11px] text-muted">changes</span></div>
      </div>
      <ul className="flex-1 space-y-1.5 text-[13px]">
        {data.map((d) => (
          <li key={d.category} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: CAT_COLORS[d.category] ?? "var(--chart-6)" }} aria-hidden />
            <span className="flex-1 text-muted">{LABELS[d.category] ?? (d.category === "unclassified" ? "Needs review" : d.category)}</span>
            <span className="tabular font-medium">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FrequencyChart({ data }: { data: { week: string; count: number }[] }) {
  return (
    <div className="h-40 w-full" role="img" aria-label="Changes per week">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <XAxis dataKey="week" tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="count" name="Changes" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

export function PriceHistoryChart({ points }: { points: { date: string; series: string; amount: number; currency: string }[] }) {
  const series = [...new Set(points.map((p) => `${p.series} · ${p.currency}`))].slice(0, 6);
  const byDate = new Map<string, Record<string, number | string>>();
  for (const p of points) {
    const key = p.date.slice(0, 10);
    const row = byDate.get(key) ?? { date: key };
    row[`${p.series} · ${p.currency}`] = p.amount;
    byDate.set(key, row);
  }
  const data = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return (
    <div className="h-56 w-full" role="img" aria-label="Published price history">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
          {series.map((s, i) => <Line key={s} type="stepAfter" dataKey={s} stroke={SERIES_COLORS[i]} strokeWidth={2} dot={{ r: 3 }} connectNulls />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
