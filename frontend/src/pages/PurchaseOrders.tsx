import { useNavigate } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, poDisplayStatus, type PoListRow } from '../lib/api';
import { fmtDate, fmtMoney } from '../lib/format';
import { Icon } from '../components/Icon';
import { ActionButtons } from '../components/ActionButtons';
import { DataTable, type Column, type Filter } from '../components/DataTable';

export function PurchaseOrders() {
	const navigate = useNavigate();
	const { data, isLoading, error, mutate } = useFrappeGetCall<{ message: PoListRow[] }>(API.poList, {});
	const rows = data?.message ?? [];

	const columns: Column<PoListRow>[] = [
		{ key: 'name', header: 'Order', sortValue: (r) => r.name, render: (r) => <span className="id">{r.name}</span> },
		{ key: 'supplier', header: 'Supplier', sortValue: (r) => r.supplier_name ?? r.supplier, render: (r) => <span className="c1">{r.supplier_name ?? r.supplier}</span> },
		{ key: 'project', header: 'Project', sortValue: (r) => r.custom_project_name, render: (r) => <span className="c2">{r.custom_project_name ?? '—'}</span> },
		{ key: 'items', header: 'Items', sortValue: (r) => r.items, render: (r) => <span className="num">{r.items}</span> },
		{ key: 'date', header: 'Date', sortValue: (r) => r.transaction_date, render: (r) => <span className="dim">{fmtDate(r.transaction_date)}</span> },
		{ key: 'total', header: 'Grand total', align: 'right', sortValue: (r) => r.grand_total ?? 0, render: (r) => <span className="num">{fmtMoney(r.grand_total, 'INR')}</span> },
		{
			key: 'status',
			header: 'Status',
			sortValue: (r) => poDisplayStatus(r).label,
			render: (r) => {
				const s = poDisplayStatus(r);
				return <span className={'tag ' + s.tone}>{s.label}</span>;
			},
		},
		{
			key: 'actions',
			header: '',
			align: 'right',
			render: (r) => (r.actions?.length ? <ActionButtons doctype="Purchase Order" name={r.name} actions={r.actions} onDone={mutate} /> : null),
		},
	];

	const filters: Filter<PoListRow>[] = [
		{ type: 'select', key: 'status', label: 'Status', value: (r) => poDisplayStatus(r).label },
		{ type: 'select', key: 'supplier', label: 'Supplier', value: (r) => r.supplier_name ?? r.supplier },
		{ type: 'select', key: 'project', label: 'Project', value: (r) => r.custom_project_name },
		{ type: 'select', key: 'category', label: 'Category', value: (r) => r.custom_category },
		{ type: 'dateRange', key: 'date', label: 'Order date', value: (r) => r.transaction_date },
	];

	return (
		<main>
			<div className="eyebrow">Buying</div>
			<div className="titlebar">
				<h1 style={{ fontFamily: 'var(--font-ui)', color: 'var(--fg-1)' }}>Purchase orders</h1>
				<div className="spacer" />
				<button className="btn primary" onClick={() => navigate('/purchase-orders/new')}>
					<Icon name="plus" size={14} /> New order
				</button>
			</div>

			<DataTable
				title="All orders"
				icon="cube"
				rows={rows}
				columns={columns}
				rowKey={(r) => r.name}
				onRowClick={(r) => navigate('/purchase-orders/' + r.name)}
				searchText={(r) => `${r.name} ${r.supplier_name ?? r.supplier ?? ''} ${r.custom_project_name ?? ''}`}
				searchPlaceholder="Search id / supplier / project…"
				filters={filters}
				loading={isLoading}
				error={error ? 'Could not load orders.' : undefined}
				emptyTitle="No purchase orders yet"
				emptyText="Create one from an approved material request or from scratch."
			/>
		</main>
	);
}
