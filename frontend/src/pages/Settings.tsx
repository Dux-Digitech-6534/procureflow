import { useEffect, useMemo, useState } from 'react';
import { useFrappeCreateDoc, useFrappeGetCall, useFrappeGetDoc, useFrappeGetDocList, useFrappePostCall } from 'frappe-react-sdk';
import { API } from '../lib/api';
import { Card, CHead, EmptyMsg, Modal } from '../components/ui';
import { Field, SearchSelect, SelectInput, TextInput } from '../components/form';
import { Icon, type IconName } from '../components/Icon';
import { useToast } from '../components/Toast';
import { parseServerError } from '../lib/format';

interface Row {
	name: string;
	[k: string]: unknown;
}

function opts(rows: { name: string }[] | undefined) {
	return (rows ?? []).map((r) => ({ value: r.name }));
}

/** The "New" header action, hidden when the user can't create the doctype. */
function newAction(canCreate: boolean, open: () => void) {
	if (!canCreate) return <span className="dim" style={{ fontSize: 11.5 }}>read-only</span>;
	return (
		<a href="#" onClick={(e) => { e.preventDefault(); open(); }}>
			New
		</a>
	);
}

/** Client-side row filter across the given fields (name always included). */
function filterRows(rows: Row[], q: string, fields: string[]): Row[] {
	const s = q.trim().toLowerCase();
	if (!s) return rows;
	return rows.filter((r) => fields.some((f) => String(r[f] ?? '').toLowerCase().includes(s)));
}

/** Search bar shown above a master's table once the list is more than a handful. */
function SearchRow({ q, setQ, shown, total }: { q: string; setQ: (v: string) => void; shown: number; total: number }) {
	if (total <= 5) return null;
	return (
		<div className="mssearch">
			<Icon name="search" size={14} />
			<input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
			{q ? <span className="cnt">{shown} / {total}</span> : null}
		</div>
	);
}

/**
 * Shared create/edit commit for a master record.
 * - create: insert with the identity field + the secondary fields.
 * - edit: if the identity value changed AND the doc is auto-named by it,
 *   rename (cascading to all links) then update the secondary fields; otherwise
 *   just update the fields. `renamable=false` keeps the identity read-only
 *   (e.g. an Item's code, which we never rename from Settings).
 */
function useMasterSave(doctype: string) {
	const { createDoc, loading: creating } = useFrappeCreateDoc();
	const { call: renameCall, loading: renaming } = useFrappePostCall<{ message: string }>(API.renameMaster);
	const { call: updateCall, loading: updating } = useFrappePostCall<{ message: string }>(API.updateMaster);

	async function commit(
		editRow: Row | null,
		idField: string,
		idVal: string,
		secondary: Record<string, unknown>,
		renamable: boolean,
	): Promise<string> {
		const clean = idVal.trim();
		if (!editRow) {
			const doc = await createDoc(doctype, { [idField]: clean, ...secondary });
			return (doc?.name as string) ?? clean;
		}
		const isAutonamed = editRow.name === editRow[idField];
		const idChanged = renamable && clean !== String(editRow[idField] ?? editRow.name);
		if (idChanged && isAutonamed) {
			const newName = (await renameCall({ doctype, old_name: editRow.name, new_name: clean, field: idField })).message;
			if (Object.keys(secondary).length) await updateCall({ doctype, name: newName, values: secondary });
			return newName;
		}
		const values = renamable ? { [idField]: clean, ...secondary } : secondary;
		await updateCall({ doctype, name: editRow.name, values });
		return editRow.name;
	}

	return { commit, loading: creating || renaming || updating };
}

/* ------------------------- Generic single-field master ---------------------- */

function SimpleMaster({
	doctype,
	icon,
	title,
	noun,
	field,
	listField,
	placeholder,
	canCreate,
}: {
	doctype: string;
	icon: IconName;
	title: string;
	noun: string;
	field: string;
	listField?: string;
	placeholder: string;
	canCreate: boolean;
}) {
	const lf = listField ?? field;
	const { data, mutate } = useFrappeGetDocList<Row>(doctype, {
		fields: ['name', lf],
		orderBy: { field: 'modified', order: 'desc' },
		limit: 0,
	});
	const { commit, loading } = useMasterSave(doctype);
	const toast = useToast();
	const [modal, setModal] = useState(false);
	const [edit, setEdit] = useState<Row | null>(null);
	const [val, setVal] = useState('');
	const [err, setErr] = useState('');
	const [q, setQ] = useState('');
	const rows = data ?? [];
	const shown = useMemo(() => filterRows(rows, q, [lf, 'name']), [rows, q, lf]);

	function openNew() { setErr(''); setEdit(null); setVal(''); setModal(true); }
	function openEdit(r: Row) { if (!canCreate) return; setErr(''); setEdit(r); setVal(String(r[lf] ?? r.name)); setModal(true); }
	function close() { setModal(false); setEdit(null); }

	async function save() {
		if (!val.trim()) return setErr(`${noun} name is required.`);
		setErr('');
		try {
			await commit(edit, field, val, {}, true);
			toast.success(edit ? `${noun} updated` : `${noun} created`);
			close();
			mutate();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Card>
			<CHead icon={icon} title={title} count={rows.length} action={newAction(canCreate, openNew)} />
			{rows.length === 0 ? (
				<EmptyMsg title={`No ${title.toLowerCase()} yet`} text={`Add a ${noun.toLowerCase()}.`} />
			) : (
				<>
					<SearchRow q={q} setQ={setQ} shown={shown.length} total={rows.length} />
					{shown.length === 0 ? (
						<EmptyMsg title="No matches" text="Adjust your search." />
					) : (
						<div className="tablescroll">
							<table className={canCreate ? 'clickable' : undefined}>
								<thead><tr><th>{noun}</th></tr></thead>
								<tbody>
									{shown.map((r) => (
										<tr key={r.name} onClick={canCreate ? () => openEdit(r) : undefined}>
											<td className="c1">{String(r[lf] ?? r.name)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}
			{modal && (
				<Modal title={edit ? `Edit ${noun.toLowerCase()}` : `New ${noun.toLowerCase()}`} icon={icon} onClose={close}>
					<div className="formgrid">
						<div className="span2">
							<Field label={`${noun} name`} required hint={edit ? 'Renaming updates it everywhere it is used.' : undefined}>
								<TextInput value={val} onChange={setVal} placeholder={placeholder} />
							</Field>
						</div>
					</div>
					<div className="formfoot">
						{err && <span className="ferr">{err}</span>}
						<span className="spacer" />
						<button className="btn" onClick={close}>Cancel</button>
						<button className="btn primary" disabled={loading} onClick={() => void save()}>
							{loading ? 'Saving…' : edit ? 'Save changes' : `Create ${noun.toLowerCase()}`}
						</button>
					</div>
				</Modal>
			)}
		</Card>
	);
}

/* -------------------------------- Sub-category ------------------------------ */

function SubCategoryPanel({ canCreate }: { canCreate: boolean }) {
	const { data, mutate } = useFrappeGetDocList<Row>('Material Sub Category', {
		fields: ['name', 'sub_category_name', 'material_category'],
		orderBy: { field: 'modified', order: 'desc' },
		limit: 0,
	});
	const cats = useFrappeGetDocList<{ name: string }>('Material Category', { fields: ['name'], orderBy: { field: 'name', order: 'asc' }, limit: 0 });
	const { commit, loading } = useMasterSave('Material Sub Category');
	const toast = useToast();
	const [modal, setModal] = useState(false);
	const [edit, setEdit] = useState<Row | null>(null);
	const [val, setVal] = useState('');
	const [cat, setCat] = useState('');
	const [err, setErr] = useState('');
	const [q, setQ] = useState('');
	const rows = data ?? [];
	const shown = useMemo(() => filterRows(rows, q, ['sub_category_name', 'material_category', 'name']), [rows, q]);

	function openNew() { setErr(''); setEdit(null); setVal(''); setCat(''); setModal(true); }
	function openEdit(r: Row) { if (!canCreate) return; setErr(''); setEdit(r); setVal(String(r.sub_category_name ?? r.name)); setCat(String(r.material_category ?? '')); setModal(true); }
	function close() { setModal(false); setEdit(null); }

	async function save() {
		if (!val.trim()) return setErr('Sub-category name is required.');
		if (!cat) return setErr('Pick the parent category.');
		setErr('');
		try {
			await commit(edit, 'sub_category_name', val, { material_category: cat }, true);
			toast.success(edit ? 'Sub-category updated' : 'Sub-category created');
			close();
			mutate();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Card>
			<CHead icon="layers" title="Sub-categories" count={rows.length} action={newAction(canCreate, openNew)} />
			{rows.length === 0 ? (
				<EmptyMsg title="No sub-categories yet" text="Add a sub-category under a category." />
			) : (
				<>
					<SearchRow q={q} setQ={setQ} shown={shown.length} total={rows.length} />
					{shown.length === 0 ? (
						<EmptyMsg title="No matches" text="Adjust your search." />
					) : (
						<div className="tablescroll">
							<table className={canCreate ? 'clickable' : undefined}>
								<thead><tr><th>Sub-category</th><th>Category</th></tr></thead>
								<tbody>
									{shown.map((r) => (
										<tr key={r.name} onClick={canCreate ? () => openEdit(r) : undefined}>
											<td className="c1">{String(r.sub_category_name ?? r.name)}</td>
											<td className="dim">{String(r.material_category ?? '—')}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}
			{modal && (
				<Modal title={edit ? 'Edit sub-category' : 'New sub-category'} icon="layers" onClose={close}>
					<div className="formgrid">
						<Field label="Sub-category name" required>
							<TextInput value={val} onChange={setVal} placeholder="e.g. PVC Pipes" />
						</Field>
						<Field label="Category" required>
							<SearchSelect value={cat} onChange={setCat} options={opts(cats.data)} placeholder="Select category…" />
						</Field>
					</div>
					<div className="formfoot">
						{err && <span className="ferr">{err}</span>}
						<span className="spacer" />
						<button className="btn" onClick={close}>Cancel</button>
						<button className="btn primary" disabled={loading} onClick={() => void save()}>
							{loading ? 'Saving…' : edit ? 'Save changes' : 'Create sub-category'}
						</button>
					</div>
				</Modal>
			)}
		</Card>
	);
}

/* ---------------------------------- Projects -------------------------------- */

function ProjectPanel({ canCreate }: { canCreate: boolean }) {
	const { data, mutate } = useFrappeGetDocList<Row>('Project Master', {
		fields: ['name', 'project_name', 'company_name', 'store_name'],
		orderBy: { field: 'modified', order: 'desc' },
		limit: 0,
	});
	const companies = useFrappeGetDocList<{ name: string }>('Company Master', { fields: ['name'], orderBy: { field: 'name', order: 'asc' }, limit: 0 });
	const warehouses = useFrappeGetDocList<{ name: string }>('Warehouse', { filters: [['is_group', '=', 0]], fields: ['name'], orderBy: { field: 'name', order: 'asc' }, limit: 0 });
	const { commit, loading } = useMasterSave('Project Master');
	const toast = useToast();
	const [modal, setModal] = useState(false);
	const [edit, setEdit] = useState<Row | null>(null);
	const [val, setVal] = useState('');
	const [company, setCompany] = useState('');
	const [store, setStore] = useState('');
	const [err, setErr] = useState('');
	const [q, setQ] = useState('');
	const rows = data ?? [];
	const shown = useMemo(() => filterRows(rows, q, ['project_name', 'company_name', 'store_name', 'name']), [rows, q]);

	function openNew() { setErr(''); setEdit(null); setVal(''); setCompany(''); setStore(''); setModal(true); }
	function openEdit(r: Row) { if (!canCreate) return; setErr(''); setEdit(r); setVal(String(r.project_name ?? r.name)); setCompany(String(r.company_name ?? '')); setStore(String(r.store_name ?? '')); setModal(true); }
	function close() { setModal(false); setEdit(null); }

	async function save() {
		if (!val.trim()) return setErr('Project name is required.');
		setErr('');
		try {
			await commit(edit, 'project_name', val, { company_name: company || null, store_name: store || null }, true);
			toast.success(edit ? 'Project updated' : 'Project created');
			close();
			mutate();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Card>
			<CHead icon="building" title="Projects" count={rows.length} action={newAction(canCreate, openNew)} />
			{rows.length === 0 ? (
				<EmptyMsg title="No projects yet" text="Add a project with its company and store." />
			) : (
				<>
					<SearchRow q={q} setQ={setQ} shown={shown.length} total={rows.length} />
					{shown.length === 0 ? (
						<EmptyMsg title="No matches" text="Adjust your search." />
					) : (
						<div className="tablescroll">
							<table className={canCreate ? 'clickable' : undefined}>
								<thead><tr><th>Project</th><th>Company</th><th>Store</th></tr></thead>
								<tbody>
									{shown.map((r) => (
										<tr key={r.name} onClick={canCreate ? () => openEdit(r) : undefined}>
											<td className="c1">{String(r.project_name ?? r.name)}</td>
											<td className="dim">{String(r.company_name ?? '—')}</td>
											<td className="dim">{String(r.store_name ?? '—')}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}
			{modal && (
				<Modal title={edit ? 'Edit project' : 'New project'} icon="building" onClose={close}>
					<div className="formgrid">
						<div className="span2">
							<Field label="Project name" required>
								<TextInput value={val} onChange={setVal} placeholder="e.g. Sanskruti Residency" />
							</Field>
						</div>
						<Field label="Company">
							<SearchSelect value={company} onChange={setCompany} options={opts(companies.data)} placeholder="Select company…" />
						</Field>
						<Field label="Store / warehouse">
							<SearchSelect value={store} onChange={setStore} options={opts(warehouses.data)} placeholder="Select store…" />
						</Field>
					</div>
					<div className="formfoot">
						{err && <span className="ferr">{err}</span>}
						<span className="spacer" />
						<button className="btn" onClick={close}>Cancel</button>
						<button className="btn primary" disabled={loading} onClick={() => void save()}>
							{loading ? 'Saving…' : edit ? 'Save changes' : 'Create project'}
						</button>
					</div>
				</Modal>
			)}
		</Card>
	);
}

/* ----------------------------- Stores (Warehouse) --------------------------- */

function StorePanel({ canCreate }: { canCreate: boolean }) {
	const { data, mutate } = useFrappeGetDocList<Row>('Warehouse', {
		filters: [['is_group', '=', 0]],
		fields: ['name', 'warehouse_name', 'company'],
		orderBy: { field: 'modified', order: 'desc' },
		limit: 0,
	});
	const companies = useFrappeGetDocList<{ name: string }>('Company', { fields: ['name'], orderBy: { field: 'name', order: 'asc' }, limit: 0 });
	const groups = useFrappeGetDocList<{ name: string }>('Warehouse', { filters: [['is_group', '=', 1]], fields: ['name'], orderBy: { field: 'name', order: 'asc' }, limit: 0 });
	const { commit, loading } = useMasterSave('Warehouse');
	const toast = useToast();
	const [modal, setModal] = useState(false);
	const [edit, setEdit] = useState<Row | null>(null);
	const [val, setVal] = useState('');
	const [company, setCompany] = useState('');
	const [parent, setParent] = useState('');
	const [err, setErr] = useState('');
	const [q, setQ] = useState('');
	const rows = data ?? [];
	const shown = useMemo(() => filterRows(rows, q, ['warehouse_name', 'company', 'name']), [rows, q]);

	function openNew() { setErr(''); setEdit(null); setVal(''); setCompany(''); setParent(''); setModal(true); }
	function openEdit(r: Row) { if (!canCreate) return; setErr(''); setEdit(r); setVal(String(r.warehouse_name ?? r.name)); setCompany(String(r.company ?? '')); setParent(String(r.parent_warehouse ?? '')); setModal(true); }
	function close() { setModal(false); setEdit(null); }

	async function save() {
		if (!val.trim()) return setErr('Store name is required.');
		if (!edit && !company) return setErr('Pick the company.');
		setErr('');
		try {
			// Company can't be changed on an existing warehouse — only set it on create.
			const secondary = edit ? { parent_warehouse: parent || null } : { company, parent_warehouse: parent || undefined };
			await commit(edit, 'warehouse_name', val, secondary, true);
			toast.success(edit ? 'Store updated' : 'Store created');
			close();
			mutate();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Card>
			<CHead icon="package" title="Stores" count={rows.length} action={newAction(canCreate, openNew)} />
			{rows.length === 0 ? (
				<EmptyMsg title="No stores yet" text="Add a store (warehouse)." />
			) : (
				<>
					<SearchRow q={q} setQ={setQ} shown={shown.length} total={rows.length} />
					{shown.length === 0 ? (
						<EmptyMsg title="No matches" text="Adjust your search." />
					) : (
						<div className="tablescroll">
							<table className={canCreate ? 'clickable' : undefined}>
								<thead><tr><th>Store</th><th>Company</th></tr></thead>
								<tbody>
									{shown.map((r) => (
										<tr key={r.name} onClick={canCreate ? () => openEdit(r) : undefined}>
											<td className="c1">{String(r.warehouse_name ?? r.name)}</td>
											<td className="dim">{String(r.company ?? '—')}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}
			{modal && (
				<Modal title={edit ? 'Edit store' : 'New store'} icon="package" onClose={close}>
					<div className="formgrid">
						<div className="span2">
							<Field label="Store name" required>
								<TextInput value={val} onChange={setVal} placeholder="e.g. Site Store" />
							</Field>
						</div>
						<Field label="Company" required hint={edit ? "A store's company can't be changed." : undefined}>
							<SearchSelect value={company} onChange={setCompany} options={opts(companies.data)} placeholder="Select company…" disabled={!!edit} />
						</Field>
						<Field label="Parent warehouse" hint="Optional — a group warehouse">
							<SearchSelect value={parent} onChange={setParent} options={opts(groups.data)} placeholder="Select parent…" />
						</Field>
					</div>
					<div className="formfoot">
						{err && <span className="ferr">{err}</span>}
						<span className="spacer" />
						<button className="btn" onClick={close}>Cancel</button>
						<button className="btn primary" disabled={loading} onClick={() => void save()}>
							{loading ? 'Saving…' : edit ? 'Save changes' : 'Create store'}
						</button>
					</div>
				</Modal>
			)}
		</Card>
	);
}

/* --------------------------------- Suppliers -------------------------------- */

function SupplierPanel({ canCreate }: { canCreate: boolean }) {
	const { data, mutate } = useFrappeGetDocList<Row>('Supplier', {
		fields: ['name', 'supplier_name', 'supplier_group'],
		orderBy: { field: 'modified', order: 'desc' },
		limit: 0,
	});
	const groups = useFrappeGetDocList<{ name: string }>('Supplier Group', {
		filters: [['is_group', '=', 0]],
		fields: ['name'],
		orderBy: { field: 'name', order: 'asc' },
		limit: 0,
	});
	const { commit, loading } = useMasterSave('Supplier');
	const toast = useToast();
	const [modal, setModal] = useState(false);
	const [edit, setEdit] = useState<Row | null>(null);
	const [name, setName] = useState('');
	const [group, setGroup] = useState('');
	const [err, setErr] = useState('');
	const [q, setQ] = useState('');
	const rows = data ?? [];
	const shown = useMemo(() => filterRows(rows, q, ['supplier_name', 'supplier_group', 'name']), [rows, q]);

	function openNew() { setErr(''); setEdit(null); setName(''); setGroup(''); setModal(true); }
	function openEdit(r: Row) { if (!canCreate) return; setErr(''); setEdit(r); setName(String(r.supplier_name ?? r.name)); setGroup(String(r.supplier_group ?? '')); setModal(true); }
	function close() { setModal(false); setEdit(null); }

	async function save() {
		if (!name.trim()) return setErr('Supplier name is required.');
		setErr('');
		try {
			await commit(edit, 'supplier_name', name, { supplier_group: group || null }, true);
			toast.success(edit ? 'Supplier updated' : 'Supplier created');
			close();
			mutate();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Card>
			<CHead icon="building" title="Suppliers" count={rows.length} action={newAction(canCreate, openNew)} />
			{rows.length === 0 ? (
				<EmptyMsg title="No suppliers yet" text="Add a supplier to use it on purchase orders." />
			) : (
				<>
					<SearchRow q={q} setQ={setQ} shown={shown.length} total={rows.length} />
					{shown.length === 0 ? (
						<EmptyMsg title="No matches" text="Adjust your search." />
					) : (
						<div className="tablescroll">
							<table className={canCreate ? 'clickable' : undefined}>
								<thead><tr><th>Supplier</th><th>Group</th></tr></thead>
								<tbody>
									{shown.map((r) => (
										<tr key={r.name} onClick={canCreate ? () => openEdit(r) : undefined}>
											<td className="c1">{String(r.supplier_name ?? r.name)}</td>
											<td className="dim">{String(r.supplier_group ?? '—')}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}
			{modal && (
				<Modal title={edit ? 'Edit supplier' : 'New supplier'} icon="building" onClose={close}>
					<div className="formgrid">
						<div className="span2">
							<Field label="Supplier name" required>
								<TextInput value={name} onChange={setName} placeholder="e.g. Ajmera Hardware" />
							</Field>
						</div>
						<div className="span2">
							<Field label="Supplier group">
								<SearchSelect value={group} onChange={setGroup} options={opts(groups.data)} placeholder="Select group…" />
							</Field>
						</div>
					</div>
					<div className="formfoot">
						{err && <span className="ferr">{err}</span>}
						<span className="spacer" />
						<button className="btn" onClick={close}>Cancel</button>
						<button className="btn primary" disabled={loading} onClick={() => void save()}>
							{loading ? 'Saving…' : edit ? 'Save changes' : 'Create supplier'}
						</button>
					</div>
				</Modal>
			)}
		</Card>
	);
}

/* ----------------------------------- Items ---------------------------------- */

// New items default to this leaf item group; the field is hidden from the form
// because Category + Sub-category are used for grouping. ("All Item Groups" is a
// parent group and cannot be assigned to an item.)
const DEFAULT_ITEM_GROUP = 'Raw Material';

function ItemPanel({ canCreate }: { canCreate: boolean }) {
	const { data, mutate } = useFrappeGetDocList<Row>('Item', {
		fields: ['name', 'item_name', 'item_group', 'stock_uom', 'custom_category', 'custom_sub_category'],
		orderBy: { field: 'modified', order: 'desc' },
		limit: 0,
	});
	const uoms = useFrappeGetDocList<{ name: string }>('UOM', { fields: ['name'], limit: 0 });
	const categories = useFrappeGetDocList<{ name: string }>('Material Category', {
		fields: ['name'],
		orderBy: { field: 'name', order: 'asc' },
		limit: 0,
	});
	const subCats = useFrappeGetDocList<{ name: string; material_category: string }>('Material Sub Category', {
		fields: ['name', 'material_category'],
		limit: 0,
	});
	const [modal, setModal] = useState(false);
	const [edit, setEdit] = useState<Row | null>(null);
	const [q, setQ] = useState('');
	const rows = data ?? [];
	const shown = useMemo(() => filterRows(rows, q, ['item_name', 'name', 'custom_category', 'custom_sub_category', 'stock_uom']), [rows, q]);

	return (
		<Card>
			<CHead icon="cube" title="Items" count={rows.length} action={newAction(canCreate, () => { setEdit(null); setModal(true); })} />
			{rows.length === 0 ? (
				<EmptyMsg title="No items" text="Add an item with its category and sub-category." />
			) : (
				<>
					<SearchRow q={q} setQ={setQ} shown={shown.length} total={rows.length} />
					{shown.length === 0 ? (
						<EmptyMsg title="No matches" text="Adjust your search." />
					) : (
						<div className="tablescroll">
							<table className={canCreate ? 'clickable' : undefined}>
								<thead>
									<tr><th>Item</th><th>Category</th><th>Sub-category</th><th>UOM</th></tr>
								</thead>
								<tbody>
									{shown.map((r) => (
										<tr key={r.name} onClick={canCreate ? () => { setEdit(r); setModal(true); } : undefined}>
											<td className="c1">
												{String(r.item_name ?? r.name)}
												<span className="id" style={{ marginLeft: 8 }}>{r.name}</span>
											</td>
											<td className="dim">{String(r.custom_category ?? '—')}</td>
											<td className="dim">{String(r.custom_sub_category ?? '—')}</td>
											<td className="dim">{String(r.stock_uom ?? '—')}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}
			{modal && (
				<ItemModal
					editRow={edit}
					uoms={opts(uoms.data)}
					categories={opts(categories.data)}
					subCats={subCats.data ?? []}
					onClose={() => { setModal(false); setEdit(null); }}
					onSaved={() => { setModal(false); setEdit(null); mutate(); }}
				/>
			)}
		</Card>
	);
}

interface AltUom {
	uom: string;
	cf: string;
}

function ItemModal({
	editRow,
	uoms,
	categories,
	subCats,
	onClose,
	onSaved,
}: {
	editRow: Row | null;
	uoms: { value: string }[];
	categories: { value: string }[];
	subCats: { name: string; material_category: string }[];
	onClose: () => void;
	onSaved: () => void;
}) {
	const { commit, loading } = useMasterSave('Item');
	const toast = useToast();
	const [code, setCode] = useState(editRow ? editRow.name : '');
	const [name, setName] = useState(editRow ? String(editRow.item_name ?? '') : '');
	const [uom, setUom] = useState(editRow ? String(editRow.stock_uom ?? 'Nos') : 'Nos');
	const [category, setCategory] = useState(editRow ? String(editRow.custom_category ?? '') : '');
	const [subCat, setSubCat] = useState(editRow ? String(editRow.custom_sub_category ?? '') : '');
	const [altUoms, setAltUoms] = useState<AltUom[]>([]);
	const [uomSeeded, setUomSeeded] = useState(false);
	const [err, setErr] = useState('');

	// On edit, pull the item's existing UOM conversions to prefill the editor.
	const itemDoc = useFrappeGetDoc<{ stock_uom: string; uoms: { uom: string; conversion_factor: number }[] }>('Item', editRow?.name);
	useEffect(() => {
		if (editRow && itemDoc.data && !uomSeeded) {
			const su = itemDoc.data.stock_uom;
			setAltUoms(
				(itemDoc.data.uoms ?? [])
					.filter((u) => u.uom && u.uom !== su)
					.map((u) => ({ uom: u.uom, cf: String(u.conversion_factor) })),
			);
			setUomSeeded(true);
		}
	}, [editRow, itemDoc.data, uomSeeded]);

	const subOptions = useMemo(
		() => subCats.filter((s) => !category || s.material_category === category).map((s) => ({ value: s.name })),
		[subCats, category],
	);

	function setAlt(i: number, patch: Partial<AltUom>) { setAltUoms((a) => a.map((x, idx) => (idx === i ? { ...x, ...patch } : x))); }
	function addAlt() { setAltUoms((a) => [...a, { uom: '', cf: '' }]); }
	function removeAlt(i: number) { setAltUoms((a) => a.filter((_, idx) => idx !== i)); }

	async function save() {
		if (!code.trim()) return setErr('Item code is required.');
		if (!uom) return setErr('Pick a default UOM.');
		const alts = altUoms
			.map((a) => ({ uom: a.uom.trim(), cf: Number(a.cf) || 0 }))
			.filter((a) => a.uom && a.uom !== uom);
		if (alts.some((a) => a.cf <= 0)) return setErr('Every additional unit needs a conversion factor greater than zero.');
		const seen = new Set<string>();
		for (const a of alts) {
			if (seen.has(a.uom)) return setErr(`Unit "${a.uom}" is listed twice.`);
			seen.add(a.uom);
		}
		setErr('');
		// uoms table: stock UOM (factor 1) + the alternates.
		const uomsPayload = [{ uom, conversion_factor: 1 }, ...alts.map((a) => ({ uom: a.uom, conversion_factor: a.cf }))];
		try {
			const secondary: Record<string, unknown> = {
				item_name: name.trim() || code.trim(),
				stock_uom: uom,
				custom_category: category || null,
				custom_sub_category: subCat || null,
				uoms: uomsPayload,
			};
			// Item code is the identity (and PK) — read-only on edit; on create we
			// also stamp the default item group.
			if (editRow) {
				await commit(editRow, 'item_code', code, secondary, false);
			} else {
				await commit(null, 'item_code', code, { ...secondary, item_group: DEFAULT_ITEM_GROUP }, false);
			}
			toast.success(editRow ? 'Item updated' : 'Item created');
			onSaved();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Modal title={editRow ? 'Edit item' : 'New item'} icon="cube" onClose={onClose}>
			<div className="formgrid">
				<Field label="Item code" required hint={editRow ? 'The code is fixed once created.' : undefined}>
					<TextInput value={code} onChange={setCode} placeholder="e.g. ITEM-0210" disabled={!!editRow} />
				</Field>
				<Field label="Item name">
					<TextInput value={name} onChange={setName} placeholder="Defaults to the code" />
				</Field>
				<Field label="Default (stock) UOM" required>
					<SearchSelect value={uom} onChange={setUom} options={uoms} placeholder="Select UOM…" />
				</Field>
				<Field label="Category" hint="Drives the item picker on material requests">
					<SelectInput
						value={category}
						onChange={(v) => { setCategory(v); setSubCat(''); }}
						options={categories}
						allowEmpty
						placeholder="—"
					/>
				</Field>
				<div className="span2">
					<Field label="Sub-category" hint="Optional — items can have none">
						<SearchSelect value={subCat} onChange={setSubCat} options={subOptions} placeholder="Select sub-category…" />
					</Field>
				</div>
				<div className="span2">
					<Field label="Additional units" hint="Optional — let this item be ordered/received in other units too.">
						<div className="uomlist">
							{altUoms.map((u, i) => (
								<div className="uomrow" key={i}>
									<SearchSelect value={u.uom} onChange={(v) => setAlt(i, { uom: v })} options={uoms} placeholder="Unit…" />
									<span className="eq">=</span>
									<input className="inp mono" value={u.cf} inputMode="decimal" placeholder="0" onChange={(e) => setAlt(i, { cf: e.target.value })} aria-label="Conversion factor" />
									<span className="stocku">{uom || 'stock unit'}</span>
									<button className="xbtn" type="button" onClick={() => removeAlt(i)} aria-label="Remove unit">
										<Icon name="close" size={13} />
									</button>
								</div>
							))}
							<button className="uomadd" type="button" onClick={addAlt}>
								<Icon name="plus" size={13} /> Add a unit
							</button>
							<div className="uomhint">
								Enter how many <b>{uom || 'stock units'}</b> make up one of each unit — e.g. 1 Box = 12 Nos → enter 12.
							</div>
						</div>
					</Field>
				</div>
			</div>
			<div className="formfoot">
				{err && <span className="ferr">{err}</span>}
				<span className="spacer" />
				<button className="btn" onClick={onClose}>Cancel</button>
				<button className="btn primary" disabled={loading} onClick={() => void save()}>
					{loading ? 'Saving…' : editRow ? 'Save changes' : 'Create item'}
				</button>
			</div>
		</Modal>
	);
}

/* --------------------------------- Settings --------------------------------- */

export function Settings() {
	const { data, isLoading } = useFrappeGetCall<{ message: Record<string, boolean> }>(API.settingsCanCreate, {});
	const can = data?.message ?? {};
	// Fail safe: keep panels read-only until perms are known, so we never flash a
	// "New" / edit affordance the user can't actually use.
	const allow = (dt: string) => !isLoading && can[dt] === true;

	return (
		<main>
			<div className="eyebrow">Workspace</div>
			<h1 style={{ fontFamily: 'var(--font-ui)', color: 'var(--fg-1)' }}>
				Masters &amp; <em style={{ fontStyle: 'normal', color: 'var(--iris)' }}>settings</em>
			</h1>
			<div className="sub">Add or edit the masters used across material requests, purchase orders and receipts. Search a list and tap a row to edit it.</div>

			<div className="stack" style={{ marginTop: 22 }}>
				<SupplierPanel canCreate={allow('Supplier')} />
				<ItemPanel canCreate={allow('Item')} />
				<ProjectPanel canCreate={allow('Project Master')} />
				<SimpleMaster doctype="Company Master" icon="building" title="Companies" noun="Company" field="company_name" placeholder="e.g. Pushpa Construction" canCreate={allow('Company Master')} />
				<SimpleMaster doctype="Material Category" icon="layers" title="Categories" noun="Category" field="category_name" placeholder="e.g. Plumbing" canCreate={allow('Material Category')} />
				<SubCategoryPanel canCreate={allow('Material Sub Category')} />
				<StorePanel canCreate={allow('Warehouse')} />
				<SimpleMaster doctype="UOM" icon="cube" title="Units" noun="Unit" field="uom_name" placeholder="e.g. Box" canCreate={allow('UOM')} />
			</div>

			<footer>
				<b>ProcureFlow</b> · DUX Digitech
			</footer>
		</main>
	);
}
