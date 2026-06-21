import { useMemo, useState } from 'react';
import { useFrappeCreateDoc, useFrappeGetCall, useFrappeGetDocList } from 'frappe-react-sdk';
import { API } from '../lib/api';
import { Card, CHead, EmptyMsg, Modal } from '../components/ui';
import { Field, SearchSelect, SelectInput, TextInput } from '../components/form';
import type { IconName } from '../components/Icon';
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
	const { createDoc, loading } = useFrappeCreateDoc();
	const toast = useToast();
	const [modal, setModal] = useState(false);
	const [val, setVal] = useState('');
	const [err, setErr] = useState('');
	const rows = data ?? [];

	async function save() {
		if (!val.trim()) return setErr(`${noun} name is required.`);
		setErr('');
		try {
			await createDoc(doctype, { [field]: val.trim() });
			toast.success(`${noun} created`);
			setVal('');
			setModal(false);
			mutate();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Card>
			<CHead
				icon={icon}
				title={title}
				count={rows.length}
				action={newAction(canCreate, () => { setErr(''); setModal(true); })}
			/>
			{rows.length === 0 ? (
				<EmptyMsg title={`No ${title.toLowerCase()} yet`} text={`Add a ${noun.toLowerCase()}.`} />
			) : (
				<div className="tablescroll">
					<table>
						<thead><tr><th>{noun}</th></tr></thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.name}><td className="c1">{String(r[lf] ?? r.name)}</td></tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{modal && (
				<Modal title={`New ${noun.toLowerCase()}`} icon={icon} onClose={() => setModal(false)}>
					<div className="formgrid">
						<div className="span2">
							<Field label={`${noun} name`} required>
								<TextInput value={val} onChange={setVal} placeholder={placeholder} />
							</Field>
						</div>
					</div>
					<div className="formfoot">
						{err && <span className="ferr">{err}</span>}
						<span className="spacer" />
						<button className="btn" onClick={() => setModal(false)}>Cancel</button>
						<button className="btn primary" disabled={loading} onClick={() => void save()}>
							{loading ? 'Creating…' : `Create ${noun.toLowerCase()}`}
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
	const { createDoc, loading } = useFrappeCreateDoc();
	const toast = useToast();
	const [modal, setModal] = useState(false);
	const [val, setVal] = useState('');
	const [cat, setCat] = useState('');
	const [err, setErr] = useState('');
	const rows = data ?? [];

	async function save() {
		if (!val.trim()) return setErr('Sub-category name is required.');
		if (!cat) return setErr('Pick the parent category.');
		setErr('');
		try {
			await createDoc('Material Sub Category', { sub_category_name: val.trim(), material_category: cat });
			toast.success('Sub-category created');
			setVal(''); setCat(''); setModal(false); mutate();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Card>
			<CHead icon="layers" title="Sub-categories" count={rows.length}
				action={newAction(canCreate, () => { setErr(''); setModal(true); })} />
			{rows.length === 0 ? (
				<EmptyMsg title="No sub-categories yet" text="Add a sub-category under a category." />
			) : (
				<div className="tablescroll">
					<table>
						<thead><tr><th>Sub-category</th><th>Category</th></tr></thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.name}>
									<td className="c1">{String(r.sub_category_name ?? r.name)}</td>
									<td className="dim">{String(r.material_category ?? '—')}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{modal && (
				<Modal title="New sub-category" icon="layers" onClose={() => setModal(false)}>
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
						<button className="btn" onClick={() => setModal(false)}>Cancel</button>
						<button className="btn primary" disabled={loading} onClick={() => void save()}>
							{loading ? 'Creating…' : 'Create sub-category'}
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
	const { createDoc, loading } = useFrappeCreateDoc();
	const toast = useToast();
	const [modal, setModal] = useState(false);
	const [val, setVal] = useState('');
	const [company, setCompany] = useState('');
	const [store, setStore] = useState('');
	const [err, setErr] = useState('');
	const rows = data ?? [];

	async function save() {
		if (!val.trim()) return setErr('Project name is required.');
		setErr('');
		try {
			await createDoc('Project Master', {
				project_name: val.trim(),
				company_name: company || undefined,
				store_name: store || undefined,
			});
			toast.success('Project created');
			setVal(''); setCompany(''); setStore(''); setModal(false); mutate();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Card>
			<CHead icon="building" title="Projects" count={rows.length}
				action={newAction(canCreate, () => { setErr(''); setModal(true); })} />
			{rows.length === 0 ? (
				<EmptyMsg title="No projects yet" text="Add a project with its company and store." />
			) : (
				<div className="tablescroll">
					<table>
						<thead><tr><th>Project</th><th>Company</th><th>Store</th></tr></thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.name}>
									<td className="c1">{String(r.project_name ?? r.name)}</td>
									<td className="dim">{String(r.company_name ?? '—')}</td>
									<td className="dim">{String(r.store_name ?? '—')}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{modal && (
				<Modal title="New project" icon="building" onClose={() => setModal(false)}>
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
						<button className="btn" onClick={() => setModal(false)}>Cancel</button>
						<button className="btn primary" disabled={loading} onClick={() => void save()}>
							{loading ? 'Creating…' : 'Create project'}
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
	const { createDoc, loading } = useFrappeCreateDoc();
	const toast = useToast();
	const [modal, setModal] = useState(false);
	const [val, setVal] = useState('');
	const [company, setCompany] = useState('');
	const [parent, setParent] = useState('');
	const [err, setErr] = useState('');
	const rows = data ?? [];

	async function save() {
		if (!val.trim()) return setErr('Store name is required.');
		if (!company) return setErr('Pick the company.');
		setErr('');
		try {
			await createDoc('Warehouse', {
				warehouse_name: val.trim(),
				company,
				parent_warehouse: parent || undefined,
			});
			toast.success('Store created');
			setVal(''); setParent(''); setModal(false); mutate();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Card>
			<CHead icon="package" title="Stores" count={rows.length}
				action={newAction(canCreate, () => { setErr(''); setModal(true); })} />
			{rows.length === 0 ? (
				<EmptyMsg title="No stores yet" text="Add a store (warehouse)." />
			) : (
				<div className="tablescroll">
					<table>
						<thead><tr><th>Store</th><th>Company</th></tr></thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.name}>
									<td className="c1">{String(r.warehouse_name ?? r.name)}</td>
									<td className="dim">{String(r.company ?? '—')}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{modal && (
				<Modal title="New store" icon="package" onClose={() => setModal(false)}>
					<div className="formgrid">
						<div className="span2">
							<Field label="Store name" required>
								<TextInput value={val} onChange={setVal} placeholder="e.g. Site Store" />
							</Field>
						</div>
						<Field label="Company" required>
							<SearchSelect value={company} onChange={setCompany} options={opts(companies.data)} placeholder="Select company…" />
						</Field>
						<Field label="Parent warehouse" hint="Optional — a group warehouse">
							<SearchSelect value={parent} onChange={setParent} options={opts(groups.data)} placeholder="Select parent…" />
						</Field>
					</div>
					<div className="formfoot">
						{err && <span className="ferr">{err}</span>}
						<span className="spacer" />
						<button className="btn" onClick={() => setModal(false)}>Cancel</button>
						<button className="btn primary" disabled={loading} onClick={() => void save()}>
							{loading ? 'Creating…' : 'Create store'}
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
	const { createDoc, loading } = useFrappeCreateDoc();
	const toast = useToast();
	const [modal, setModal] = useState(false);
	const [name, setName] = useState('');
	const [group, setGroup] = useState('');
	const [err, setErr] = useState('');
	const rows = data ?? [];

	async function save() {
		if (!name.trim()) return setErr('Supplier name is required.');
		setErr('');
		try {
			await createDoc('Supplier', { supplier_name: name.trim(), supplier_group: group || undefined });
			toast.success('Supplier created');
			setName(''); setGroup(''); setModal(false); mutate();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Card>
			<CHead icon="building" title="Suppliers" count={rows.length}
				action={newAction(canCreate, () => { setErr(''); setModal(true); })} />
			{rows.length === 0 ? (
				<EmptyMsg title="No suppliers yet" text="Add a supplier to use it on purchase orders." />
			) : (
				<div className="tablescroll">
					<table>
						<thead><tr><th>Supplier</th><th>Group</th></tr></thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.name}>
									<td className="c1">{String(r.supplier_name ?? r.name)}</td>
									<td className="dim">{String(r.supplier_group ?? '—')}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{modal && (
				<Modal title="New supplier" icon="building" onClose={() => setModal(false)}>
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
						<button className="btn" onClick={() => setModal(false)}>Cancel</button>
						<button className="btn primary" disabled={loading} onClick={() => void save()}>
							{loading ? 'Creating…' : 'Create supplier'}
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
		limit: 40,
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
	const rows = data ?? [];

	return (
		<Card>
			<CHead icon="cube" title="Items" count={rows.length}
				action={newAction(canCreate, () => setModal(true))} />
			{rows.length === 0 ? (
				<EmptyMsg title="No items" text="Add an item with its category and sub-category." />
			) : (
				<div className="tablescroll">
					<table>
						<thead>
							<tr><th>Item</th><th>Category</th><th>Sub-category</th><th>UOM</th></tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.name}>
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
			{modal && (
				<ItemModal
					uoms={opts(uoms.data)}
					categories={opts(categories.data)}
					subCats={subCats.data ?? []}
					onClose={() => setModal(false)}
					onSaved={() => { setModal(false); mutate(); }}
				/>
			)}
		</Card>
	);
}

function ItemModal({
	uoms,
	categories,
	subCats,
	onClose,
	onSaved,
}: {
	uoms: { value: string }[];
	categories: { value: string }[];
	subCats: { name: string; material_category: string }[];
	onClose: () => void;
	onSaved: () => void;
}) {
	const { createDoc, loading } = useFrappeCreateDoc();
	const toast = useToast();
	const [code, setCode] = useState('');
	const [name, setName] = useState('');
	const [uom, setUom] = useState('Nos');
	const [category, setCategory] = useState('');
	const [subCat, setSubCat] = useState('');
	const [err, setErr] = useState('');

	const subOptions = useMemo(
		() => subCats.filter((s) => !category || s.material_category === category).map((s) => ({ value: s.name })),
		[subCats, category],
	);

	async function save() {
		if (!code.trim()) return setErr('Item code is required.');
		if (!uom) return setErr('Pick a default UOM.');
		setErr('');
		try {
			await createDoc('Item', {
				item_code: code.trim(),
				item_name: name.trim() || code.trim(),
				item_group: DEFAULT_ITEM_GROUP,
				stock_uom: uom,
				custom_category: category || undefined,
				custom_sub_category: subCat || undefined,
			});
			toast.success('Item created');
			onSaved();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Modal title="New item" icon="cube" onClose={onClose}>
			<div className="formgrid">
				<Field label="Item code" required>
					<TextInput value={code} onChange={setCode} placeholder="e.g. ITEM-0210" />
				</Field>
				<Field label="Item name">
					<TextInput value={name} onChange={setName} placeholder="Defaults to the code" />
				</Field>
				<Field label="Default UOM" required>
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
			</div>
			<div className="formfoot">
				{err && <span className="ferr">{err}</span>}
				<span className="spacer" />
				<button className="btn" onClick={onClose}>Cancel</button>
				<button className="btn primary" disabled={loading} onClick={() => void save()}>
					{loading ? 'Creating…' : 'Create item'}
				</button>
			</div>
		</Modal>
	);
}

/* --------------------------------- Settings --------------------------------- */

export function Settings() {
	const { data } = useFrappeGetCall<{ message: Record<string, boolean> }>(API.settingsCanCreate, {});
	const can = data?.message ?? {};
	const allow = (dt: string) => can[dt] !== false; // default to allowed until perms load

	return (
		<main>
			<div className="eyebrow">Workspace</div>
			<h1 style={{ fontFamily: 'var(--font-ui)', color: 'var(--fg-1)' }}>
				Masters &amp; <em style={{ fontStyle: 'normal', color: 'var(--iris)' }}>settings</em>
			</h1>
			<div className="sub">Add the masters used across material requests, purchase orders and receipts.</div>

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
