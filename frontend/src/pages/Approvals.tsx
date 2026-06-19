import { useNavigate } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, type PendingApprovals } from '../lib/api';
import { fmtDate, fmtMoney } from '../lib/format';
import { Icon } from '../components/Icon';
import { ActionButtons } from '../components/ActionButtons';
import { EmptyMsg } from '../components/ui';

export function Approvals() {
	const navigate = useNavigate();
	const { data, isLoading, error, mutate } = useFrappeGetCall<{ message: PendingApprovals }>(
		API.pendingApprovals,
		{},
	);
	const mrs = data?.message?.material_requests ?? [];
	const pos = data?.message?.purchase_orders ?? [];
	const total = mrs.length + pos.length;

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
					<section className="card">
						<div className="chead">
							<Icon name="file-text" size={16} />
							<span className="ttl">Material requests</span>
							<span className="cnt">{mrs.length}</span>
						</div>
						<div className="tablescroll">
							<table className="clickable">
								<thead>
									<tr>
										<th>Request</th>
										<th>Category</th>
										<th>Project</th>
										<th>Priority</th>
										<th>Raised by</th>
										<th>Date</th>
										<th />
									</tr>
								</thead>
								<tbody>
									{mrs.map((r) => (
										<tr key={r.name} onClick={() => navigate('/material-requests/' + r.name)}>
											<td><span className="id">{r.name}</span></td>
											<td className="c1">{r.custom_category ?? '—'}</td>
											<td className="c2">{r.custom_select_project_ ?? '—'}</td>
											<td>{r.custom_priority ?? '—'}</td>
											<td className="dim">{r.owner}</td>
											<td><span className="dim">{fmtDate(r.transaction_date)}</span></td>
											<td style={{ textAlign: 'right' }}>
												<ActionButtons doctype="Material Request" name={r.name} actions={r.actions} onDone={mutate} />
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				)}

				{pos.length > 0 && (
					<section className="card">
						<div className="chead">
							<Icon name="cube" size={16} />
							<span className="ttl">Purchase orders</span>
							<span className="cnt">{pos.length}</span>
						</div>
						<div className="tablescroll">
							<table className="clickable">
								<thead>
									<tr>
										<th>Order</th>
										<th>Supplier</th>
										<th>Project</th>
										<th style={{ textAlign: 'right' }}>Grand total</th>
										<th>Date</th>
										<th />
									</tr>
								</thead>
								<tbody>
									{pos.map((r) => (
										<tr key={r.name} onClick={() => navigate('/purchase-orders/' + r.name)}>
											<td><span className="id">{r.name}</span></td>
											<td className="c1">{r.supplier_name ?? r.supplier}</td>
											<td className="c2">{r.custom_project_name ?? '—'}</td>
											<td style={{ textAlign: 'right' }}><span className="num">{fmtMoney(r.grand_total, 'INR')}</span></td>
											<td><span className="dim">{fmtDate(r.transaction_date)}</span></td>
											<td style={{ textAlign: 'right' }}>
												<ActionButtons doctype="Purchase Order" name={r.name} actions={r.actions} onDone={mutate} />
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				)}
			</div>
		</main>
	);
}
