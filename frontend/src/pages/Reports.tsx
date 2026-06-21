import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, type ReportResult } from '../lib/api';
import { fmtMoney, fmtDate, fmtNum } from '../lib/format';
import { downloadCsv } from '../lib/csv';
import { Icon, type IconName } from '../components/Icon';
import { SearchSelect } from '../components/form';

type ColType = 'text' | 'money' | 'date' | 'num' | 'pct' | 'tag' | 'link';
interface Col {
	key: string;
	label: string;
	type?: ColType;
	link?: (r: Record<string, unknown>) => string;
	align?: 'right';
}
interface StatusFilter {
	default: string;
	options: { value: string; label: string }[];
}
type FilterKey = 'date' | 'project' | 'supplier' | 'search' | 'item';
interface ReportDef {
	slug: string;
	title: string;
	desc: string;
	icon: IconName;
	filters: FilterKey[];
	searchLabel?: string;
	statusFilter?: StatusFilter;
	bucketFilter?: StatusFilter;
	requires?: 'item' | 'supplier';
	columns: Col[];
}

const PO_STATUS: StatusFilter = {
	default: 'Approved',
	options: [
		{ value: 'Approved', label: 'Approved' },
		{ value: 'Pending', label: 'Pending approval' },
		{ value: 'Rejected', label: 'Rejected' },
		{ value: 'Draft', label: 'Draft' },
		{ value: 'all', label: 'All statuses' },
	],
};
const MR_STATUS: StatusFilter = {
	default: 'Approved',
	options: [
		{ value: 'Approved', label: 'Approved' },
		{ value: 'Pending Approval', label: 'Pending approval' },
		{ value: 'Rejected', label: 'Rejected' },
		{ value: 'Draft', label: 'Draft' },
		{ value: 'all', label: 'All statuses' },
	],
};

export const REPORT_DEFS: ReportDef[] = [
	{
		slug: 'po-register', title: 'Purchase Order Register', icon: 'cube',
		desc: 'Every PO with net, tax, grand total, % received and status.',
		filters: ['date', 'project', 'supplier', 'search'], statusFilter: PO_STATUS,
		columns: [
			{ key: 'name', label: 'PO No.', type: 'link', link: (r) => `/purchase-orders/${r.name}` },
			{ key: 'transaction_date', label: 'Date', type: 'date' },
			{ key: 'supplier', label: 'Supplier' },
			{ key: 'custom_project_name', label: 'Project' },
			{ key: 'custom_test_company_', label: 'Company' },
			{ key: 'custom_category', label: 'Category' },
			{ key: 'total', label: 'Net', type: 'money', align: 'right' },
			{ key: 'total_taxes_and_charges', label: 'Tax', type: 'money', align: 'right' },
			{ key: 'grand_total', label: 'Grand Total', type: 'money', align: 'right' },
			{ key: 'custom_tax_type', label: 'Tax Type' },
			{ key: 'per_received', label: '% Recd', type: 'pct', align: 'right' },
			{ key: 'workflow_state', label: 'Status', type: 'tag' },
		],
	},
	{
		slug: 'mr-register', title: 'Material Request Register', icon: 'file-text',
		desc: 'Demand log — every MR with project, priority, % ordered and status.',
		filters: ['date', 'project', 'search'], statusFilter: MR_STATUS,
		columns: [
			{ key: 'name', label: 'MR No.', type: 'link', link: (r) => `/material-requests/${r.name}` },
			{ key: 'transaction_date', label: 'Date', type: 'date' },
			{ key: 'schedule_date', label: 'Required by', type: 'date' },
			{ key: 'custom_select_project_', label: 'Project' },
			{ key: 'custom_category', label: 'Category' },
			{ key: 'custom_priority', label: 'Priority' },
			{ key: 'owner', label: 'Requester' },
			{ key: 'per_ordered', label: '% Ordered', type: 'pct', align: 'right' },
			{ key: 'workflow_state', label: 'Status', type: 'tag' },
		],
	},
	{
		slug: 'grn-register', title: 'GRN / Receipt Register', icon: 'package',
		desc: 'Goods-inward log with grand total, paid, outstanding and payment status.',
		filters: ['date', 'project', 'supplier', 'search'],
		columns: [
			{ key: 'purchase_receipt', label: 'Receipt', type: 'link', link: (r) => `/receipts/${r.purchase_receipt}` },
			{ key: 'receipt_date', label: 'Posting Date', type: 'date' },
			{ key: 'supplier', label: 'Supplier' },
			{ key: 'project', label: 'Project' },
			{ key: 'total_amount', label: 'Grand Total', type: 'money', align: 'right' },
			{ key: 'paid_amount', label: 'Paid', type: 'money', align: 'right' },
			{ key: 'outstanding_amount', label: 'Outstanding', type: 'money', align: 'right' },
			{ key: 'payment_status', label: 'Payment', type: 'tag' },
		],
	},
	{
		slug: 'payment-register', title: 'Payment Register', icon: 'rupee',
		desc: 'Cash-out log — every payment with supplier, project and receipt.',
		filters: ['date', 'project', 'supplier', 'search'],
		columns: [
			{ key: 'name', label: 'Payment No.', type: 'link', link: (r) => `/payments/${r.name}` },
			{ key: 'payment_date', label: 'Date', type: 'date' },
			{ key: 'supplier', label: 'Supplier' },
			{ key: 'project', label: 'Project' },
			{ key: 'purchase_receipt', label: 'Receipt', type: 'link', link: (r) => `/receipts/${r.purchase_receipt}` },
			{ key: 'amount', label: 'Amount', type: 'money', align: 'right' },
		],
	},
	{
		slug: 'payment-worklist', title: 'Outstanding Supplier Payments', icon: 'banknote',
		desc: 'Receipts still owed to suppliers — oldest first — with paid, outstanding and progress.',
		filters: ['date', 'project', 'supplier', 'search'],
		columns: [
			{ key: 'purchase_receipt', label: 'Receipt', type: 'link', link: (r) => `/receipts/${r.purchase_receipt}` },
			{ key: 'supplier', label: 'Supplier' },
			{ key: 'project', label: 'Project' },
			{ key: 'receipt_date', label: 'Receipt Date', type: 'date' },
			{ key: 'total_amount', label: 'Total', type: 'money', align: 'right' },
			{ key: 'paid_amount', label: 'Paid', type: 'money', align: 'right' },
			{ key: 'outstanding_amount', label: 'Outstanding', type: 'money', align: 'right' },
			{ key: 'progress_percent', label: 'Progress', type: 'pct', align: 'right' },
			{ key: 'payment_status', label: 'Status', type: 'tag' },
		],
	},
	{
		slug: 'outstanding-ageing', title: 'Outstanding & Ageing', icon: 'clock',
		desc: 'Money owed, aged into 0-30 / 31-60 / 61-90 / 90+ day buckets.',
		filters: ['date', 'project', 'supplier'],
		bucketFilter: {
			default: 'all',
			options: [
				{ value: 'all', label: 'All buckets' },
				{ value: '0-30', label: '0–30 days' },
				{ value: '31-60', label: '31–60 days' },
				{ value: '61-90', label: '61–90 days' },
				{ value: '90+', label: '90+ days' },
			],
		},
		columns: [
			{ key: 'purchase_receipt', label: 'Receipt', type: 'link', link: (r) => `/receipts/${r.purchase_receipt}` },
			{ key: 'supplier', label: 'Supplier' },
			{ key: 'project', label: 'Project' },
			{ key: 'receipt_date', label: 'Posting Date', type: 'date' },
			{ key: 'days_outstanding', label: 'Days', type: 'num', align: 'right' },
			{ key: 'total_amount', label: 'Total', type: 'money', align: 'right' },
			{ key: 'paid_amount', label: 'Paid', type: 'money', align: 'right' },
			{ key: 'outstanding_amount', label: 'Outstanding', type: 'money', align: 'right' },
			{ key: 'bucket', label: 'Ageing', type: 'tag' },
		],
	},
	{
		slug: 'supplier-spend', title: 'Supplier Spend Analysis', icon: 'truck',
		desc: 'Spend, share, cumulative (Pareto) and outstanding per supplier.',
		filters: ['date', 'project'],
		columns: [
			{ key: 'supplier', label: 'Supplier' },
			{ key: 'po_count', label: 'POs', type: 'num', align: 'right' },
			{ key: 'total_spend', label: 'Spend', type: 'money', align: 'right' },
			{ key: 'pct', label: '% Spend', type: 'pct', align: 'right' },
			{ key: 'cumulative_pct', label: 'Cumulative %', type: 'pct', align: 'right' },
			{ key: 'outstanding', label: 'Outstanding', type: 'money', align: 'right' },
		],
	},
	{
		slug: 'project-spend', title: 'Project-wise Spend', icon: 'building',
		desc: 'Committed → received → paid → outstanding, per project.',
		filters: ['date', 'project'],
		columns: [
			{ key: 'project', label: 'Project' },
			{ key: 'committed', label: 'Committed', type: 'money', align: 'right' },
			{ key: 'received', label: 'Received', type: 'money', align: 'right' },
			{ key: 'paid', label: 'Paid', type: 'money', align: 'right' },
			{ key: 'outstanding', label: 'Outstanding', type: 'money', align: 'right' },
			{ key: 'receipts', label: 'Receipts', type: 'num', align: 'right' },
		],
	},
	{
		slug: 'item-history', title: 'Item Purchase History', icon: 'box',
		desc: 'Per-item buying ledger — qty, rate, GST and amount across POs.',
		filters: ['date', 'project', 'supplier', 'search'], searchLabel: 'Item',
		columns: [
			{ key: 'item_code', label: 'Item' },
			{ key: 'po_no', label: 'PO No.', type: 'link', link: (r) => `/purchase-orders/${r.po_no}` },
			{ key: 'transaction_date', label: 'Date', type: 'date' },
			{ key: 'supplier', label: 'Supplier' },
			{ key: 'project', label: 'Project' },
			{ key: 'qty', label: 'Qty', type: 'num', align: 'right' },
			{ key: 'uom', label: 'UOM' },
			{ key: 'rate', label: 'Rate', type: 'money', align: 'right' },
			{ key: 'gst_percent', label: 'GST %', type: 'pct', align: 'right' },
			{ key: 'rate_with_tax', label: 'Rate w/ tax', type: 'money', align: 'right' },
			{ key: 'amount', label: 'Amount', type: 'money', align: 'right' },
		],
	},
	{
		slug: 'gst-summary', title: 'GST Purchase Summary', icon: 'shield',
		desc: 'Taxable value, CGST / SGST / IGST and grand total by supplier & tax type.',
		filters: ['date', 'project', 'supplier'],
		columns: [
			{ key: 'supplier', label: 'Supplier' },
			{ key: 'tax_type', label: 'Tax Type' },
			{ key: 'taxable', label: 'Taxable', type: 'money', align: 'right' },
			{ key: 'cgst', label: 'CGST', type: 'money', align: 'right' },
			{ key: 'sgst', label: 'SGST', type: 'money', align: 'right' },
			{ key: 'igst', label: 'IGST', type: 'money', align: 'right' },
			{ key: 'total_tax', label: 'Total Tax', type: 'money', align: 'right' },
			{ key: 'grand_total', label: 'Grand Total', type: 'money', align: 'right' },
			{ key: 'po_count', label: 'POs', type: 'num', align: 'right' },
		],
	},
	{
		slug: 'item-comparison', title: 'Item Price Comparison', icon: 'box',
		desc: 'Compare one item across suppliers — latest/min/max/avg rate and % above the cheapest.',
		filters: ['item', 'date', 'project'], requires: 'item',
		columns: [
			{ key: 'supplier', label: 'Supplier' },
			{ key: 'uom', label: 'UOM' },
			{ key: 'po_count', label: 'POs', type: 'num', align: 'right' },
			{ key: 'first_rate', label: 'First Rate', type: 'money', align: 'right' },
			{ key: 'latest_rate', label: 'Latest Rate', type: 'money', align: 'right' },
			{ key: 'min_rate', label: 'Min', type: 'money', align: 'right' },
			{ key: 'max_rate', label: 'Max', type: 'money', align: 'right' },
			{ key: 'avg_rate', label: 'Avg', type: 'money', align: 'right' },
			{ key: 'pct_above_min', label: '% Above Min', type: 'pct', align: 'right' },
			{ key: 'last_purchase', label: 'Last Purchase', type: 'date' },
		],
	},
	{
		slug: 'supplier-statement', title: 'Supplier Statement of Account', icon: 'truck',
		desc: 'Per-supplier ledger — receipts (debit), payments (credit) and running balance.',
		filters: ['supplier', 'date', 'project'], requires: 'supplier',
		columns: [
			{ key: 'date', label: 'Date', type: 'date' },
			{ key: 'type', label: 'Type', type: 'tag' },
			{ key: 'document', label: 'Document' },
			{ key: 'project', label: 'Project' },
			{ key: 'debit', label: 'Debit (received)', type: 'money', align: 'right' },
			{ key: 'credit', label: 'Credit (paid)', type: 'money', align: 'right' },
			{ key: 'balance', label: 'Balance', type: 'money', align: 'right' },
		],
	},
];

const SOON: string[] = [];

export function Reports() {
	const { slug } = useParams();
	const def = REPORT_DEFS.find((r) => r.slug === slug);
	if (slug && def) return <ReportView def={def} />;
	return <Catalog />;
}

function Catalog() {
	return (
		<main className="page">
			<div className="eyebrow">Insights</div>
			<h1>Reports</h1>
			<p className="lead">Filterable, exportable registers across the buying cycle.</p>
			<div className="rcat">
				{REPORT_DEFS.map((r) => (
					<Link className="rcard" to={`/reports/${r.slug}`} key={r.slug}>
						<div className="rcard-ic"><Icon name={r.icon} size={18} /></div>
						<div className="rcard-t">{r.title}</div>
						<div className="rcard-d">{r.desc}</div>
					</Link>
				))}
				{SOON.map((s) => (
					<div className="rcard soon" key={s}>
						<div className="rcard-ic"><Icon name="file-text" size={18} /></div>
						<div className="rcard-t">{s}</div>
						<div className="rcard-d">Coming soon</div>
					</div>
				))}
			</div>
		</main>
	);
}

interface PoCtx { suppliers: { name: string; supplier_name: string }[]; projects: { name: string; project_name: string }[]; }

function ReportView({ def }: { def: ReportDef }) {
	const [sp] = useSearchParams();
	const [project, setProject] = useState(sp.get('project') ?? '');
	const [supplier, setSupplier] = useState(sp.get('supplier') ?? '');
	const [fromDate, setFromDate] = useState(sp.get('from_date') ?? '');
	const [toDate, setToDate] = useState(sp.get('to_date') ?? '');
	const [search, setSearch] = useState(sp.get('search') ?? '');
	const [status, setStatus] = useState(sp.get('state') ?? def.statusFilter?.default ?? '');
	const [bucket, setBucket] = useState(sp.get('bucket') ?? def.bucketFilter?.default ?? '');
	const [item, setItem] = useState(sp.get('item') ?? '');

	const ctx = useFrappeGetCall<{ message: PoCtx }>(API.poContext, {}, 'poctx', { revalidateOnFocus: false });
	const hasItem = def.filters.includes('item');
	const itemsRes = useFrappeGetCall<{ message: { name: string; item_name: string }[] }>(API.reportItems, {}, hasItem ? 'reportItems' : null, { revalidateOnFocus: false });
	// A report that requires a picked item/supplier shows a prompt until one is chosen.
	const blocked = (def.requires === 'item' && !item) || (def.requires === 'supplier' && !supplier);
	const params = useMemo(
		() => ({ report: def.slug, project: project || undefined, supplier: supplier || undefined, from_date: fromDate || undefined, to_date: toDate || undefined, search: search || undefined, item: item || undefined, state: status && status !== 'all' ? status : undefined, bucket: bucket && bucket !== 'all' ? bucket : undefined, limit: 1000 }),
		[def.slug, project, supplier, fromDate, toDate, search, item, status, bucket],
	);
	const res = useFrappeGetCall<{ message: ReportResult }>(API.reportData, params, blocked ? null : `${def.slug}:${JSON.stringify(params)}`, { revalidateOnFocus: false });
	const rows = res.data?.message.rows ?? [];
	const total = res.data?.message.total ?? 0;

	function csv() {
		const data = rows.map((r) => def.columns.map((c) => {
			const v = r[c.key];
			return c.type === 'money' || c.type === 'pct' || c.type === 'num' ? (v == null ? '' : Number(v)) : (v as string);
		}));
		downloadCsv(`${def.slug}.csv`, def.columns.map((c) => c.label), data);
	}
	function exportQp() {
		const qp = new URLSearchParams({ report: def.slug });
		if (project) qp.set('project', project);
		if (supplier) qp.set('supplier', supplier);
		if (fromDate) qp.set('from_date', fromDate);
		if (toDate) qp.set('to_date', toDate);
		if (search) qp.set('search', search);
		if (item) qp.set('item', item);
		if (status && status !== 'all') qp.set('state', status);
		if (bucket && bucket !== 'all') qp.set('bucket', bucket);
		return qp.toString();
	}
	function xlsx() { window.open(`/api/method/${API.exportReportXlsx}?${exportQp()}`, '_blank'); }
	function pdf() { window.open(`/api/method/${API.exportReportPdf}?${exportQp()}`, '_blank'); }

	const dirty = project || supplier || fromDate || toDate || search || item || status !== (def.statusFilter?.default ?? '') || bucket !== (def.bucketFilter?.default ?? '');

	return (
		<main className="page">
			<div className="rhead">
				<div>
					<div className="eyebrow"><Link to="/reports" className="rback">Reports</Link> · {total} rows</div>
					<h1>{def.title}</h1>
				</div>
				<div className="rbtns">
					<button className="rbtn ghost" onClick={csv} disabled={!rows.length}><Icon name="download" size={15} /> CSV</button>
					<button className="rbtn ghost" onClick={pdf} disabled={!rows.length}><Icon name="file" size={15} /> PDF</button>
					<button className="rbtn" onClick={xlsx} disabled={!rows.length}><Icon name="download" size={15} /> Excel</button>
				</div>
			</div>

			<div className="filterbar">
				{def.filters.includes('item') && (
					<div className="fb-field">
						<label>Item{def.requires === 'item' ? ' *' : ''}</label>
						<SearchSelect value={item} onChange={setItem} placeholder="Select an item…"
							options={(itemsRes.data?.message ?? []).map((it) => ({ value: it.name, label: it.item_name || it.name }))} />
					</div>
				)}
				{def.statusFilter && (
					<div className="fb-field">
						<label>Status</label>
						<SearchSelect value={status} onChange={setStatus} placeholder="All statuses" options={def.statusFilter.options} />
					</div>
				)}
				{def.bucketFilter && (
					<div className="fb-field">
						<label>Ageing bucket</label>
						<SearchSelect value={bucket} onChange={setBucket} placeholder="All buckets" options={def.bucketFilter.options} />
					</div>
				)}
				{def.filters.includes('project') && (
					<div className="fb-field">
						<label>Project</label>
						<SearchSelect value={project} onChange={setProject} placeholder="All projects"
							options={(ctx.data?.message.projects ?? []).map((p) => ({ value: p.name, label: p.project_name || p.name }))} />
					</div>
				)}
				{def.filters.includes('supplier') && (
					<div className="fb-field">
						<label>Supplier{def.requires === 'supplier' ? ' *' : ''}</label>
						<SearchSelect value={supplier} onChange={setSupplier} placeholder={def.requires === 'supplier' ? 'Select a supplier…' : 'All suppliers'}
							options={(ctx.data?.message.suppliers ?? []).map((s) => ({ value: s.name, label: s.supplier_name || s.name }))} />
					</div>
				)}
				{def.filters.includes('date') && (
					<>
						<div className="fb-field"><label>From</label><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
						<div className="fb-field"><label>To</label><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
					</>
				)}
				{def.filters.includes('search') && (
					<div className="fb-field" style={{ flex: 1, minWidth: 180 }}>
						<label>{def.searchLabel ?? 'Search'}</label>
						<input type="text" placeholder={`${def.searchLabel ?? 'Search'}…`} value={search} onChange={(e) => setSearch(e.target.value)} />
					</div>
				)}
				{dirty && (
					<button className="fb-clear" onClick={() => { setProject(''); setSupplier(''); setFromDate(''); setToDate(''); setSearch(''); setItem(''); setStatus(def.statusFilter?.default ?? ''); setBucket(def.bucketFilter?.default ?? ''); }}>Clear</button>
				)}
			</div>

			<div className="rtable-wrap">
				{blocked ? <div className="chart-empty">Pick {def.requires === 'item' ? 'an item' : 'a supplier'} above to run this report.</div>
					: res.isLoading ? <div className="dload">Loading…</div>
					: !rows.length ? <div className="chart-empty">No rows match these filters</div>
						: (
							<table className="rtable">
								<thead><tr>{def.columns.map((c) => <th key={c.key} className={c.align === 'right' ? 'r' : ''}>{c.label}</th>)}</tr></thead>
								<tbody>
									{rows.map((r, i) => (
										<tr key={i}>{def.columns.map((c) => <td key={c.key} className={c.align === 'right' ? 'r' : ''}>{renderCell(r, c)}</td>)}</tr>
									))}
								</tbody>
							</table>
						)}
			</div>
		</main>
	);
}

function renderCell(r: Record<string, unknown>, c: Col) {
	const v = r[c.key];
	if (c.type === 'link' && c.link) return <Link className="rlink" to={c.link(r)}>{String(v ?? '—')}</Link>;
	if (v == null || v === '') return <span className="rmute">—</span>;
	if (c.type === 'money') return fmtMoney(Number(v), 'INR');
	if (c.type === 'date') return fmtDate(String(v));
	if (c.type === 'num') return fmtNum(Number(v));
	if (c.type === 'pct') return `${fmtNum(Number(v), 0)}%`;
	if (c.type === 'tag') return <span className="rtag">{String(v)}</span>;
	return String(v);
}
