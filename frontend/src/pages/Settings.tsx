import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFrappeCreateDoc, useFrappeGetCall, useFrappeGetDoc, useFrappeGetDocList, useFrappePostCall } from 'frappe-react-sdk';
import { API, type AssignableRole, type Capabilities, type ManagedUser, type Tolerance } from '../lib/api';
import { Card, CHead, EmptyMsg, Modal } from '../components/ui';
import { Field, SearchSelect, SelectInput, TextArea, TextInput } from '../components/form';
import { Icon, type IconName } from '../components/Icon';
import { useToast } from '../components/Toast';
import { parseServerError, termsHtmlToText, termsTextToHtml } from '../lib/format';
import { whatsAppCredsUrl } from '../lib/whatsapp';

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

// Item GST is set via an Item Tax Template (the backend maps the chosen % to the
// matching template); the item group default ('Products') is applied server-side
// in save_item so the desk and React item-create paths can't diverge.
const GST_OPTIONS = [
	{ value: '5', label: '5%' },
	{ value: '12', label: '12%' },
	{ value: '18', label: '18%' },
	{ value: '28', label: '28%' },
];
const TEMPLATE_RATE: Record<string, string> = {
	'GST 5% - SG': '5', 'GST 12% - SG': '12', 'GST 18 % - SG': '18', 'GST 28% - SG': '28',
};

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
	const { call: saveItemCall, loading } = useFrappePostCall<{ message: string }>(API.saveItem);
	const toast = useToast();
	const [code, setCode] = useState(editRow ? editRow.name : '');
	const [name, setName] = useState(editRow ? String(editRow.item_name ?? '') : '');
	const [uom, setUom] = useState(editRow ? String(editRow.stock_uom ?? 'Nos') : 'Nos');
	const [category, setCategory] = useState(editRow ? String(editRow.custom_category ?? '') : '');
	const [subCat, setSubCat] = useState(editRow ? String(editRow.custom_sub_category ?? '') : '');
	const [hsn, setHsn] = useState('');
	const [gst, setGst] = useState('');
	const [altUoms, setAltUoms] = useState<AltUom[]>([]);
	const [uomSeeded, setUomSeeded] = useState(false);
	const [err, setErr] = useState('');

	// On edit, pull the item's existing UOM conversions + HSN + GST to prefill.
	const itemDoc = useFrappeGetDoc<{
		stock_uom: string;
		uoms: { uom: string; conversion_factor: number }[];
		custom_hsn_code?: string;
		taxes?: { item_tax_template: string }[];
	}>('Item', editRow?.name);
	useEffect(() => {
		if (editRow && itemDoc.data && !uomSeeded) {
			const su = itemDoc.data.stock_uom;
			setAltUoms(
				(itemDoc.data.uoms ?? [])
					.filter((u) => u.uom && u.uom !== su)
					.map((u) => ({ uom: u.uom, cf: String(u.conversion_factor) })),
			);
			setHsn(itemDoc.data.custom_hsn_code ?? '');
			setGst(TEMPLATE_RATE[itemDoc.data.taxes?.[0]?.item_tax_template ?? ''] ?? '');
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
			// One backend path (save_item) for create + edit — keyed on item_code —
			// so the correct flags / item group / HSN / GST always apply.
			await saveItemCall({
				data: {
					item_code: code.trim(),
					item_name: name.trim() || code.trim(),
					stock_uom: uom,
					custom_category: category || null,
					custom_sub_category: subCat || null,
					hsn: hsn.trim() || null,
					gst: gst === '' ? null : Number(gst),
					uoms: uomsPayload,
				},
			});
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
				<Field label="HSN code" hint="Shown on the PO / print">
					<TextInput value={hsn} onChange={setHsn} placeholder="e.g. 2523" />
				</Field>
				<Field label="GST %" hint="Sets the item's tax template">
					<SearchSelect value={gst} onChange={setGst} options={GST_OPTIONS} placeholder="No GST (0%)" />
				</Field>
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

/* --------------------------- PO Terms & Conditions -------------------------- */

// The default Terms printed on every PO. Stored as a "Terms and Conditions"
// master (Default PO Terms) but edited here as plain text — one point per line.
// Each new PO is prefilled with this; a PO can still override its own terms.
function PoTermsPanel() {
	const { data, mutate, isLoading } = useFrappeGetCall<{ message: { terms: string; can_edit: boolean } }>(API.getPoTerms, {});
	const { call: saveCall, loading } = useFrappePostCall<{ message: { terms: string } }>(API.savePoTerms);
	const toast = useToast();
	const canEdit = data?.message?.can_edit ?? false;
	const [text, setText] = useState('');
	const [seeded, setSeeded] = useState(false);
	const [err, setErr] = useState('');

	useEffect(() => {
		if (data?.message && !seeded) {
			setText(termsHtmlToText(data.message.terms || ''));
			setSeeded(true);
		}
	}, [data, seeded]);

	async function save() {
		setErr('');
		try {
			const r = await saveCall({ terms: termsTextToHtml(text) });
			setText(termsHtmlToText(r.message.terms || ''));
			toast.success('PO terms updated');
			mutate();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Card>
			<CHead icon="file-text" title="PO Terms &amp; Conditions" action={canEdit ? undefined : <span className="dim" style={{ fontSize: 11.5 }}>read-only</span>} />
			<div style={{ padding: '2px 2px 4px' }}>
				<div className="sub" style={{ margin: '0 0 12px' }}>
					The Terms &amp; Conditions printed at the bottom of every purchase order — one point per line.
					Each new PO is prefilled with this, and you can still tweak the terms on an individual order.
				</div>
				<TextArea value={text} onChange={setText} rows={7} disabled={!canEdit || isLoading} placeholder="One term per line…" />
				{canEdit && (
					<div className="formfoot" style={{ marginTop: 12 }}>
						{err && <span className="ferr">{err}</span>}
						<span className="spacer" />
						<button className="btn primary" disabled={loading} onClick={() => void save()}>
							{loading ? 'Saving…' : 'Save terms'}
						</button>
					</div>
				)}
			</div>
		</Card>
	);
}

function ReceiptTolerancePanel() {
	const { data, mutate } = useFrappeGetCall<{ message: Tolerance }>(API.getTolerance, {});
	const { call: saveCall, loading } = useFrappePostCall<{ message: { enabled: boolean; pct: number } }>(API.saveTolerance);
	const toast = useToast();
	const canEdit = data?.message?.can_edit ?? false;
	const [enabled, setEnabled] = useState(false);
	const [pct, setPct] = useState('5');
	const [seeded, setSeeded] = useState(false);
	const [err, setErr] = useState('');

	useEffect(() => {
		if (data?.message && !seeded) {
			setEnabled(!!data.message.enabled);
			setPct(String(data.message.pct ?? 0));
			setSeeded(true);
		}
	}, [data, seeded]);

	async function save() {
		setErr('');
		try {
			const r = await saveCall({ enabled, pct: Number(pct) || 0 });
			setEnabled(!!r.message.enabled);
			setPct(String(r.message.pct ?? 0));
			toast.success('Tolerance saved');
			mutate();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Card>
			<CHead icon="package" title="Over-receipt tolerance" action={canEdit ? undefined : <span className="dim" style={{ fontSize: 11.5 }}>read-only</span>} />
			<div style={{ padding: '2px 2px 4px' }}>
				<div className="sub" style={{ margin: '0 0 12px' }}>
					Allow a goods receipt to accept slightly more than the ordered quantity — for when a little extra material arrives. Applies to every item.
				</div>
				<div className="formgrid">
					<Field label="Allow over-receipt">
						<SelectInput value={enabled ? '1' : '0'} onChange={(v) => setEnabled(v === '1')} disabled={!canEdit} options={[{ value: '0', label: 'Off' }, { value: '1', label: 'On' }]} />
					</Field>
					<Field label="Tolerance %" hint="0–100% over the ordered quantity">
						<TextInput value={pct} onChange={setPct} disabled={!canEdit || !enabled} placeholder="5" />
					</Field>
				</div>
				{canEdit && (
					<div className="formfoot" style={{ marginTop: 12 }}>
						{err && <span className="ferr">{err}</span>}
						<span className="spacer" />
						<button className="btn primary" disabled={loading} onClick={() => void save()}>
							{loading ? 'Saving…' : 'Save tolerance'}
						</button>
					</div>
				)}
			</div>
		</Card>
	);
}

/* --------------------------------- Settings --------------------------------- */

/* ------------------------------ Users & Roles ------------------------------- */

/** Multi-select role picker — a user can hold any number of roles. */
function RoleChips({ all, selected, onToggle }: { all: AssignableRole[]; selected: string[]; onToggle: (role: string) => void }) {
	return (
		<div className="rolegrid">
			{all.map((r) => {
				const on = selected.includes(r.role);
				return (
					<button type="button" key={r.role} className={on ? 'rolechip on' : 'rolechip'} onClick={() => onToggle(r.role)}>
						<span className="rc-check">{on ? <Icon name="check" size={12} /> : null}</span>
						<span className="rc-body">
							<span className="rc-label">{r.label}</span>
							<span className="rc-desc">{r.description}</span>
						</span>
					</button>
				);
			})}
		</div>
	);
}

function UserModal({ roles, edit, emailConfigured, onClose, onSaved }: { roles: AssignableRole[]; edit: ManagedUser | null; emailConfigured: boolean; onClose: () => void; onSaved: () => void }) {
	const toast = useToast();
	const { call: createUser, loading: creating } = useFrappePostCall<{ message: { name: string } }>(API.createUser);
	const { call: updateUser, loading: updating } = useFrappePostCall<{ message: { name: string } }>(API.updateUser);
	const { call: resetPwCall, loading: resetting } = useFrappePostCall<{ message: unknown }>(API.resetUserPassword);
	const isEdit = !!edit;
	const [fullName, setFullName] = useState(edit?.full_name ?? '');
	const [email, setEmail] = useState(edit?.email ?? '');
	const [mobile, setMobile] = useState(edit?.mobile_no ?? '');
	const [sel, setSel] = useState<string[]>(edit?.roles ?? []);
	const [enabled, setEnabled] = useState(edit ? edit.enabled === 1 : true);
	const [pwMode, setPwMode] = useState<'password' | 'email'>('password');
	const [password, setPassword] = useState('');
	const [resetPw, setResetPw] = useState('');
	const [done, setDone] = useState<{ email: string; mobile: string; password: string } | null>(null);
	const [err, setErr] = useState('');
	const toggle = (role: string) => setSel((s) => (s.includes(role) ? s.filter((x) => x !== role) : [...s, role]));

	async function save() {
		setErr('');
		try {
			if (isEdit) {
				await updateUser({ data: { user: edit!.name, mobile_no: mobile.trim(), roles: sel, enabled } });
				toast.success('User updated');
				onSaved();
				onClose();
			} else {
				if (!fullName.trim()) return setErr('Enter the user’s name.');
				if (!email.trim()) return setErr('Enter an email address.');
				const wantEmail = pwMode === 'email' && emailConfigured;
				if (!wantEmail && !password.trim()) return setErr('Enter a temporary password.');
				await createUser({
					data: {
						full_name: fullName.trim(),
						email: email.trim(),
						mobile_no: mobile.trim(),
						roles: sel,
						send_welcome_email: wantEmail,
						password: wantEmail ? undefined : password,
					},
				});
				toast.success('User created');
				onSaved();
				if (wantEmail) onClose();
				else setDone({ email: email.trim(), mobile: mobile.trim(), password });
			}
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	async function doReset(viaEmail: boolean) {
		setErr('');
		try {
			if (viaEmail) {
				await resetPwCall({ data: { user: edit!.name, send_email: true } });
				toast.success('Reset link emailed');
				onClose();
			} else {
				if (!resetPw.trim()) return setErr('Enter a new temporary password.');
				await resetPwCall({ data: { user: edit!.name, password: resetPw.trim() } });
				toast.success('Password reset');
				setDone({ email: edit!.email ?? edit!.name, mobile: mobile.trim(), password: resetPw.trim() });
			}
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	// Success view: show the credentials + a WhatsApp share (after create / reset).
	if (done) {
		return (
			<Modal title="Share login" icon="user" onClose={onClose}>
				<div className="credbox">
					<div><span className="ck">Login</span><span className="cv">{done.email}</span></div>
					<div><span className="ck">Temp password</span><span className="cv mono">{done.password}</span></div>
				</div>
				<div className="dim" style={{ fontSize: 11.5, margin: '8px 2px 0' }}>Ask them to change it after the first login.</div>
				<div className="formfoot">
					<span className="spacer" />
					<button className="btn" onClick={onClose}>Done</button>
					{done.mobile ? (
						<a className="btn primary" href={whatsAppCredsUrl(done)} target="_blank" rel="noopener noreferrer">
							<Icon name="whatsapp" size={15} /> Send on WhatsApp
						</a>
					) : (
						<a className="btn primary" href={whatsAppCredsUrl(done)} target="_blank" rel="noopener noreferrer" title="No mobile on file — pick a contact in WhatsApp">
							<Icon name="whatsapp" size={15} /> Share on WhatsApp
						</a>
					)}
				</div>
			</Modal>
		);
	}

	const loading = creating || updating;
	return (
		<Modal title={isEdit ? 'Edit user' : 'New user'} icon="user" onClose={onClose}>
			<div className="formgrid">
				<Field label="Full name" required>
					<TextInput value={fullName} onChange={setFullName} placeholder="e.g. Rishit Nagar" disabled={isEdit} />
				</Field>
				<Field label="Email (login)" required hint={isEdit ? 'Cannot be changed' : undefined}>
					<TextInput value={email} onChange={setEmail} placeholder="name@example.com" disabled={isEdit} />
				</Field>
				<Field label="Mobile" hint="Used for site-receiver lookups & WhatsApp.">
					<TextInput value={mobile} onChange={setMobile} placeholder="10-digit number" />
				</Field>
				{isEdit && (
					<Field label="Status">
						<SelectInput value={enabled ? '1' : '0'} onChange={(v) => setEnabled(v === '1')} options={[{ value: '1', label: 'Active' }, { value: '0', label: 'Disabled' }]} />
					</Field>
				)}
				<div className="span2">
					<Field label="Roles" hint="A user can have multiple roles — tap to toggle.">
						<RoleChips all={roles} selected={sel} onToggle={toggle} />
					</Field>
				</div>
				{!isEdit && (
					<div className="span2">
						<Field label="First login">
							{emailConfigured ? (
								<div className="pwmode">
									<label><input type="radio" name="pwmode" checked={pwMode === 'password'} onChange={() => setPwMode('password')} /> Set a temporary password</label>
									<label><input type="radio" name="pwmode" checked={pwMode === 'email'} onChange={() => setPwMode('email')} /> Email a set-password link</label>
								</div>
							) : null}
							{(pwMode === 'password' || !emailConfigured) ? (
								<TextInput value={password} onChange={setPassword} placeholder="Temporary password — you'll share it (e.g. on WhatsApp)" />
							) : (
								<div className="dim" style={{ fontSize: 11.5, marginTop: 4 }}>
									We’ll email a link to set their own password. (The link expires in ~20 minutes; they can use “Forgot password” after.)
								</div>
							)}
						</Field>
					</div>
				)}
				{isEdit && (
					<div className="span2">
						<Field label="Reset password" hint="Set a new temporary password to share, then send it.">
							<div style={{ display: 'flex', gap: 8 }}>
								<TextInput value={resetPw} onChange={setResetPw} placeholder="New temporary password" />
								<button className="btn" disabled={resetting || !resetPw.trim()} onClick={() => void doReset(false)}>
									{resetting ? 'Resetting…' : 'Reset'}
								</button>
							</div>
							{emailConfigured && (
								<button className="btn" style={{ marginTop: 8 }} disabled={resetting} onClick={() => void doReset(true)}>
									Email a reset link instead
								</button>
							)}
						</Field>
					</div>
				)}
			</div>
			<div className="formfoot">
				{err && <span className="ferr">{err}</span>}
				<span className="spacer" />
				<button className="btn" onClick={onClose}>Cancel</button>
				<button className="btn primary" disabled={loading} onClick={() => void save()}>
					{loading ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
				</button>
			</div>
		</Modal>
	);
}

function UsersPanel() {
	const usersRes = useFrappeGetCall<{ message: ManagedUser[] }>(API.usersList, {}, 'pf:users');
	const rolesRes = useFrappeGetCall<{ message: AssignableRole[] }>(API.assignableRoles, {}, 'pf:assignable-roles');
	const capsRes = useFrappeGetCall<{ message: Capabilities }>(API.capabilities, undefined, 'pf:caps');
	const emailConfigured = !!capsRes.data?.message?.email_configured;
	const users = usersRes.data?.message ?? [];
	const roleDefs = rolesRes.data?.message ?? [];
	const roleLabel = (r: string) => roleDefs.find((d) => d.role === r)?.label ?? r;
	const [q, setQ] = useState('');
	const [modal, setModal] = useState<{ edit: ManagedUser | null } | null>(null);
	const shown = useMemo(() => {
		const s = q.trim().toLowerCase();
		if (!s) return users;
		return users.filter((u) => [u.full_name, u.email, u.mobile_no, ...u.roles].some((v) => String(v ?? '').toLowerCase().includes(s)));
	}, [users, q]);

	const refresh = () => void usersRes.mutate();

	return (
		<Card>
			<CHead
				icon="user"
				title="Users"
				count={users.length}
				action={<a href="#" onClick={(e) => { e.preventDefault(); setModal({ edit: null }); }}>New user</a>}
			/>
			{users.length === 0 ? (
				<EmptyMsg title="No users yet" text="Add your first team member." />
			) : (
				<>
					<SearchRow q={q} setQ={setQ} shown={shown.length} total={users.length} />
					{shown.length === 0 ? (
						<EmptyMsg title="No matches" text="Adjust your search." />
					) : (
						<div className="tablescroll">
							<table className="clickable">
								<thead>
									<tr><th>Name</th><th>Email</th><th>Mobile</th><th>Roles</th><th>Status</th></tr>
								</thead>
								<tbody>
									{shown.map((u) => (
										<tr key={u.name} onClick={() => setModal({ edit: u })}>
											<td className="c1">{u.full_name || u.name}{u.is_admin && <span className="dim" style={{ fontSize: 10.5, marginLeft: 6 }}>admin</span>}</td>
											<td className="dim">{u.email}</td>
											<td className="mono">{u.mobile_no || '—'}</td>
											<td>{u.roles.length ? <span className="rolepills">{u.roles.map((r) => <span key={r} className="rolepill">{roleLabel(r)}</span>)}</span> : <span className="dim">—</span>}</td>
											<td>{u.enabled ? <span className="rolepill ok">Active</span> : <span className="rolepill off">Disabled</span>}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}
			{modal && <UserModal roles={roleDefs} edit={modal.edit} emailConfigured={emailConfigured} onClose={() => setModal(null)} onSaved={refresh} />}
		</Card>
	);
}

const SETTINGS_TABS = [
	{ key: 'catalog', label: 'Catalog' },
	{ key: 'organization', label: 'Suppliers & Projects' },
	{ key: 'documents', label: 'Documents' },
	{ key: 'users', label: 'Users & Roles' },
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number]['key'];

export function Settings() {
	const { data, isLoading } = useFrappeGetCall<{ message: Record<string, boolean> }>(API.settingsCanCreate, {});
	const can = data?.message ?? {};
	// Fail safe: keep panels read-only until perms are known, so we never flash a
	// "New" / edit affordance the user can't actually use.
	const allow = (dt: string) => !isLoading && can[dt] === true;

	const capsRes = useFrappeGetCall<{ message: Capabilities }>(API.capabilities, undefined, 'pf:caps');
	const canManageUsers = !!capsRes.data?.message?.manage_users;
	const tabs = SETTINGS_TABS.filter((t) => t.key !== 'users' || canManageUsers);

	const [sp, setSp] = useSearchParams();
	const urlTab = sp.get('tab') as SettingsTab | null;
	const [tab, setTab] = useState<SettingsTab>(urlTab && SETTINGS_TABS.some((t) => t.key === urlTab) ? urlTab : 'catalog');
	const activeTab: SettingsTab = tabs.some((t) => t.key === tab) ? tab : 'catalog';
	function selectTab(k: SettingsTab) {
		setTab(k);
		const next = new URLSearchParams(sp);
		next.set('tab', k);
		setSp(next, { replace: true });
	}

	return (
		<main>
			<div className="eyebrow">Workspace</div>
			<h1 style={{ fontFamily: 'var(--font-ui)', color: 'var(--fg-1)' }}>
				Masters &amp; <em style={{ fontStyle: 'normal', color: 'var(--iris)' }}>settings</em>
			</h1>
			<div className="sub">Add or edit the masters used across material requests, purchase orders and receipts. Search a list and tap a row to edit it.</div>

			<div className="dtabs" style={{ marginTop: 18 }}>
				{tabs.map((t) => (
					<button key={t.key} className={activeTab === t.key ? 'dtab on' : 'dtab'} onClick={() => selectTab(t.key)}>
						{t.label}
					</button>
				))}
			</div>

			<div className="stack" style={{ marginTop: 18 }}>
				{activeTab === 'catalog' && (
					<>
						<ItemPanel canCreate={allow('Item')} />
						<SimpleMaster doctype="Material Category" icon="layers" title="Categories" noun="Category" field="category_name" placeholder="e.g. Plumbing" canCreate={allow('Material Category')} />
						<SubCategoryPanel canCreate={allow('Material Sub Category')} />
						<SimpleMaster doctype="UOM" icon="cube" title="Units" noun="Unit" field="uom_name" placeholder="e.g. Box" canCreate={allow('UOM')} />
					</>
				)}
				{activeTab === 'organization' && (
					<>
						<SupplierPanel canCreate={allow('Supplier')} />
						<SimpleMaster doctype="Company Master" icon="building" title="Companies" noun="Company" field="company_name" placeholder="e.g. Pushpa Construction" canCreate={allow('Company Master')} />
						<ProjectPanel canCreate={allow('Project Master')} />
						<StorePanel canCreate={allow('Warehouse')} />
					</>
				)}
				{activeTab === 'documents' && (
					<>
						<PoTermsPanel />
						<ReceiptTolerancePanel />
					</>
				)}
				{activeTab === 'users' && canManageUsers && <UsersPanel />}
			</div>

			<footer>
				<b>ProcureFlow</b> · DUX Digitech
			</footer>
		</main>
	);
}
