type Series = { values: number[]; colorVar: "--series-1" | "--series-2" };

function toPoints(values: number[], min: number, max: number, width: number, height: number, padTop = 6, padBottom = 6) {
  const usable = height - padTop - padBottom;
  const step = width / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * step + 6;
      const t = max === min ? 0.5 : (v - min) / (max - min);
      const y = padTop + (1 - t) * usable;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function Sparkline({
  labels,
  series,
  height = 74,
}: {
  labels: string[];
  series: Series[];
  height?: number;
}) {
  const width = 248;
  const all = series.flatMap((s) => s.values);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const baselineY = height - 10;

  return (
    <div>
      <svg
        viewBox={`0 0 ${width + 12} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Trend across ${labels.join(", ")}`}
      >
        <line x1="0" y1={baselineY} x2={width + 12} y2={baselineY} stroke="var(--border)" strokeWidth="1" />
        {series.map((s, si) => {
          const points = toPoints(s.values, min, max, width, height);
          const last = points.split(" ").pop()!.split(",");
          return (
            <g key={si}>
              <polyline
                points={points}
                fill="none"
                stroke={`var(${s.colorVar})`}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx={last[0]} cy={last[1]} r="4" fill={`var(${s.colorVar})`} stroke="var(--surface)" strokeWidth="2" />
            </g>
          );
        })}
      </svg>
      <div className="mt-0.5 flex justify-between text-[10.5px] text-[var(--ink-muted)]">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}

export function ChartLegend({ items }: { items: { label: string; colorVar: "--series-1" | "--series-2" }[] }) {
  return (
    <div className="mt-2.5 flex gap-4">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5 text-xs font-medium text-[var(--ink-secondary)]">
          <span className="h-[3px] w-3 flex-none rounded-sm" style={{ background: `var(${item.colorVar})` }} />
          {item.label}
        </div>
      ))}
    </div>
  );
}
