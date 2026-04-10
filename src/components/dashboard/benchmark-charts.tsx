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

const GOLD = "#d4a843";
const MUTED = "#3a3a3a";
const COLORS = [GOLD, "#6b8e6b", "#5b7ea3", "#a06b5b", "#8a6bb0", "#5ba09b"];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: "#1a1a1a",
    border: "1px solid #2a2a2a",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#f5f5f5",
  },
  itemStyle: { color: "#b0b0b0" },
};

export function VolumeChart({
  data,
}: {
  data: { name: string; active: number; inactive: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data.slice(0, 10)} margin={{ left: 0, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#232323" />
        <XAxis
          dataKey="name"
          tick={{ fill: "#b0b0b0", fontSize: 11 }}
          angle={-30}
          textAnchor="end"
          height={70}
        />
        <YAxis tick={{ fill: "#b0b0b0", fontSize: 11 }} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#b0b0b0" }} />
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
  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={3}
          dataKey="value"
          label={(props: PieLabelRenderProps) =>
            `${props.name ?? ""} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`
          }
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function FormatStackedChart({
  data,
}: {
  data: { name: string; image: number; video: number; unknown: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data.slice(0, 10)} margin={{ left: 0, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#232323" />
        <XAxis
          dataKey="name"
          tick={{ fill: "#b0b0b0", fontSize: 11 }}
          angle={-30}
          textAnchor="end"
          height={70}
        />
        <YAxis tick={{ fill: "#b0b0b0", fontSize: 11 }} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#b0b0b0" }} />
        <Bar dataKey="image" stackId="a" fill={GOLD} name="Image" />
        <Bar dataKey="video" stackId="a" fill="#5b7ea3" name="Video" />
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
        <CartesianGrid strokeDasharray="3 3" stroke="#232323" />
        <XAxis type="number" tick={{ fill: "#b0b0b0", fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: "#b0b0b0", fontSize: 11 }}
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
  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={90}
          paddingAngle={2}
          dataKey="count"
          label={(props: PieLabelRenderProps) =>
            `${props.name ?? ""} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`
          }
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}
