import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
	useFrappeGetCall,
	useFrappePostCall,
	useFrappeFileUpload,
	useFrappeUpdateDoc,
} from 'frappe-react-sdk';
import {
	API,
	stateTag,
	type MrContext,
	type ItemOption,
	type MrDetail,
	type SaveMrResult,
} from '../lib/api';
import { SearchSelect } from '../components/SearchSelect';
import { parseServerError } from '../lib/format';

interface LineRow {
	item_code: string;
	item_name: string;
	uom: string;
	sub_category: string | null;
	qty: string;
	specification: string;
	schedule_date: string;
}

export function NewMaterialRequest() {
	const { id } = useParams();
	const navigate = useNavigate();
	const isEdit = !!id;

	const ctxRes = useFrappeGetCall<{ message: MrContext }>(API.mrContext, {});
	const ctx = ctxRes.data?.message;

	const detailRes = useFrappeGetCall<{ message: MrDetail }>(
		API.mrDetail,
		{ name: id },
		isEdit ? undefined : null,
	);
	const detail = detailRes.data?.message;
	const readOnly = !!detail && detail.docstatus !== 0;

	const [category, setCategory] = useState('');
	const [project, setProject] = useState('');
	const [department, setDepartment] = useState('');
	const [priority, setPriority] = useState('Medium');
	const [requiredBy, setRequiredBy] = useState('');
	const [remark, setRemark] = useState('');
	const [lines, setLines] = useState<LineRow[]>([]);
	const [err, setErr] = useState('');
	const [seeded, setSeeded] = useState(false);

	const { call: saveMr, loading: saving } = useFrappePostCall<{ message: SaveMrResult }>(API.saveMr);
	const { upload, loading: uploading } = useFrappeFileUpload();
	const { updateDoc } = useFrappeUpdateDoc();
	const fileRef = useRef<HTMLInputElement>(null);
	const [attachment, setAttachment] = useState<string | null>(null);

	useEffect(() => {
		if (!isEdit && ctx && !requiredBy) setRequiredBy(ctx.today);
	}, [ctx, isEdit, requiredBy]);

	useEffect(() => {
		if (isEdit && detail && !seeded) {
			setCategory(detail.category ?? '');
			setProject(detail.project ?? '');
			setDepartment(detail.department ?? '');
			setPriority(detail.priority ?? 'Medium');
			setRequiredBy(detail.schedule_date ?? '');
			setRemark(detail.remark ?? '');
			setAttachment(detail.attachment ?? null);
			setLines(
				detail.items.map((it) => ({
					item_code: it.item_code,
					item_name: it.item_name,
					uom: it.uom,
					sub_category: it.sub_category,
					qty: String(it.qty ?? ''),
					specification: it.specification ?? '',
					schedule_date: it.schedule_date ?? '',
				})),
			);
			setSeeded(true);
		}
	}, [isEdit, detail, seeded]);

	const itemsRes = useFrappeGetCall<{ message: ItemOption[] }>(
		API.itemSearch,
		{ category },
		category ? undefined : null,
	);
	const itemOptions = itemsRes.data?.message ?? [];
	const pickerOptions = useMemo(
		() =>
			itemOptions.map((o) => ({
				value: o.value,
				label: o.label,
				sub: o.sub_category ? `${o.sub_category} · ${o.uom}` : o.uom || '',
			})),
		[itemOptions],
	);

	const storeName = useMemo(
		() => ctx?.projects.find((p) => p.name === project)?.store_name ?? '',
		[ctx, project],
	);

	function onCategoryChange(v: string) {
		setCategory(v);
		setLines([]);
	}
	function addItem(itemCode: string) {
		if (!itemCode || lines.some((l) => l.item_code === itemCode)) return;
		const opt = itemOptions.find((o) => o.value === itemCode);
		if (!opt) return;
		setLines((ls) => [
			...ls,
			{
				item_code: opt.value,
				item_name: opt.label,
				uom: opt.uom,
				sub_category: opt.sub_category,
				qty: '',
				specification: '',
				schedule_date: requiredBy,
			},
		]);
	}
	function setLine(i: number, patch: Partial<LineRow>) {
		setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
	}
	function removeLine(i: number) {
		setLines((ls) => ls.filter((_, idx) => idx !== i));
	}

	async function save(strict: boolean) {
		setErr('');
		if (!category) return setErr('Pick a category first.');
		if (strict) {
			if (lines.length === 0) return setErr('Add at least one item.');
			if (lines.some((l) => !l.qty || Number(l.qty) <= 0))
				return setErr('Every line needs a quantity greater than zero.');
		}
		try {
			const payload = {
				name: id ?? null,
				category,
				project: project || null,
				department: department || null,
				priority,
				schedule_date: requiredBy || null,
				remark,
				items: lines.map((l) => ({
					item_code: l.item_code,
					qty: Number(l.qty) || 0,
					uom: l.uom,
					schedule_date: l.schedule_date || null,
					specification: l.specification,
				})),
			};
			const res = await saveMr({ data: payload });
			navigate('/material-requests/' + res.message.name);
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	async function onFile(file: File) {
		if (!id) return;
		setErr('');
		try {
			const res = await upload(file, {
				doctype: 'Material Request',
				docname: id,
				fieldname: 'custom_add_receipt',
				isPrivate: true,
			});
			await updateDoc('Material Request', id, { custom_add_receipt: res.file_url });
			setAttachment(res.file_url);
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	const busy = saving || uploading;

	return (
		<main>
			<div className="crumb">
				<a onClick={() => navigate('/material-requests')} style={{ cursor: 'pointer' }}>
					Material requests
				</a>
				&nbsp;/&nbsp;
				<span className="data">{isEdit ? id : 'New'}</span>
			</div>
			<div className="titlebar">
				<div>
					<div className="eyebrow">Procurement</div>
					<h1 style={{ color: 'var(--fg-1)', fontFamily: 'var(--font-ui)' }}>
						{isEdit ? 'Material request' : 'New material request'}
					</h1>
					{detail?.workflow_state && (
						<div style={{ marginTop: 8 }}>
							<span className={'tag ' + stateTag(detail.workflow_state)}>{detail.workflow_state}</span>
						</div>
					)}
				</div>
				<div className="spacer" />
				{!readOnly && (
					<>
						<button className="btn" disabled={busy} onClick={() => save(false)}>
							Save draft
						</button>
						<button className="btn primary" disabled={busy} onClick={() => save(true)}>
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
								<path d="M4 12l5 5L20 6" />
							</svg>
							{saving ? 'Saving…' : 'Submit for approval'}
						</button>
					</>
				)}
			</div>

			{err && (
				<div className="alert">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
						<circle cx="12" cy="12" r="9" />
						<path d="M12 8v5M12 16h.01" />
					</svg>
					<b>Couldn’t save.</b> {err}
				</div>
			)}

			<div className="grid">
				<div className="stack">
					<section className="card accent">
						<div className="chead">
							<div className="ttl">Request details</div>
						</div>
						<div className="formgrid">
							<div className="field">
								<label className="flabel">
									Category <em>*</em>
								</label>
								<select
									className="inp"
									value={category}
									disabled={readOnly}
									onChange={(e) => onCategoryChange(e.target.value)}
								>
									<option value="">Select category…</option>
									{ctx?.categories.map((c) => (
										<option key={c} value={c}>
											{c}
										</option>
									))}
								</select>
								<span className="fhint">Pick the category first — items are filtered to this category.</span>
							</div>
							<div className="field">
								<label className="flabel">Project</label>
								<SearchSelect
									value={project}
									onChange={setProject}
									disabled={readOnly}
									placeholder="Select project…"
									options={(ctx?.projects ?? []).map((p) => ({
										value: p.name,
										label: p.project_name || p.name,
										sub: p.store_name ? `Store: ${p.store_name}` : undefined,
									}))}
								/>
								<span className="fhint">Store / warehouse auto-fills from the project.</span>
							</div>
							<div className="field">
								<label className="flabel">Department</label>
								<select
									className="inp"
									value={department}
									disabled={readOnly}
									onChange={(e) => setDepartment(e.target.value)}
								>
									<option value="">—</option>
									{ctx?.departments.map((d) => (
										<option key={d} value={d}>
											{d}
										</option>
									))}
								</select>
							</div>
							<div className="field">
								<label className="flabel">Priority</label>
								<select
									className="inp"
									value={priority}
									disabled={readOnly}
									onChange={(e) => setPriority(e.target.value)}
								>
									{(ctx?.priorities ?? ['Low', 'Medium', 'High']).map((p) => (
										<option key={p} value={p}>
											{p}
										</option>
									))}
								</select>
							</div>
							<div className="field">
								<label className="flabel">Required by</label>
								<input
									className="inp mono"
									type="date"
									value={requiredBy}
									disabled={readOnly}
									onChange={(e) => setRequiredBy(e.target.value)}
								/>
							</div>
							<div className="field">
								<label className="flabel">Store / warehouse</label>
								<input className="inp" disabled value={storeName || '—'} />
							</div>
							<div className="field span2">
								<label className="flabel">Remark</label>
								<textarea
									className="inp area"
									rows={2}
									value={remark}
									disabled={readOnly}
									placeholder="Header note for the whole request…"
									onChange={(e) => setRemark(e.target.value)}
								/>
							</div>
							<div className="field span2">
								<label className="flabel">Attachment</label>
								<input
									ref={fileRef}
									type="file"
									style={{ display: 'none' }}
									onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
								/>
								<div
									className={'upload' + (isEdit && !readOnly ? '' : ' disabled')}
									onClick={() => isEdit && !readOnly && fileRef.current?.click()}
								>
									<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
										<path d="M12 16V4m0 0l-4 4m4-4l4 4" />
										<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
									</svg>
									<div>
										{attachment ? (
											<a href={attachment} target="_blank" rel="noreferrer" style={{ color: 'var(--iris)' }}>
												View attached file
											</a>
										) : isEdit && !readOnly ? (
											<>
												{uploading ? 'Uploading…' : 'Drop a file or '}
												{!uploading && <span style={{ color: 'var(--iris)', fontWeight: 500 }}>browse</span>}
												&nbsp;<span className="dim">PO/indent scan, drawing — header level</span>
											</>
										) : (
											<span className="dim">Save the request first to attach a file.</span>
										)}
									</div>
								</div>
							</div>
						</div>
					</section>

					<section className="card">
						<div className="chead">
							<div className="ttl">Items</div>
							<div className="cnt">{lines.length} lines</div>
						</div>
						{!readOnly && (
							<div className="addwrap">
								<SearchSelect
									value={''}
									onChange={addItem}
									disabled={!category}
									placeholder={category ? 'Search and add an item…' : 'Pick a category first'}
									options={pickerOptions}
								/>
							</div>
						)}
						<div className="itemhead">
							<span>#</span>
							<span>Item</span>
							<span>Sub-category</span>
							<span>Qty</span>
							<span>UOM</span>
							<span>Specification</span>
							<span>Required by</span>
							<span />
						</div>
						{lines.length === 0 && (
							<div className="empty" style={{ padding: '28px 18px' }}>
								<div className="t2">No items yet. {category ? 'Add items above.' : 'Pick a category first.'}</div>
							</div>
						)}
						{lines.map((l, i) => (
							<div className="itemrow" key={l.item_code}>
								<span className="ix">{i + 1}</span>
								<div className="iname">
									<div className="t1">{l.item_name}</div>
									<div className="t2">{l.item_code}</div>
								</div>
								<span>
									{l.sub_category ? (
										<span className="subpill">{l.sub_category}</span>
									) : (
										<span className="nosub">No sub-category</span>
									)}
								</span>
								<input
									className="inp mono"
									value={l.qty}
									disabled={readOnly}
									inputMode="decimal"
									onChange={(e) => setLine(i, { qty: e.target.value })}
								/>
								<input className="inp" value={l.uom} disabled />
								<input
									className="inp"
									value={l.specification}
									disabled={readOnly}
									onChange={(e) => setLine(i, { specification: e.target.value })}
								/>
								<input
									className="inp mono"
									type="date"
									value={l.schedule_date}
									disabled={readOnly}
									onChange={(e) => setLine(i, { schedule_date: e.target.value })}
								/>
								{!readOnly ? (
									<button className="xbtn" onClick={() => removeLine(i)}>
										×
									</button>
								) : (
									<span />
								)}
							</div>
						))}
					</section>
				</div>

				<div className="stack">
					<section className="card">
						<div className="chead">
							<div className="ttl">Summary</div>
						</div>
						<div className="facts">
							<div className="f">
								<span className="k">Category</span>
								<span className="v">{category || '—'}</span>
							</div>
							<div className="f">
								<span className="k">Project</span>
								<span className="v">{project || '—'}</span>
							</div>
							<div className="f">
								<span className="k">Line items</span>
								<span className="v data">{lines.length}</span>
							</div>
							<div className="f">
								<span className="k">Total qty</span>
								<span className="v data">
									{lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)}
								</span>
							</div>
							<div className="f">
								<span className="k">Priority</span>
								<span className="v">{priority}</span>
							</div>
						</div>
					</section>

					<section className="card twk">
						<div className="chead">
							<div className="ttl">Category &amp; sub-category</div>
						</div>
						<p>
							Pick a <b>category</b> once. The item picker shows <b>every item in that category</b> —
							any sub-category, or none. Each line shows its own sub-category; items with no
							sub-category still appear.
						</p>
					</section>
				</div>
			</div>
		</main>
	);
}
