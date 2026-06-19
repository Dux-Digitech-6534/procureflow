import { useNavigate } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, payTone, type PrListRow } from '../lib/api';
import { fmtDate, fmtMoney } from '../lib/format';
import { Icon } from '../components/Icon';
import { DataTable, type Column, type Filter } from '../components/DataTable';

export function Receipts() {
	const navigate = useNavigate();
	const { data, isLoading, error } = useFrappeGetCall<{ message: PrListRow[] }>(API.prList, {});
	const rows = data?.message ?? [];

	const columns: Column<PrListRow>[] = [
		{ key: 'name', header: 'Receipt', sortValue: (r) => r.name, render: (r) => <span className="id">{r.name}</span> },
		{ key: 'supplier', header: 'Supplier', sortValue: (r) => r.supplier_name ?? r.supplier, render: (r) => <span className="c1">{r.supplier_name ?? r.supplier}</span> },
		{ key: 'project', header: 'Project', sortValue: (r) => r.custom_project_name, render: (r) => <span className="c2">{r.custom_project_name ?? '—'}</span> },
		{ key: 'total', header: 'Grand total', align: 'right', sortValue: (r) => r.grand_total ?? 0, render: (r) => <span className="num">{fmtMoney(r.grand_total, 'INR')}</span> },
		{ key: 'paid', header: 'Paid', align: 'right', sortValue: (r) => r.paid, render: (r) => <span className="num">{fmtMoney(r.paid, 'INR')}</span> },
		{ key: 'outstanding', header: 'Outstanding', align: 'right', sortValue: (r) => r.outstanding, render: (r) => <span className="num">{fmtMoney(r.outstanding, 'INR')}</span> },
		{ key: 'payment', header: 'Payment', sortValue: (r) => r.custom_payment_status ?? 'Not Paid', render: (r) => <span className={'tag ' + payTone(r.custom_payment_status)}>{r.custom_payment_status ?? 'Not Paid'}</span> },
		{ key: 'date', header: 'Date', sortValue: (r) => r.posting_date, render: (r) => <span className="dim">{fmtDate(r.posting_date)}</span> },
	];

	const filters: Filter<PrListRow>[] = [
		{ type: 'select', key: 'payment', label: 'Payment', value: (r) => r.custom_payment_status ?? 'Not Paid' },
		{ type: 'select', key: 'supplier', label: 'Supplier', value: (r) => r.supplier_name ?? r.supplier },
		{ type: 'select', key: 'project', label: 'Project', value: (r) => r.custom_project_name },
		{ type: 'dateRange', key: 'date', label: 'Posting date', value: (r) => r.posting_date },
	];

	return (
		<main>
			<div className="eyebrow">Buying</div>
			<div className="titlebar">
				<h1 style={{ fontFamily: 'var(--font-ui)', color: 'var(--fg-1)' }}>Receipts</h1>
				<div className="spacer" />
				<button className="btn primary" onClick={() => navigate('/receipts/new')}>
					<Icon name="plus" size={14} /> New receipt
				</button>
			</div>

			<DataTable
				title="Purchase receipts"
				icon="package"
				rows={rows}
				columns={columns}
				rowKey={(r) => r.name}
				searchText={(r) => `${r.name} ${r.supplier_name ?? r.supplier ?? ''} ${r.custom_project_name ?? ''}`}
				searchPlaceholder="Search id / supplier / project…"
				filters={filters}
				loading={isLoading}
				error={error ? 'Could not load receipts.' : undefined}
				emptyTitle="No receipts yet"
				emptyText="Record a receipt against an approved purchase order."
			/>
		</main>
	);
}
