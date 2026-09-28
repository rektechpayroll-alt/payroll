import { gbpCompact } from "@/lib/format";

/** Small dependency-free SVG charts, rendered on the server and scaled to their container. */

const W = 640;

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p / 2) * 2 * p;
}

const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const shortMonth = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

/** A running balance over time, shaded red where it dips below zero. Values in pounds. */
export function BalanceChart({ points, height = 200, id = "balance" }: { points: Array<{ date: string; value: number }>; height?: number; id?: string }) {
  if (points.length < 2) return null;
  const pad = { l: 56, r: 12, t: 12, b: 24 };
  const values = points.map((p) => p.value);
  const hi = niceMax(Math.max(0, ...values));
  const lo = Math.min(0, ...values) < 0 ? -niceMax(-Math.min(...values)) : 0;
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo)) * (height - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const area = `${path}L${x(points.length - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
  const ticks = [hi, (hi + lo) / 2, lo].filter((v, i, a) => a.indexOf(v) === i);
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label="Balance over time">
      <defs>
        <clipPath id={`${id}-below-zero`}>
          <rect x={0} y={y(0)} width={W} height={height} />
        </clipPath>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--ink-muted)">
            {gbpCompact(t)}
          </text>
        </g>
      ))}
      {lo < 0 && <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="var(--ink-muted)" strokeDasharray="3 3" />}
      <path d={area} fill="var(--accent)" opacity={0.12} />
      <path d={path} fill="none" stroke="var(--accent-strong)" strokeWidth={2} />
      <path d={path} fill="none" stroke="var(--critical-ink)" strokeWidth={2.2} clipPath={`url(#${id}-below-zero)`} />
      {points.map((p, i) =>
        i % labelEvery === 0 ? (
          <text key={p.date} x={x(i)} y={height - 6} textAnchor="middle" fontSize="10.5" fill="var(--ink-muted)">
            {shortDate(p.date)}
          </text>
        ) : null
      )}
    </svg>
  );
}

/** Income against costs per month, as paired bars. */
export function IncomeCostsChart({ months, height = 200 }: { months: Array<{ month: string; income: number; costs: number }>; height?: number }) {
  const pad = { l: 56, r: 12, t: 12, b: 24 };
  const hi = niceMax(Math.max(1, ...months.flatMap((m) => [m.income, m.costs])));
  const slot = (W - pad.l - pad.r) / Math.max(1, months.length);
  const bar = Math.min(18, slot / 3);
  const y = (v: number) => pad.t + ((hi - Math.max(0, v)) / hi) * (height - pad.t - pad.b);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label="Income and costs by month">
      {[hi, hi / 2, 0].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--ink-muted)">
            {gbpCompact(t)}
          </text>
        </g>
      ))}
      {months.map((m, i) => {
        const cx = pad.l + slot * i + slot / 2;
        return (
          <g key={m.month}>
            <rect x={cx - bar - 1} y={y(m.income)} width={bar} height={y(0) - y(m.income)} rx={2} fill="var(--good-ink)">
              <title>{`${m.month} income ${gbpCompact(m.income)}`}</title>
            </rect>
            <rect x={cx + 1} y={y(m.costs)} width={bar} height={y(0) - y(m.costs)} rx={2} fill="var(--critical-ink)" opacity={0.75}>
              <title>{`${m.month} costs ${gbpCompact(m.costs)}`}</title>
            </rect>
            <text x={cx} y={height - 6} textAnchor="middle" fontSize="10.5" fill="var(--ink-muted)">
              {shortMonth(m.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function ChartLegend({ items }: { items: Array<{ color: string; label: string }> }) {
  return (
    <div className="flex flex-wrap gap-3 text-[11.5px] text-[var(--ink-secondary)]">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Horizontal bars, largest first. */
export function BarList({ rows, format = gbpCompact }: { rows: Array<{ label: string; value: number }>; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="text-[12.5px]">
          <div className="mb-1 flex justify-between gap-2">
            <span className="truncate">{r.label}</span>
            <span className="font-num font-semibold">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--surface-2)]">
            <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A 0–100 score as a ring. */
export function ScoreRing({ score, grade, size = 120 }: { score: number; grade: string; size?: number }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const color = score >= 65 ? "var(--good-ink)" : score >= 50 ? "var(--warning-ink)" : "var(--critical-ink)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Health score ${score} out of 100, grade ${grade}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={9} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="47%" textAnchor="middle" fontSize={size / 4} fontWeight={700} fill="var(--ink)">
        {grade}
      </text>
      <text x="50%" y="66%" textAnchor="middle" fontSize={size / 10} fill="var(--ink-muted)">
        {score}/100
      </text>
    </svg>
  );
}
