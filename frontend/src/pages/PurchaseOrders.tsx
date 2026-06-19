import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, stateTag, type PoListRow } from '../lib/api';
import { fmtDate, fmtMoney } from '../lib/format';
import { Icon } from '../components/Icon';

export function PurchaseOrders() {
	const navigate = useNavigate();
	const [search, setSearch] = useState('');
	const { data, isLoading, error } = useFrappeGetCall<{ message: PoListRow[] }>(API.poList, {});
	const rows = data?.message ?? [];

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter(
			(r) =>
				r.name.toLowerCase().includes(q) ||
				(r.supplier_name ?? r.supplier ?? '').toLowerCase().includes(q) ||
				(r.custom_project_name ?? '').toLowerCase().includes(q),
		);
	}, [rows, search]);

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

			<section className="card">
				<div className="chead">
					<Icon name="cube" size={16} />
					<span className="ttl">All orders</span>
					<span className="cnt">{rows.length}</span>
					<div className="spacer" />
					<input
						className="inp"
						style={{ height: 34, width: 240 }}
						placeholder="Search id / supplier / project…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>

				{error && (
					<div className="empty"><div className="t2" style={{ color: 'var(--err)' }}>Could not load orders.</div></div>
				)}
				{isLoading && <div className="empty"><div className="t2">Loading…</div></div>}
				{!isLoading && !error && filtered.length === 0 && (
					<div className="empty">
						<div className="t1">No purchase orders yet</div>
						<div className="t2">Create one from an approved material request or from scratch.</div>
					</div>
				)}

				{filtered.length > 0 && (
					<div className="tablescroll">
						<table className="clickable">
							<thead>
								<tr>
									<th>Order</th>
									<th>Supplier</th>
									<th>Project</th>
									<th>Items</th>
									<th style={{ textAlign: 'right' }}>Grand total</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{filtered.map((r) => (
									<tr key={r.name} onClick={() => navigate('/purchase-orders/' + r.name)}>
										<td><span className="id">{r.name}</span></td>
										<td className="c1">{r.supplier_name ?? r.supplier}</td>
										<td className="c2">{r.custom_project_name ?? '—'}</td>
										<td><span className="num">{r.items}</span></td>
										<td style={{ textAlign: 'right' }}><span className="num">{fmtMoney(r.grand_total, 'INR')}</span></td>
										<td><span className={'tag ' + stateTag(r.workflow_state)}>{r.workflow_state ?? '—'}</span></td>
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
