import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, payTone, type PaymentListRow, type PrListRow } from '../lib/api';
import { fmtDate, fmtMoney } from '../lib/format';
import { DataTable, type Column, type Filter } from '../components/DataTable';
import { RecordPaymentModal } from '../components/RecordPaymentModal';

export function Payments() {
	const navigate = useNavigate();
	const prRes = useFrappeGetCall<{ message: PrListRow[] }>(API.prList, {});
	const payRes = useFrappeGetCall<{ message: PaymentListRow[] }>(API.paymentList, {});
	const payable = (prRes.data?.message ?? []).filter((r) => r.outstanding > 0.001);
	const history = payRes.data?.message ?? [];
	const [target, setTarget] = useState<PrListRow | null>(null);

	function refetch() {
		prRes.mutate();
		payRes.mutate();
	}

	const payableCols: Column<PrListRow>[] = [
		{ key: 'name', header: 'Receipt', sortValue: (r) => r.name, render: (r) => <span className="id">{r.name}</span> },
		{ key: 'supplier', header: 'Supplier', sortValue: (r) => r.supplier_name ?? r.supplier, render: (r) => <span className="c1">{r.supplier_name ?? r.supplier}</span> },
		{ key: 'project', header: 'Project', sortValue: (r) => r.custom_project_name, render: (r) => <span className="c2">{r.custom_project_name ?? '—'}</span> },
		{ key: 'total', header: 'Grand total', align: 'right', sortValue: (r) => r.grand_total ?? 0, render: (r) => <span className="num">{fmtMoney(r.grand_total, 'INR')}</span> },
		{ key: 'outstanding', header: 'Outstanding', align: 'right', sortValue: (r) => r.outstanding, render: (r) => <span className="num">{fmtMoney(r.outstanding, 'INR')}</span> },
		{ key: 'status', header: 'Status', sortValue: (r) => r.custom_payment_status ?? 'Not Paid', render: (r) => <span className={'tag ' + payTone(r.custom_payment_status)}>{r.custom_payment_status ?? 'Not Paid'}</span> },
		{
			key: 'actions',
			header: '',
			align: 'right',
			render: (r) => (
				<button
					className="btn primary"
					style={{ padding: '5px 12px', fontSize: 12.5 }}
					onClick={(e) => {
						e.stopPropagation();
						setTarget(r);
					}}
				>
					Record payment
				</button>
			),
		},
	];

	const payableFilters: Filter<PrListRow>[] = [
		{ type: 'select', key: 'supplier', label: 'Supplier', value: (r) => r.supplier_name ?? r.supplier },
		{ type: 'select', key: 'project', label: 'Project', value: (r) => r.custom_project_name },
	];

	const historyCols: Column<PaymentListRow>[] = [
		{ key: 'name', header: 'Payment', sortValue: (r) => r.name, render: (r) => <span className="id">{r.name}</span> },
		{ key: 'receipt', header: 'Receipt', sortValue: (r) => r.purchase_receipt, render: (r) => <span className="id">{r.purchase_receipt}</span> },
		{ key: 'supplier', header: 'Supplier', sortValue: (r) => r.supplier, render: (r) => <span className="c1">{r.supplier}</span> },
		{ key: 'project', header: 'Project', sortValue: (r) => r.project, render: (r) => <span className="c2">{r.project ?? '—'}</span> },
		{ key: 'amount', header: 'Amount', align: 'right', sortValue: (r) => r.amount, render: (r) => <span className="num">{fmtMoney(r.amount, 'INR')}</span> },
		{ key: 'date', header: 'Date', sortValue: (r) => r.payment_date, render: (r) => <span className="dim">{fmtDate(r.payment_date)}</span> },
	];

	const historyFilters: Filter<PaymentListRow>[] = [
		{ type: 'select', key: 'supplier', label: 'Supplier', value: (r) => r.supplier },
		{ type: 'select', key: 'project', label: 'Project', value: (r) => r.project },
		{ type: 'dateRange', key: 'date', label: 'Payment date', value: (r) => r.payment_date },
	];

	return (
		<main>
			<div className="eyebrow">Procurement · finance</div>
			<div className="titlebar">
				<h1 style={{ fontFamily: 'var(--font-ui)', color: 'var(--fg-1)' }}>Payments</h1>
			</div>

			<div className="stack">
				<DataTable
					title="Outstanding receipts"
					icon="rupee"
					rows={payable}
					columns={payableCols}
					rowKey={(r) => r.name}
					onRowClick={(r) => navigate('/receipts/' + r.name)}
					searchText={(r) => `${r.name} ${r.supplier_name ?? r.supplier ?? ''} ${r.custom_project_name ?? ''}`}
					searchPlaceholder="Search receipt / supplier…"
					filters={payableFilters}
					loading={prRes.isLoading}
					error={prRes.error ? 'Could not load receipts.' : undefined}
					emptyTitle="Nothing outstanding"
					emptyText="All receipts are fully paid."
				/>

				<DataTable
					title="Recent payments"
					icon="banknote"
					rows={history}
					columns={historyCols}
					rowKey={(r) => r.name}
					onRowClick={(r) => navigate('/payments/' + r.name)}
					searchText={(r) => `${r.name} ${r.purchase_receipt} ${r.supplier} ${r.project ?? ''}`}
					searchPlaceholder="Search payment / receipt / supplier…"
					filters={historyFilters}
					loading={payRes.isLoading}
					error={payRes.error ? 'Could not load payments.' : undefined}
					emptyTitle="No payments recorded yet"
				/>
			</div>

			{target && <RecordPaymentModal pr={target} onClose={() => setTarget(null)} onSaved={() => { setTarget(null); refetch(); }} />}
		</main>
	);
}
