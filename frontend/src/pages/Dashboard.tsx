import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, type DashboardData, type PaymentDashboard, type SupplierAnalytics, type ProjectPortfolio } from '../lib/api';
import { fmtCompact, fmtPercent, fmtMoney, fmtDate } from '../lib/format';
import { Icon } from '../components/Icon';
import { SearchSelect } from '../components/form';
import { HBars, VBars, Donut, Funnel, LineChart } from '../components/Charts';

type Tab = 'executive' | 'operations' | 'finance' | 'suppliers' | 'project';
const TABS: { key: Tab; label: string }[] = [
	{ key: 'executive', label: 'Executive' },
	{ key: 'operations', label: 'Operations' },
	{ key: 'finance', label: 'Finance' },
	{ key: 'suppliers', label: 'Suppliers' },
	{ key: 'project', label: 'Projects' },
];

type FilterParams = { company?: string; project?: string; from_date?: string; to_date?: string };

function Stat({ label, value, sub, tone, to }: { label: string; value: string; sub?: React.ReactNode; tone?: 'ok' | 'pend' | 'err'; to?: string }) {
	const body = (
		<>
			<div className="dkpi-l">{label}</div>
			<div className={`dkpi-v${tone ? ' ' + tone : ''}`}>{value}</div>
			{sub != null && <div className="dkpi-s">{sub}</div>}
		</>
	);
	return to ? <Link className="dkpi" to={to}>{body}</Link> : <div className="dkpi">{body}</div>;
}

function Card({ title, hint, wide, children }: { title: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
	return (
		<section className={wide ? 'dcard span2' : 'dcard'}>
			<div className="dcard-h">
				<span className="ttl">{title}</span>
				{hint && <span className="dcard-hint">{hint}</span>}
			</div>
			{children}
		</section>
	);
}

function Delta({ pct }: { pct: number }) {
	const up = pct >= 0;
	return <span className={`delta ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {fmtPercent(Math.abs(pct))}</span>;
}

export function Dashboard() {
	const [sp] = useSearchParams();
	const urlTab = sp.get('tab') as Tab | null;
	const [tab, setTab] = useState<Tab>(urlTab && TABS.some((t) => t.key === urlTab) ? urlTab : 'executive');
	const [company, setCompany] = useState('');
	const [project, setProject] = useState('');
	const [fromDate, setFromDate] = useState('');
	const [toDate, setToDate] = useState('');

	const params = useMemo(
		() => ({ company: company || undefined, project: project || undefined, from_date: fromDate || undefined, to_date: toDate || undefined }),
		[company, project, fromDate, toDate],
	);
	const key = JSON.stringify(params);

	const proc = useFrappeGetCall<{ message: DashboardData }>(API.dashboardData, params, `dash:${key}`, { revalidateOnFocus: false });
	const pay = useFrappeGetCall<{ message: PaymentDashboard }>(API.paymentDashboard, params, `pay:${key}`, { revalidateOnFocus: false });

	const d = proc.data?.message;
	const p = pay.data?.message;
	const opts = d?.filter_options;
	const scope = d?.filters.scope;

	return (
		<main className="page dash">
			<div className="phead">
				<div className="eyebrow">INSIGHTS</div>
				<h1>Dashboard</h1>
			</div>

			{/* filter bar */}
			<div className="filterbar">
				<div className="fb-field">
					<label>Company</label>
					<SearchSelect value={company} onChange={setCompany} placeholder="All companies"
						options={(opts?.companies ?? []).map((c) => ({ value: c, label: c }))} />
				</div>
				<div className="fb-field">
					<label>Project</label>
					<SearchSelect value={project} onChange={setProject} placeholder="All projects"
						options={(opts?.projects ?? []).map((pr) => ({ value: pr, label: pr }))} />
				</div>
				<div className="fb-field">
					<label>From</label>
					<input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
				</div>
				<div className="fb-field">
					<label>To</label>
					<input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
				</div>
				{(company || project || fromDate || toDate) && (
					<button className="fb-clear" onClick={() => { setCompany(''); setProject(''); setFromDate(''); setToDate(''); }}>Clear</button>
				)}
			</div>

			{scope && !scope.see_all && (
				<div className="scope-note">
					<Icon name="lock" size={13} /> Scoped view — figures are limited to your assigned projects{scope.projects && scope.projects.length === 0 ? ' (none assigned yet — ask an admin for project access)' : ''}.
				</div>
			)}

			<div className="dtabs">
				{TABS.map((t) => (
					<button key={t.key} className={tab === t.key ? 'dtab on' : 'dtab'} onClick={() => setTab(t.key)}>{t.label}</button>
				))}
			</div>

			{tab !== 'finance' && proc.isLoading && <div className="dload">Loading…</div>}
			{tab === 'finance' && pay.isLoading && <div className="dload">Loading…</div>}
			{proc.error && tab !== 'finance' && <div className="alert">Could not load dashboard.</div>}

			{tab === 'executive' && d && <Executive d={d} />}
			{tab === 'operations' && d && <Operations d={d} />}
			{tab === 'finance' && p && <Finance p={p} />}
			{tab === 'suppliers' && <Suppliers params={params} />}
			{tab === 'project' && <Projects params={params} />}
		</main>
	);
}

function Suppliers({ params }: { params: FilterParams }) {
	const res = useFrappeGetCall<{ message: SupplierAnalytics }>(API.supplierAnalytics, params, `sup:${JSON.stringify(params)}`, { revalidateOnFocus: false });
	const s = res.data?.message;
	if (res.isLoading) return <div className="dload">Loading…</div>;
	if (!s) return <div className="alert">Could not load supplier analytics.</div>;
	return (
		<>
			<div className="statgrid">
				<Stat label="Active suppliers" value={String(s.active_suppliers)} sub="with spend in range" />
				<Stat label="Total spend" value={fmtCompact(s.total_spend)} />
				<Stat label="Top-supplier share" value={fmtPercent(s.top_share.pct)} sub={s.top_share.supplier || '—'} />
				<Stat label="Total outstanding" value={fmtCompact(s.total_outstanding)} tone="err" to="/payments" />
			</div>
			<div className="dgrid">
				<Card title="Top suppliers by spend" wide><HBars data={s.spend} color="var(--iris)" /></Card>
				<Card title="Outstanding by supplier"><HBars data={s.outstanding} color="var(--err)" /></Card>
				<Card title="Spend concentration (Pareto)" hint="cumulative %">
					<div className="minitbl">
						{s.pareto.slice(0, 8).map((r) => (
							<div className="mrow" key={r.supplier} style={{ gridTemplateColumns: '1.6fr auto auto', cursor: 'default' }}>
								<span className="mb" title={r.supplier}>{r.supplier}</span>
								<span className="mc">{fmtCompact(r.spend)}</span>
								<span className="mtag">{fmtPercent(r.cumulative_pct)}</span>
							</div>
						))}
					</div>
				</Card>
				<PriceTrendCard params={params} />
				<Card title="Supplier scorecard" hint="lead time = PO→receipt; fill = received/ordered" wide>
					<table className="rtable">
						<thead><tr><th>Supplier</th><th className="r">Spend</th><th className="r">Lead time</th><th className="r">Fill rate</th><th className="r">Outstanding</th></tr></thead>
						<tbody>
							{s.scorecard.map((r) => (
								<tr key={r.supplier}>
									<td>{r.supplier}</td>
									<td className="r">{fmtMoney(r.spend, 'INR')}</td>
									<td className="r">{r.lead_time == null ? '—' : `${r.lead_time} d`}</td>
									<td className="r">{r.fill_rate == null ? '—' : fmtPercent(r.fill_rate)}</td>
									<td className="r">{r.outstanding ? fmtMoney(r.outstanding, 'INR') : '—'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</Card>
			</div>
		</>
	);
}

function Projects({ params }: { params: FilterParams }) {
	const res = useFrappeGetCall<{ message: ProjectPortfolio }>(API.projectPortfolio, params, `proj:${JSON.stringify(params)}`, { revalidateOnFocus: false });
	const pp = res.data?.message;
	if (res.isLoading) return <div className="dload">Loading…</div>;
	if (!pp) return <div className="alert">Could not load project portfolio.</div>;
	const t = pp.totals;
	const committed = pp.projects.map((p) => ({ label: p.project, value: p.committed })).filter((x) => x.value > 0).slice(0, 12);
	const outstanding = pp.projects.map((p) => ({ label: p.project, value: p.outstanding })).filter((x) => x.value > 0).slice(0, 12);
	return (
		<>
			<div className="statgrid">
				<Stat label="Committed (PO value)" value={fmtCompact(t.committed)} sub={`${pp.projects.length} projects`} />
				<Stat label="Received (GRN value)" value={fmtCompact(t.received)} />
				<Stat label="Paid" value={fmtCompact(t.paid)} tone="ok" />
				<Stat label="Outstanding" value={fmtCompact(t.outstanding)} tone="err" to="/payments" />
			</div>
			<div className="dgrid">
				<Card title="Committed by project" wide><HBars data={committed} color="var(--cyan)" /></Card>
				<Card title="Outstanding by project"><HBars data={outstanding} color="var(--err)" /></Card>
				<Card title="Project cost ledger" hint="committed → received → paid → outstanding" wide>
					<table className="rtable">
						<thead><tr><th>Project</th><th className="r">Committed</th><th className="r">Received</th><th className="r">Paid</th><th className="r">Outstanding</th></tr></thead>
						<tbody>
							{pp.projects.filter((p) => p.committed || p.received).map((p) => (
								<tr key={p.project}>
									<td>{p.project}</td>
									<td className="r">{fmtMoney(p.committed, 'INR')}</td>
									<td className="r">{fmtMoney(p.received, 'INR')}</td>
									<td className="r">{fmtMoney(p.paid, 'INR')}</td>
									<td className="r">{p.outstanding ? fmtMoney(p.outstanding, 'INR') : '—'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</Card>
			</div>
		</>
	);
}

function Executive({ d }: { d: DashboardData }) {
	const a = d.analytics;
	const topSuppliers = d.operations.top_suppliers.map((s) => ({ label: s.supplier, value: s.total }));
	return (
		<>
			<div className="statgrid">
				<Stat label="Total spend (placed POs)" value={fmtCompact(d.kpis.total_po_value.total)} sub={<Delta pct={d.overview.mom_growth} />} />
				<Stat label="Open commitments" value={fmtCompact(d.commitments.value)} sub={`${d.commitments.count} open PO${d.commitments.count === 1 ? '' : 's'}`} />
				<Stat label="Outstanding payable" value={fmtCompact(d.kpis.outstanding_amount.total)} tone="err" sub={`${fmtCompact(d.kpis.outstanding_amount.overdue)} over 30d`} to="/payments" />
				<Stat label="Top-supplier share" value={fmtPercent(a.top_supplier_share.value)} sub={a.top_supplier_share.supplier || '—'} />
				<Stat label="Avg / month" value={fmtCompact(d.overview.avg_monthly)} sub={`${d.kpis.purchase_orders.total} POs in range`} to="/purchase-orders" />
			</div>
			<div className="dgrid">
				<Card title="Monthly spend trend" hint="placed POs" wide><VBars data={d.overview.monthly_po_value} /></Card>
				<Card title="Spend by company"><HBars data={a.company_wise} color="var(--iris)" /></Card>
				<Card title="Spend by project (top 10)"><HBars data={a.project_wise} color="var(--cyan)" /></Card>
				<Card title="Top suppliers"><HBars data={topSuppliers} color="var(--iris-soft)" /></Card>
				<Card title="Spend by category"><Donut data={a.category_wise.map((c) => ({ label: c.label, value: c.value }))} /></Card>
			</div>
		</>
	);
}

function Operations({ d }: { d: DashboardData }) {
	const mr = d.kpis.material_requests, po = d.kpis.purchase_orders, pr = d.kpis.purchase_receipts;
	const funnel = [
		{ label: 'Material requests', count: mr.total },
		{ label: 'Purchase orders', count: po.total },
		{ label: 'Receipts', count: pr.total },
	];
	const conv = d.analytics.mr_to_po_conversion;
	return (
		<>
			<div className="statgrid">
				<Stat label="MRs pending approval" value={String(mr.pending ?? 0)} tone="pend" to="/approvals" />
				<Stat label="POs pending approval" value={String(po.pending ?? 0)} tone="pend" to="/approvals" />
				<Stat label="Receipts to complete" value={String((pr.total ?? 0) - (pr.completed ?? 0))} to="/receipts" />
				<Stat label="MR→PO conversion" value={fmtPercent(conv.value)} sub={`${conv.converted}/${conv.material_requests} MRs`} />
				<Stat label="Open commitments" value={fmtCompact(d.commitments.value)} sub={`${d.commitments.count} POs`} />
			</div>
			<div className="dgrid">
				<Card title="Procurement pipeline" hint="counts in range" wide><Funnel stages={funnel} /></Card>
				<Card title="MR status"><Donut money={false} data={[
					{ label: 'Approved', value: mr.approved ?? 0, color: 'var(--ok)' },
					{ label: 'Pending', value: mr.pending ?? 0, color: 'var(--pending)' },
					{ label: 'Rejected', value: mr.rejected ?? 0, color: 'var(--err)' },
				]} /></Card>
				<Card title="PO status"><Donut money={false} data={[
					{ label: 'Approved', value: po.approved ?? 0, color: 'var(--ok)' },
					{ label: 'Pending', value: po.pending ?? 0, color: 'var(--pending)' },
					{ label: 'Rejected', value: po.rejected ?? 0, color: 'var(--err)' },
				]} /></Card>
				<Card title="Recent purchase orders" wide>
					<MiniTable rows={d.operations.purchase_orders.map((r) => ({ to: `/purchase-orders/${r.name}`, a: r.name, b: r.supplier ?? '—', c: r.value != null ? fmtMoney(r.value, 'INR') : '', tag: r.status }))} />
				</Card>
				<Card title="Recent material requests" wide>
					<MiniTable rows={d.operations.material_requests.map((r) => ({ to: `/material-requests/${r.name}`, a: r.name, b: r.project ?? '—', c: r.priority ?? '', tag: r.status }))} />
				</Card>
			</div>
		</>
	);
}

function Finance({ p }: { p: PaymentDashboard }) {
	const k = p.kpis;
	const ageing = p.ageing.map((b) => ({ label: b.bucket + ' days', value: b.outstanding }));
	const bySup = p.outstanding_by_supplier.map((s) => ({ label: s.label, value: s.outstanding_amount }));
	const byProj = p.outstanding_by_project.map((s) => ({ label: s.label, value: s.outstanding_amount }));
	const statusDonut = Object.entries(p.status_summary)
		.filter(([s]) => s !== 'Zero')
		.map(([s, v]) => ({ label: s, value: v.outstanding_amount, color: s === 'Paid' ? 'var(--ok)' : s === 'Overdue' ? 'var(--err)' : s === 'Partial' ? 'var(--cyan)' : 'var(--pending)' }));
	const worklist = p.ledger_rows.filter((r) => r.outstanding_amount > 0).slice(0, 12);
	return (
		<>
			<div className="statgrid">
				<Stat label="Total outstanding" value={fmtCompact(k.total_outstanding_amount)} tone="err" sub={`${k.receipt_count} receipts`} to="/payments" />
				<Stat label="Settled" value={fmtPercent(k.paid_percent)} tone="ok" sub={`${fmtCompact(k.total_paid_amount)} paid`} />
				<Stat label="Overdue receipts" value={String(k.overdue_receipts)} tone="err" sub="over 30 days" />
				<Stat label="Avg days to pay" value={String(k.avg_payment_days)} sub="receipt → payment" />
				<Stat label="Total received value" value={fmtCompact(k.total_receipt_amount)} />
			</div>
			<div className="dgrid">
				<Card title="Outstanding by ageing" hint="days since receipt" wide><HBars data={ageing} color="var(--pending)" /></Card>
				<Card title="Payment status mix"><Donut data={statusDonut} /></Card>
				<Card title="Outstanding by supplier (top 10)"><HBars data={bySup} color="var(--err)" /></Card>
				<Card title="Outstanding by project (top 10)"><HBars data={byProj} color="var(--iris)" /></Card>
				<Card title="Payment run worklist" hint="oldest open receipts" wide>
					<MiniTable rows={worklist.map((r) => ({ to: `/receipts/${r.purchase_receipt}`, a: r.purchase_receipt, b: r.supplier, c: fmtMoney(r.outstanding_amount, 'INR'), tag: r.payment_status, sub: fmtDate(r.receipt_date) }))} />
				</Card>
			</div>
		</>
	);
}

function PriceTrendCard({ params }: { params: FilterParams }) {
	const [item, setItem] = useState('');
	const items = useFrappeGetCall<{ message: { name: string; item_name: string }[] }>(API.reportItems, {}, 'reportItems', { revalidateOnFocus: false });
	const tp = { ...params, item: item || undefined };
	const tr = useFrappeGetCall<{ message: { points: { date: string; rate: number; supplier: string }[]; count: number } }>(
		API.itemPriceTrend, tp, item ? `trend:${JSON.stringify(tp)}` : null, { revalidateOnFocus: false });
	const pts = (tr.data?.message.points ?? []).map((p) => ({ label: p.date, value: p.rate }));
	return (
		<Card title="Item price trend" hint="rate per purchase over time" wide>
			<div style={{ maxWidth: 320, marginBottom: 14 }}>
				<SearchSelect value={item} onChange={setItem} placeholder="Pick an item…"
					options={(items.data?.message ?? []).map((it) => ({ value: it.name, label: it.item_name || it.name }))} />
			</div>
			{!item ? <div className="chart-empty">Pick an item to see its purchase-rate trend</div>
				: tr.isLoading ? <div className="chart-empty">Loading…</div>
					: <LineChart points={pts} />}
		</Card>
	);
}

function MiniTable({ rows }: { rows: { to: string; a: string; b: string; c: string; tag?: string; sub?: string }[] }) {
	if (!rows.length) return <div className="chart-empty">Nothing here</div>;
	return (
		<div className="minitbl">
			{rows.map((r, i) => (
				<Link className="mrow" to={r.to} key={r.a + i}>
					<span className="ma">{r.a}</span>
					<span className="mb" title={r.b}>{r.b}</span>
					<span className="mc">{r.c}</span>
					{r.tag && <span className="mtag">{r.tag}</span>}
				</Link>
			))}
		</div>
	);
}
