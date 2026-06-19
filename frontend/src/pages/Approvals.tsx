import { useNavigate } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, type PendingApprovals, type PendingMr, type PendingPo } from '../lib/api';
import { fmtDate, fmtMoney } from '../lib/format';
import { ActionButtons } from '../components/ActionButtons';
import { EmptyMsg } from '../components/ui';
import { DataTable, type Column, type Filter } from '../components/DataTable';

const PRIORITY_RANK: Record<string, number> = { Low: 1, Medium: 2, High: 3 };

export function Approvals() {
	const navigate = useNavigate();
	const { data, isLoading, error, mutate } = useFrappeGetCall<{ message: PendingApprovals }>(
		API.pendingApprovals,
		{},
	);
	const mrs = data?.message?.material_requests ?? [];
	const pos = data?.message?.purchase_orders ?? [];
	const total = mrs.length + pos.length;

	const mrCols: Column<PendingMr>[] = [
		{ key: 'name', header: 'Request', sortValue: (r) => r.name, render: (r) => <span className="id">{r.name}</span> },
		{ key: 'category', header: 'Category', sortValue: (r) => r.custom_category, render: (r) => <span className="c1">{r.custom_category ?? '—'}</span> },
		{ key: 'project', header: 'Project', sortValue: (r) => r.custom_select_project_, render: (r) => <span className="c2">{r.custom_select_project_ ?? '—'}</span> },
		{ key: 'priority', header: 'Priority', sortValue: (r) => PRIORITY_RANK[r.custom_priority ?? ''] ?? 0, render: (r) => r.custom_priority ?? '—' },
		{ key: 'owner', header: 'Raised by', sortValue: (r) => r.owner, render: (r) => <span className="dim">{r.owner}</span> },
		{ key: 'date', header: 'Date', sortValue: (r) => r.transaction_date, render: (r) => <span className="dim">{fmtDate(r.transaction_date)}</span> },
		{ key: 'actions', header: '', align: 'right', render: (r) => <ActionButtons doctype="Material Request" name={r.name} actions={r.actions} onDone={mutate} /> },
	];

	const mrFilters: Filter<PendingMr>[] = [
		{ type: 'select', key: 'category', label: 'Category', value: (r) => r.custom_category },
		{ type: 'select', key: 'project', label: 'Project', value: (r) => r.custom_select_project_ },
		{ type: 'select', key: 'priority', label: 'Priority', value: (r) => r.custom_priority },
	];

	const poCols: Column<PendingPo>[] = [
		{ key: 'name', header: 'Order', sortValue: (r) => r.name, render: (r) => <span className="id">{r.name}</span> },
		{ key: 'supplier', header: 'Supplier', sortValue: (r) => r.supplier_name ?? r.supplier, render: (r) => <span className="c1">{r.supplier_name ?? r.supplier}</span> },
		{ key: 'project', header: 'Project', sortValue: (r) => r.custom_project_name, render: (r) => <span className="c2">{r.custom_project_name ?? '—'}</span> },
		{ key: 'total', header: 'Grand total', align: 'right', sortValue: (r) => r.grand_total ?? 0, render: (r) => <span className="num">{fmtMoney(r.grand_total, 'INR')}</span> },
		{ key: 'date', header: 'Date', sortValue: (r) => r.transaction_date, render: (r) => <span className="dim">{fmtDate(r.transaction_date)}</span> },
		{ key: 'actions', header: '', align: 'right', render: (r) => <ActionButtons doctype="Purchase Order" name={r.name} actions={r.actions} onDone={mutate} /> },
	];

	const poFilters: Filter<PendingPo>[] = [
		{ type: 'select', key: 'supplier', label: 'Supplier', value: (r) => r.supplier_name ?? r.supplier },
		{ type: 'select', key: 'project', label: 'Project', value: (r) => r.custom_project_name },
	];

	return (
		<main>
			<div className="eyebrow">Procurement</div>
			<div className="titlebar">
				<h1 style={{ fontFamily: 'var(--font-ui)', color: 'var(--fg-1)' }}>Approvals</h1>
				<div className="spacer" />
				{total > 0 && <span className="tag pend">{total} pending</span>}
			</div>

			{isLoading && <div className="card"><div className="empty"><div className="t2">Loading…</div></div></div>}
			{error && (
				<div className="card"><div className="empty"><div className="t2" style={{ color: 'var(--err)' }}>Could not load approvals.</div></div></div>
			)}

			{!isLoading && !error && total === 0 && (
				<section className="card">
					<EmptyMsg title="Nothing awaiting your approval" text="Approved and rejected items move out of this list." />
				</section>
			)}

			<div className="stack">
				{mrs.length > 0 && (
					<DataTable
						title="Material requests"
						icon="file-text"
						rows={mrs}
						columns={mrCols}
						rowKey={(r) => r.name}
						onRowClick={(r) => navigate('/material-requests/' + r.name)}
						searchText={(r) => `${r.name} ${r.custom_category ?? ''} ${r.custom_select_project_ ?? ''} ${r.owner}`}
						searchPlaceholder="Search request…"
						filters={mrFilters}
					/>
				)}

				{pos.length > 0 && (
					<DataTable
						title="Purchase orders"
						icon="cube"
						rows={pos}
						columns={poCols}
						rowKey={(r) => r.name}
						onRowClick={(r) => navigate('/purchase-orders/' + r.name)}
						searchText={(r) => `${r.name} ${r.supplier_name ?? r.supplier ?? ''} ${r.custom_project_name ?? ''}`}
						searchPlaceholder="Search order…"
						filters={poFilters}
					/>
				)}
			</div>
		</main>
	);
}
