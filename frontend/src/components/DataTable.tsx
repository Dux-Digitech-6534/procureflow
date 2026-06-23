import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * One reusable list surface for every ProcureFlow list (Material requests,
 * Purchase orders, Receipts, Payments, Approvals). Renders the DUX card shell
 * (chead + hairline table) and owns sort / search / filter state CLIENT-SIDE —
 * lists are capped at ~100 rows server-side, so fetched rows are sorted and
 * filtered in the browser. Keep the DUX styling: tag chips, mono numerics,
 * hairlines, sticky header.
 */

export type Align = 'left' | 'right' | 'center';

export interface Column<T> {
	key: string;
	header: ReactNode;
	align?: Align;
	/** Cell content. */
	render: (row: T) => ReactNode;
	/** Provide to make the column sortable; returns the comparable value. */
	sortValue?: (row: T) => string | number | null | undefined;
	thStyle?: CSSProperties;
	/** Label shown before the cell value in the mobile stacked-card layout.
	 *  Defaults to `header` when it's a plain string. */
	cardLabel?: string;
}

interface SelectFilter<T> {
	type: 'select';
	key: string;
	label: string;
	/** The field value used both to build the option list and to match. */
	value: (row: T) => string | null | undefined;
}

interface DateRangeFilter<T> {
	type: 'dateRange';
	key: string;
	label: string;
	/** ISO date (YYYY-MM-DD) used for the from/to comparison. */
	value: (row: T) => string | null | undefined;
}

export type Filter<T> = SelectFilter<T> | DateRangeFilter<T>;

interface SortState {
	key: string;
	dir: 'asc' | 'desc';
}

interface DataTableProps<T> {
	rows: T[];
	columns: Column<T>[];
	rowKey: (row: T) => string;
	onRowClick?: (row: T) => void;
	/** Builds the searchable haystack for a row (joined, lower-cased internally). */
	searchText?: (row: T) => string;
	searchPlaceholder?: string;
	filters?: Filter<T>[];
	defaultSort?: SortState;
	/** Card header. */
	title: ReactNode;
	icon?: IconName;
	/** States. */
	loading?: boolean;
	error?: ReactNode;
	emptyTitle?: string;
	emptyText?: string;
}

function compare(a: string | number | null | undefined, b: string | number | null | undefined): number {
	const an = a === null || a === undefined || a === '';
	const bn = b === null || b === undefined || b === '';
	if (an && bn) return 0;
	if (an) return 1; // nulls sort last
	if (bn) return -1;
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function DataTable<T>({
	rows,
	columns,
	rowKey,
	onRowClick,
	searchText,
	searchPlaceholder,
	filters,
	defaultSort,
	title,
	icon,
	loading,
	error,
	emptyTitle = 'Nothing here yet',
	emptyText,
}: DataTableProps<T>) {
	const [search, setSearch] = useState('');
	const [sort, setSort] = useState<SortState | null>(defaultSort ?? null);
	const [selected, setSelected] = useState<Record<string, string>>({});
	const [dates, setDates] = useState<Record<string, { from: string; to: string }>>({});

	// Distinct option lists for each select filter, derived from the data.
	const selectOptions = useMemo(() => {
		const out: Record<string, string[]> = {};
		for (const f of filters ?? []) {
			if (f.type !== 'select') continue;
			const set = new Set<string>();
			for (const r of rows) {
				const v = f.value(r);
				if (v) set.add(v);
			}
			out[f.key] = Array.from(set).sort((a, b) => a.localeCompare(b));
		}
		return out;
	}, [filters, rows]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		let out = rows;
		if (q && searchText) out = out.filter((r) => searchText(r).toLowerCase().includes(q));
		for (const f of filters ?? []) {
			if (f.type === 'select') {
				const want = selected[f.key];
				if (want) out = out.filter((r) => (f.value(r) ?? '') === want);
			} else {
				const range = dates[f.key];
				if (range?.from) out = out.filter((r) => (f.value(r) ?? '') >= range.from);
				if (range?.to) out = out.filter((r) => (f.value(r) ?? '') !== '' && (f.value(r) ?? '') <= range.to);
			}
		}
		if (sort) {
			const col = columns.find((c) => c.key === sort.key);
			if (col?.sortValue) {
				const sv = col.sortValue;
				out = [...out].sort((a, b) => {
					const r = compare(sv(a), sv(b));
					return sort.dir === 'asc' ? r : -r;
				});
			}
		}
		return out;
	}, [rows, search, searchText, filters, selected, dates, sort, columns]);

	function toggleSort(key: string) {
		setSort((s) => {
			if (!s || s.key !== key) return { key, dir: 'asc' };
			if (s.dir === 'asc') return { key, dir: 'desc' };
			return null; // third click clears
		});
	}

	const hasFilters = (filters?.length ?? 0) > 0;
	const anyFilterActive =
		Object.values(selected).some(Boolean) ||
		Object.values(dates).some((d) => d.from || d.to);

	function clearFilters() {
		setSelected({});
		setDates({});
	}

	return (
		<section className="card">
			<div className="chead">
				{icon && <Icon name={icon} size={16} />}
				<span className="ttl">{title}</span>
				<span className="cnt">{filtered.length === rows.length ? rows.length : `${filtered.length} / ${rows.length}`}</span>
				<div className="spacer" />
				{searchText && (
					<div className="searchbox">
						<Icon name="search" size={14} />
						<input
							className="inp"
							placeholder={searchPlaceholder ?? 'Search…'}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>
				)}
			</div>

			{hasFilters && (
				<div className="filterbar">
					{(filters ?? []).map((f) =>
						f.type === 'select' ? (
							<label className="fb-item" key={f.key}>
								<span className="fb-lbl">{f.label}</span>
								<select
									className="inp fb-sel"
									value={selected[f.key] ?? ''}
									onChange={(e) => setSelected((s) => ({ ...s, [f.key]: e.target.value }))}
								>
									<option value="">All</option>
									{(selectOptions[f.key] ?? []).map((o) => (
										<option key={o} value={o}>
											{o}
										</option>
									))}
								</select>
							</label>
						) : (
							<label className="fb-item" key={f.key}>
								<span className="fb-lbl">{f.label}</span>
								<span className="fb-range">
									<input
										className="inp fb-date"
										type="date"
										value={dates[f.key]?.from ?? ''}
										onChange={(e) =>
											setDates((d) => ({ ...d, [f.key]: { from: e.target.value, to: d[f.key]?.to ?? '' } }))
										}
									/>
									<span className="fb-dash">–</span>
									<input
										className="inp fb-date"
										type="date"
										value={dates[f.key]?.to ?? ''}
										onChange={(e) =>
											setDates((d) => ({ ...d, [f.key]: { from: d[f.key]?.from ?? '', to: e.target.value } }))
										}
									/>
								</span>
							</label>
						),
					)}
					{anyFilterActive && (
						<button className="fb-clear" onClick={clearFilters}>
							<Icon name="close" size={12} /> Clear
						</button>
					)}
				</div>
			)}

			{error && <div className="empty"><div className="t2" style={{ color: 'var(--err)' }}>{error}</div></div>}
			{loading && <div className="empty"><div className="t2">Loading…</div></div>}
			{!loading && !error && filtered.length === 0 && (
				<div className="empty">
					<div className="t1">{rows.length === 0 ? emptyTitle : 'No matches'}</div>
					{rows.length === 0 ? emptyText && <div className="t2">{emptyText}</div> : <div className="t2">Adjust the search or filters.</div>}
				</div>
			)}

			{!loading && !error && filtered.length > 0 && (
				<div className="tablescroll">
					<table className={onRowClick ? 'clickable' : undefined}>
						<thead>
							<tr>
								{columns.map((c) => {
									const sortable = !!c.sortValue;
									const active = sort?.key === c.key;
									return (
										<th
											key={c.key}
											style={{ textAlign: c.align ?? 'left', cursor: sortable ? 'pointer' : undefined, ...c.thStyle }}
											onClick={sortable ? () => toggleSort(c.key) : undefined}
										>
											<span className={'th-in' + (c.align === 'right' ? ' r' : '')}>
												{c.header}
												{sortable && (
													<span className={'th-sort' + (active ? ' active' : '')}>
														{active ? (sort?.dir === 'asc' ? '▲' : '▼') : '↕'}
													</span>
												)}
											</span>
										</th>
									);
								})}
							</tr>
						</thead>
						<tbody>
							{filtered.map((r) => (
								<tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}>
									{columns.map((c) => (
										<td
											key={c.key}
											style={{ textAlign: c.align ?? 'left' }}
											data-label={c.cardLabel ?? (typeof c.header === 'string' ? c.header : undefined)}
										>
											{c.render(r)}
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
