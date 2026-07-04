import { useNavigate } from 'react-router-dom';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, mrDisplayStatus, type MrListRow } from '../lib/api';
import { fmtDate } from '../lib/format';
import { Icon } from '../components/Icon';
import { ActionButtons } from '../components/ActionButtons';
import { DataTable, type Column, type Filter } from '../components/DataTable';

const PRIORITY_RANK: Record<string, number> = { Low: 1, Medium: 2, High: 3 };

export function MaterialRequests() {
	const navigate = useNavigate();
	const { data, isLoading, error, mutate } = useFrappeGetCall<{ message: MrListRow[] }>(API.mrList, {});
	const rows = data?.message ?? [];

	const columns: Column<MrListRow>[] = [
		{ key: 'name', header: 'Request', sortValue: (r) => r.name, render: (r) => <span className="id">{r.name}</span> },
		{ key: 'category', header: 'Category', sortValue: (r) => r.custom_category, render: (r) => <span className="c1">{r.custom_category ?? '—'}</span> },
		{ key: 'project', header: 'Project', sortValue: (r) => r.custom_select_project_, render: (r) => <span className="c2">{r.custom_select_project_ ?? '—'}</span> },
		{ key: 'items', header: 'Items', sortValue: (r) => r.items, render: (r) => <span className="num">{r.items}</span> },
		{ key: 'priority', header: 'Priority', sortValue: (r) => PRIORITY_RANK[r.custom_priority ?? ''] ?? 0, render: (r) => r.custom_priority ?? '—' },
		{ key: 'date', header: 'Required by', sortValue: (r) => r.schedule_date, render: (r) => <span className="dim">{fmtDate(r.schedule_date)}</span> },
		{
			key: 'status',
			header: 'Status',
			sortValue: (r) => mrDisplayStatus(r).label,
			render: (r) => {
				const s = mrDisplayStatus(r);
				const rejected = s.label === 'Rejected' && r.custom_rejection_remark;
				return (
					<span title={rejected ? r.custom_rejection_remark ?? undefined : undefined}>
						<span className={'tag ' + s.tone}>{s.label}</span>
						{rejected && <div className="dim" style={{ marginTop: 4, fontSize: 11.5, maxWidth: 220, whiteSpace: 'normal' }}>{r.custom_rejection_remark}</div>}
					</span>
				);
			},
		},
		{
			key: 'actions',
			header: '',
			align: 'right',
			render: (r) => (r.actions?.length ? <ActionButtons doctype="Material Request" name={r.name} actions={r.actions} onDone={mutate} /> : null),
		},
	];

	const filters: Filter<MrListRow>[] = [
		{ type: 'select', key: 'status', label: 'Status', value: (r) => mrDisplayStatus(r).label },
		{ type: 'select', key: 'category', label: 'Category', value: (r) => r.custom_category },
		{ type: 'select', key: 'project', label: 'Project', value: (r) => r.custom_select_project_ },
		{ type: 'select', key: 'priority', label: 'Priority', value: (r) => r.custom_priority },
		{ type: 'dateRange', key: 'date', label: 'Required by', value: (r) => r.schedule_date },
	];

	return (
		<main>
			<div className="eyebrow">Procurement</div>
			<div className="titlebar">
				<h1 style={{ fontFamily: 'var(--font-ui)', color: 'var(--fg-1)' }}>Material requests</h1>
				<div className="spacer" />
				<button className="btn primary" onClick={() => navigate('/material-requests/new')}>
					<Icon name="plus" size={14} /> New request
				</button>
			</div>

			<DataTable
				title="All requests"
				icon="file-text"
				rows={rows}
				columns={columns}
				rowKey={(r) => r.name}
				onRowClick={(r) => navigate('/material-requests/' + r.name)}
				searchText={(r) => `${r.name} ${r.custom_select_project_ ?? ''} ${r.custom_category ?? ''}`}
				searchPlaceholder="Search id / project / category…"
				filters={filters}
				loading={isLoading}
				error={error ? 'Could not load requests.' : undefined}
				emptyTitle="No material requests yet"
				emptyText="Create your first request to get started."
			/>
		</main>
	);
}
