import { useMemo, useState } from 'react';
import { useFrappeCreateDoc, useFrappeGetDocList } from 'frappe-react-sdk';
import { Card, CHead, EmptyMsg, Modal } from '../components/ui';
import { Field, SearchSelect, SelectInput, TextInput } from '../components/form';
import { parseServerError } from '../lib/format';

interface Row {
	name: string;
	[k: string]: unknown;
}

function opts(rows: { name: string }[] | undefined) {
	return (rows ?? []).map((r) => ({ value: r.name }));
}

/* --------------------------------- Suppliers -------------------------------- */

function SupplierPanel() {
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
	const [modal, setModal] = useState(false);
	const rows = data ?? [];

	return (
		<Card>
			<CHead
				icon="building"
				title="Suppliers"
				count={rows.length}
				action={
					<a href="#" onClick={(e) => { e.preventDefault(); setModal(true); }}>
						New
					</a>
				}
			/>
			{rows.length === 0 ? (
				<EmptyMsg title="No suppliers yet" text="Add a supplier to use it on purchase orders." />
			) : (
				<div className="tablescroll">
					<table>
						<thead>
							<tr>
								<th>Supplier</th>
								<th>Group</th>
							</tr>
						</thead>
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
				<SupplierModal
					groups={opts(groups.data)}
					onClose={() => setModal(false)}
					onSaved={() => {
						setModal(false);
						mutate();
					}}
				/>
			)}
		</Card>
	);
}

function SupplierModal({
	groups,
	onClose,
	onSaved,
}: {
	groups: { value: string }[];
	onClose: () => void;
	onSaved: () => void;
}) {
	const { createDoc, loading } = useFrappeCreateDoc();
	const [name, setName] = useState('');
	const [group, setGroup] = useState('');
	const [err, setErr] = useState('');

	async function save() {
		if (!name.trim()) return setErr('Supplier name is required.');
		setErr('');
		try {
			await createDoc('Supplier', {
				supplier_name: name.trim(),
				supplier_group: group || undefined,
			});
			onSaved();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	return (
		<Modal title="New supplier" icon="building" onClose={onClose}>
			<div className="formgrid">
				<div className="span2">
					<Field label="Supplier name" required>
						<TextInput value={name} onChange={setName} placeholder="e.g. Ajmera Hardware" />
					</Field>
				</div>
				<div className="span2">
					<Field label="Supplier group">
						<SearchSelect value={group} onChange={setGroup} options={groups} placeholder="Select group…" />
					</Field>
				</div>
			</div>
			<div className="formfoot">
				{err && <span className="ferr">{err}</span>}
				<span className="spacer" />
				<button className="btn" onClick={onClose}>
					Cancel
				</button>
				<button className="btn primary" disabled={loading} onClick={() => void save()}>
					{loading ? 'Creating…' : 'Create supplier'}
				</button>
			</div>
		</Modal>
	);
}

/* ----------------------------------- Items ---------------------------------- */

function ItemPanel() {
	const { data, mutate } = useFrappeGetDocList<Row>('Item', {
		fields: ['name', 'item_name', 'item_group', 'stock_uom', 'custom_category', 'custom_sub_category'],
		orderBy: { field: 'modified', order: 'desc' },
		limit: 40,
	});
	const itemGroups = useFrappeGetDocList<{ name: string }>('Item Group', {
		filters: [['is_group', '=', 0]],
		fields: ['name'],
		orderBy: { field: 'name', order: 'asc' },
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
	const rows = data ?? [];

	return (
		<Card>
			<CHead
				icon="cube"
				title="Items"
				count={rows.length}
				action={
					<a href="#" onClick={(e) => { e.preventDefault(); setModal(true); }}>
						New
					</a>
				}
			/>
			{rows.length === 0 ? (
				<EmptyMsg title="No items" text="Add an item with its category and sub-category." />
			) : (
				<div className="tablescroll">
					<table>
						<thead>
							<tr>
								<th>Item</th>
								<th>Category</th>
								<th>Sub-category</th>
								<th>UOM</th>
							</tr>
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
					itemGroups={opts(itemGroups.data)}
					uoms={opts(uoms.data)}
					categories={opts(categories.data)}
					subCats={subCats.data ?? []}
					onClose={() => setModal(false)}
					onSaved={() => {
						setModal(false);
						mutate();
					}}
				/>
			)}
		</Card>
	);
}

function ItemModal({
	itemGroups,
	uoms,
	categories,
	subCats,
	onClose,
	onSaved,
}: {
	itemGroups: { value: string }[];
	uoms: { value: string }[];
	categories: { value: string }[];
	subCats: { name: string; material_category: string }[];
	onClose: () => void;
	onSaved: () => void;
}) {
	const { createDoc, loading } = useFrappeCreateDoc();
	const [code, setCode] = useState('');
	const [name, setName] = useState('');
	const [group, setGroup] = useState('');
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
		if (!group) return setErr('Pick an item group.');
		if (!uom) return setErr('Pick a default UOM.');
		setErr('');
		try {
			await createDoc('Item', {
				item_code: code.trim(),
				item_name: name.trim() || code.trim(),
				item_group: group,
				stock_uom: uom,
				custom_category: category || undefined,
				custom_sub_category: subCat || undefined,
			});
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
				<Field label="Item group" required>
					<SearchSelect value={group} onChange={setGroup} options={itemGroups} placeholder="Select group…" />
				</Field>
				<Field label="Default UOM" required>
					<SearchSelect value={uom} onChange={setUom} options={uoms} placeholder="Select UOM…" />
				</Field>
				<Field label="Category" hint="Drives the item picker on material requests">
					<SelectInput
						value={category}
						onChange={(v) => {
							setCategory(v);
							setSubCat('');
						}}
						options={categories}
						allowEmpty
						placeholder="—"
					/>
				</Field>
				<Field label="Sub-category" hint="Optional — items can have none">
					<SearchSelect value={subCat} onChange={setSubCat} options={subOptions} placeholder="Select sub-category…" />
				</Field>
			</div>
			<div className="formfoot">
				{err && <span className="ferr">{err}</span>}
				<span className="spacer" />
				<button className="btn" onClick={onClose}>
					Cancel
				</button>
				<button className="btn primary" disabled={loading} onClick={() => void save()}>
					{loading ? 'Creating…' : 'Create item'}
				</button>
			</div>
		</Modal>
	);
}

/* --------------------------------- Settings --------------------------------- */

export function Settings() {
	return (
		<main>
			<div className="eyebrow">Workspace</div>
			<h1 style={{ fontFamily: 'var(--font-ui)', color: 'var(--fg-1)' }}>
				Masters &amp; <em style={{ fontStyle: 'normal', color: 'var(--iris)' }}>settings</em>
			</h1>
			<div className="sub">Suppliers and items used across material requests and purchase orders.</div>

			<div className="stack" style={{ marginTop: 22 }}>
				<SupplierPanel />
				<ItemPanel />
			</div>

			<footer>
				<b>ProcureFlow</b> · DUX Digitech
			</footer>
		</main>
	);
}
