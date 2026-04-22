"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  type PieLabelRenderProps,
} from "recharts";

const GOLD = "#0e3590";
const MUTED = "#d1d5db";
// Chart palette — navy brand first, then six clean complementary hues
// that read well on white. No muted browns, no gold (which would clash
// with the navy brand identity).
const COLORS = [
  GOLD,        // navy
  "#2d8a87",   // teal
  "#d97757",   // warm orange
  "#8a6bb0",   // violet
  "#5b7ea3",   // steel blue
  "#6b8e6b",   // olive
];

// Chart axes/grid/tooltip tuned for a light background
const AXIS_TICK = "#5b6472";
const GRID_STROKE = "#e5e7eb";
const LEGEND_TEXT = "#5b6472";

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#0a0a0a",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  },
  itemStyle: { color: "#0a0a0a" },
};

/** In-slice percentage label, hidden for tiny slices that can't fit text. */
function PieSlicePercent(props: PieLabelRenderProps) {
  const cx = Number(props.cx);
  const cy = Number(props.cy);
  const innerRadius = Number(props.innerRadius);
  const outerRadius = Number(props.outerRadius);
  const midAngle = Number(props.midAngle);
  const percent = Number(props.percent ?? 0);
  const pct = Math.round(percent * 100);
  if (pct < 6) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const RAD = Math.PI / 180;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={12}
      fontWeight={600}
      style={{ pointerEvents: "none" }}
    >
      {pct}%
    </text>
  );
}

export function VolumeChart({
  data,
}: {
  data: { name: string; active: number; inactive: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data.slice(0, 10)} margin={{ left: 0, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis
          dataKey="name"
          tick={{ fill: AXIS_TICK, fontSize: 11 }}
          angle={-30}
          textAnchor="end"
          height={70}
        />
        <YAxis tick={{ fill: AXIS_TICK, fontSize: 11 }} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, color: LEGEND_TEXT }} />
        <Bar dataKey="active" fill={GOLD} name="Active" radius={[4, 4, 0, 0]} />
        <Bar
          dataKey="inactive"
          fill={MUTED}
          name="Inactive"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FormatPieChart({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  // External pie labels get clipped by the narrow grid container, so the
  // format is rendered in a legend beneath the donut instead. Percentages
  // sit inside each slice (hidden on very small slices that can't fit text).
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={50}
          outerRadius={82}
          paddingAngle={3}
          dataKey="value"
          label={PieSlicePercent}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          wrapperStyle={{ fontSize: 11, color: LEGEND_TEXT, lineHeight: "16px" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function FormatStackedChart({
  data,
}: {
  data: { name: string; image: number; video: number; carousel: number; unknown: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data.slice(0, 10)} margin={{ left: 0, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis
          dataKey="name"
          tick={{ fill: AXIS_TICK, fontSize: 11 }}
          angle={-30}
          textAnchor="end"
          height={70}
        />
        <YAxis tick={{ fill: AXIS_TICK, fontSize: 11 }} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, color: LEGEND_TEXT }} />
        <Bar dataKey="image" stackId="a" fill={COLORS[0]} name="Image" />
        <Bar dataKey="video" stackId="a" fill={COLORS[1]} name="Video" />
        <Bar dataKey="carousel" stackId="a" fill={COLORS[2]} name="Carousel" />
        <Bar dataKey="unknown" stackId="a" fill={MUTED} name="Other" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function HorizontalBarChart({
  data,
  dataKey,
  label,
  color,
}: {
  data: { name: string; [k: string]: string | number }[];
  dataKey: string;
  label: string;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
      <BarChart
        data={data.slice(0, 12)}
        layout="vertical"
        margin={{ left: 10, right: 24 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
        <XAxis type="number" tick={{ fill: AXIS_TICK, fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: AXIS_TICK, fontSize: 11 }}
          width={120}
        />
        <Tooltip {...tooltipStyle} />
        <Bar
          dataKey={dataKey}
          fill={color ?? GOLD}
          name={label}
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PlatformChart({
  data,
}: {
  data: { name: string; count: number }[];
}) {
  // Platform names (instagram, audience_network, messenger, …) are too long
  // to render as external labels inside a narrow pie. Legend below + in-slice
  // percentages keeps the chart compact and readable.
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={30}
          outerRadius={80}
          paddingAngle={2}
          dataKey="count"
          label={PieSlicePercent}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          wrapperStyle={{ fontSize: 11, color: LEGEND_TEXT, lineHeight: "16px" }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
