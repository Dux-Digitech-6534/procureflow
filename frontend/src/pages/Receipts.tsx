import { useNavigate } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, payTone, type PrListRow } from '../lib/api';
import { fmtDate, fmtMoney } from '../lib/format';
import { Icon } from '../components/Icon';

export function Receipts() {
	const navigate = useNavigate();
	const { data, isLoading, error } = useFrappeGetCall<{ message: PrListRow[] }>(API.prList, {});
	const rows = data?.message ?? [];

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

			<section className="card">
				<div className="chead">
					<Icon name="package" size={16} />
					<span className="ttl">Purchase receipts</span>
					<span className="cnt">{rows.length}</span>
				</div>
				{error && <div className="empty"><div className="t2" style={{ color: 'var(--err)' }}>Could not load receipts.</div></div>}
				{isLoading && <div className="empty"><div className="t2">Loading…</div></div>}
				{!isLoading && !error && rows.length === 0 && (
					<div className="empty">
						<div className="t1">No receipts yet</div>
						<div className="t2">Record a receipt against an approved purchase order.</div>
					</div>
				)}
				{rows.length > 0 && (
					<div className="tablescroll">
						<table>
							<thead>
								<tr>
									<th>Receipt</th>
									<th>Supplier</th>
									<th>Project</th>
									<th style={{ textAlign: 'right' }}>Grand total</th>
									<th style={{ textAlign: 'right' }}>Paid</th>
									<th style={{ textAlign: 'right' }}>Outstanding</th>
									<th>Payment</th>
									<th>Date</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => (
									<tr key={r.name}>
										<td><span className="id">{r.name}</span></td>
										<td className="c1">{r.supplier_name ?? r.supplier}</td>
										<td className="c2">{r.custom_project_name ?? '—'}</td>
										<td style={{ textAlign: 'right' }}><span className="num">{fmtMoney(r.grand_total, 'INR')}</span></td>
										<td style={{ textAlign: 'right' }}><span className="num">{fmtMoney(r.paid, 'INR')}</span></td>
										<td style={{ textAlign: 'right' }}><span className="num">{fmtMoney(r.outstanding, 'INR')}</span></td>
										<td><span className={'tag ' + payTone(r.custom_payment_status)}>{r.custom_payment_status ?? 'Not Paid'}</span></td>
										<td><span className="dim">{fmtDate(r.posting_date)}</span></td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>
		</main>
	);
}
