// Lightweight, dependency-free SVG charts for the dashboard. They read DUX CSS
// vars so they auto-theme (light/dark). Datasets are small & pre-aggregated.
import { fmtCompact } from '../lib/format';

export const CHART_COLORS = ['var(--iris)', 'var(--cyan)', 'var(--pending)', 'var(--ok)', 'var(--err)', 'var(--iris-soft)', 'var(--cyan-soft)', 'var(--fg-3)'];

type Row = { label: string; value: number };

/** Horizontal ranked bars — top suppliers / projects / categories / companies. */
export function HBars({ data, money = true, color = 'var(--iris)', max }: { data: Row[]; money?: boolean; color?: string; max?: number }) {
	if (!data.length) return <div className="chart-empty">No data in range</div>;
	const peak = max ?? Math.max(...data.map((d) => Math.abs(d.value)), 1);
	return (
		<div className="hbars">
			{data.map((d, i) => (
				<div className="hbar" key={d.label + i}>
					<div className="hbar-l" title={d.label}>{d.label}</div>
					<div className="hbar-track">
						<div className="hbar-fill" style={{ width: `${Math.max(2, (Math.abs(d.value) / peak) * 100)}%`, background: color }} />
					</div>
					<div className="hbar-v">{money ? fmtCompact(d.value) : d.value}</div>
				</div>
			))}
		</div>
	);
}

/** Vertical bars — monthly trend. */
export function VBars({ data }: { data: { label: string; value: number; is_current?: boolean }[] }) {
	if (!data.length) return <div className="chart-empty">No data in range</div>;
	const peak = Math.max(...data.map((d) => d.value), 1);
	return (
		<div className="vbars">
			{data.map((d, i) => (
				<div className="vbar" key={d.label + i} title={`${d.label}: ${fmtCompact(d.value)}`}>
					<div className="vbar-col">
						<div className="vbar-fill" style={{ height: `${Math.max(3, (d.value / peak) * 100)}%`, background: d.is_current ? 'var(--iris)' : 'var(--iris-tint)', borderColor: d.is_current ? 'var(--iris)' : 'transparent' }} />
					</div>
					<div className="vbar-v">{fmtCompact(d.value)}</div>
					<div className="vbar-l">{d.label.split(' - ')[0]}</div>
				</div>
			))}
		</div>
	);
}

/** Donut with legend — status / category mix. */
export function Donut({ data, money = true, size = 132 }: { data: { label: string; value: number; color?: string }[]; money?: boolean; size?: number }) {
	const items = data.filter((d) => d.value > 0);
	const total = items.reduce((s, d) => s + d.value, 0);
	if (!total) return <div className="chart-empty">No data in range</div>;
	const r = size / 2 - 10;
	const c = 2 * Math.PI * r;
	let offset = 0;
	const cx = size / 2;
	return (
		<div className="donut-wrap">
			<svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="donut">
				{items.map((d, i) => {
					const frac = d.value / total;
					const dash = frac * c;
					const seg = (
						<circle key={i} cx={cx} cy={cx} r={r} fill="none" strokeWidth={14}
							stroke={d.color ?? CHART_COLORS[i % CHART_COLORS.length]}
							strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset}
							transform={`rotate(-90 ${cx} ${cx})`} />
					);
					offset += dash;
					return seg;
				})}
				<text x={cx} y={cx - 4} textAnchor="middle" className="donut-c1">{items.length}</text>
				<text x={cx} y={cx + 12} textAnchor="middle" className="donut-c2">{money ? 'segments' : 'total'}</text>
			</svg>
			<div className="donut-legend">
				{items.map((d, i) => (
					<div className="dleg" key={i}>
						<span className="ddot" style={{ background: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }} />
						<span className="dlbl" title={d.label}>{d.label}</span>
						<span className="dval">{money ? fmtCompact(d.value) : d.value}</span>
					</div>
				))}
			</div>
		</div>
	);
}

/** Line chart — a value series over ordered points (e.g. rate over time). */
export function LineChart({ points, money = true }: { points: { label: string; value: number }[]; money?: boolean }) {
	if (points.length < 2) return <div className="chart-empty">Need at least two purchases to chart a trend</div>;
	const W = 600, H = 190, PADX = 12, PADT = 16, PADB = 26;
	const vals = points.map((p) => p.value);
	const mn = Math.min(...vals), mx = Math.max(...vals);
	const range = mx - mn || 1;
	const x = (i: number) => PADX + (i / (points.length - 1)) * (W - 2 * PADX);
	const y = (v: number) => PADT + (1 - (v - mn) / range) * (H - PADT - PADB);
	const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
	const area = `${d} L${x(points.length - 1).toFixed(1)},${H - PADB} L${x(0).toFixed(1)},${H - PADB} Z`;
	return (
		<div className="linechart">
			<svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="lc-svg">
				<path d={area} fill="var(--iris-tint)" />
				<path d={d} fill="none" stroke="var(--iris)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
				{points.map((p, i) => (
					<circle key={i} cx={x(i)} cy={y(p.value)} r={3} fill="var(--iris)" />
				))}
			</svg>
			<div className="lc-meta">
				<span>Low {money ? fmtCompact(mn) : mn}</span>
				<span>Latest {money ? fmtCompact(points[points.length - 1].value) : points[points.length - 1].value}</span>
				<span>High {money ? fmtCompact(mx) : mx}</span>
			</div>
		</div>
	);
}

/** Funnel — pipeline stages (count + value). */
export function Funnel({ stages }: { stages: { label: string; count: number; value?: number }[] }) {
	const peak = Math.max(...stages.map((s) => s.count), 1);
	return (
		<div className="funnel">
			{stages.map((s, i) => {
				const prev = i > 0 ? stages[i - 1].count : null;
				const conv = prev ? Math.round((s.count / prev) * 100) : null;
				return (
					<div className="fstage" key={s.label}>
						<div className="fbar-track">
							<div className="fbar" style={{ width: `${Math.max(6, (s.count / peak) * 100)}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}>
								<span className="fcount">{s.count}</span>
							</div>
						</div>
						<div className="fmeta">
							<span className="flbl">{s.label}</span>
							{conv != null && <span className="fconv">{conv}%</span>}
						</div>
					</div>
				);
			})}
		</div>
	);
}
