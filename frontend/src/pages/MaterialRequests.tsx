import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, stateTag, type MrListRow } from '../lib/api';
import { fmtDate } from '../lib/format';

export function MaterialRequests() {
	const navigate = useNavigate();
	const [search, setSearch] = useState('');
	const { data, isLoading, error } = useFrappeGetCall<{ message: MrListRow[] }>(API.mrList, {});
	const rows = data?.message ?? [];

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter(
			(r) =>
				r.name.toLowerCase().includes(q) ||
				(r.custom_select_project_ ?? '').toLowerCase().includes(q) ||
				(r.custom_category ?? '').toLowerCase().includes(q),
		);
	}, [rows, search]);

	return (
		<main>
			<div className="eyebrow">Procurement</div>
			<div className="titlebar">
				<h1 style={{ fontFamily: 'var(--font-ui)', color: 'var(--fg-1)' }}>Material requests</h1>
				<div className="spacer" />
				<button className="btn primary" onClick={() => navigate('/material-requests/new')}>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M12 5v14M5 12h14" />
					</svg>
					New request
				</button>
			</div>

			<section className="card">
				<div className="chead">
					<div className="ttl">All requests</div>
					<div className="cnt">{rows.length}</div>
					<div className="spacer" />
					<input
						className="inp"
						style={{ height: 34, width: 240 }}
						placeholder="Search id / project / category…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>

				{error && <div className="empty"><div className="t2" style={{ color: 'var(--err)' }}>Could not load requests.</div></div>}
				{isLoading && <div className="empty"><div className="t2">Loading…</div></div>}
				{!isLoading && !error && filtered.length === 0 && (
					<div className="empty">
						<div className="t1">No material requests yet</div>
						<div className="t2">Create your first request to get started.</div>
					</div>
				)}

				{filtered.length > 0 && (
					<div className="tablescroll">
						<table className="clickable">
							<thead>
								<tr>
									<th>Request</th>
									<th>Category</th>
									<th>Project</th>
									<th>Items</th>
									<th>Priority</th>
									<th>Required by</th>
									<th>Status</th>
								</tr>
							</thead>
							<tbody>
								{filtered.map((r) => (
									<tr key={r.name} onClick={() => navigate('/material-requests/' + r.name)}>
										<td><span className="id">{r.name}</span></td>
										<td className="c1">{r.custom_category ?? '—'}</td>
										<td className="c2">{r.custom_select_project_ ?? '—'}</td>
										<td><span className="num">{r.items}</span></td>
										<td>{r.custom_priority ?? '—'}</td>
										<td><span className="dim">{fmtDate(r.schedule_date)}</span></td>
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
