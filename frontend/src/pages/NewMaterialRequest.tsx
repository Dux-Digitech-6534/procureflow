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
import { Field, SelectInput, SearchSelect, TextArea } from '../components/form';
import { Icon } from '../components/Icon';
import { DocLifecycleActions } from '../components/DocLifecycleActions';
import { parseServerError } from '../lib/format';

interface LineRow {
	item_code: string;
	item_name: string;
	uom: string;
	sub_category: string | null;
	qty: string;
	specification: string;
	remark: string;
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
	const [pendingFile, setPendingFile] = useState<File | null>(null);

	useEffect(() => {
		if (!isEdit && ctx && !requiredBy) setRequiredBy(ctx.today);
	}, [ctx, isEdit, requiredBy]);

	useEffect(() => {
		if (isEdit && detail && !seeded) {
			setCategory(detail.category ?? '');
			setProject(detail.project ?? '');
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
					remark: it.remark ?? '',
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

	const proj = useMemo(() => ctx?.projects.find((p) => p.name === project), [ctx, project]);
	const storeName = proj?.store_name ?? '';
	const companyName = proj?.company_name ?? '';

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
				remark: '',
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

	async function uploadTo(name: string, file: File) {
		const res = await upload(file, {
			doctype: 'Material Request',
			docname: name,
			fieldname: 'custom_add_receipt',
			isPrivate: true,
		});
		await updateDoc('Material Request', name, { custom_add_receipt: res.file_url });
		return res.file_url;
	}

	function onPickFile(file: File) {
		setErr('');
		if (id) {
			uploadTo(id, file)
				.then((url) => setAttachment(url))
				.catch((e) => setErr(parseServerError(e)));
		} else {
			setPendingFile(file); // staged — uploaded right after the first save
		}
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
				priority,
				schedule_date: requiredBy || null,
				remark,
				items: lines.map((l) => ({
					item_code: l.item_code,
					qty: Number(l.qty) || 0,
					uom: l.uom,
					schedule_date: l.schedule_date || null,
					specification: l.specification,
					remark: l.remark,
				})),
			};
			const res = await saveMr({ data: payload });
			const newName = res.message.name;
			if (pendingFile && !id) {
				try {
					await uploadTo(newName, pendingFile);
				} catch (e) {
					/* non-fatal — the MR is saved; surface but still navigate */
					console.error(e);
				}
				setPendingFile(null);
			}
			// Editing an existing request stays on the same URL — revalidate in place
			// so the state/buttons update without a manual refresh; a new request
			// changes the route, which refetches.
			if (isEdit && newName === id) {
				setSeeded(false);
				await detailRes.mutate();
			} else {
				navigate('/material-requests/' + newName);
			}
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
				{/* New request → Save draft + Submit for approval. An EXISTING request
				    is already in its workflow (e.g. Pending Approval), so collapse to a
				    single "Save changes" and let DocLifecycleActions carry the real
				    workflow actions (Approve / Reject / Reopen) — no redundant buttons. */}
				{!readOnly && !isEdit && (
					<>
						<button className="btn" disabled={busy} onClick={() => save(false)}>
							Save draft
						</button>
						<button className="btn primary" disabled={busy} onClick={() => save(true)}>
							<Icon name="check" size={15} />
							{saving ? 'Saving…' : 'Submit for approval'}
						</button>
					</>
				)}
				{!readOnly && isEdit && (
					<button className="btn" disabled={busy} onClick={() => save(false)}>
						{saving ? 'Saving…' : 'Save changes'}
					</button>
				)}
				{isEdit && detail && (
					<DocLifecycleActions
						doctype="Material Request"
						name={detail.name}
						noun="request"
						transitions={detail.transitions}
						canCancel={detail.can_cancel}
						canAmend={detail.can_amend}
						onChanged={() => void detailRes.mutate()}
						basePath="/material-requests"
					/>
				)}
			</div>

			{err && (
				<div className="alert">
					<Icon name="warning" size={16} />
					<span>
						<b>Couldn’t save.</b> {err}
					</span>
				</div>
			)}

			<div className="grid">
				<div className="stack">
					<section className="card accent">
						<div className="chead">
							<Icon name="file-text" size={16} />
							<span className="ttl">Request details</span>
						</div>
						<div className="formgrid">
							<Field label="Category" required hint="Pick the category first — items are filtered to this category.">
								<SelectInput
									value={category}
									onChange={onCategoryChange}
									disabled={readOnly}
									allowEmpty
									placeholder="Select category…"
									options={(ctx?.categories ?? []).map((c) => ({ value: c }))}
								/>
							</Field>
							<Field label="Project" hint="Store / warehouse and company auto-fill from the project.">
								<SearchSelect
									value={project}
									onChange={setProject}
									disabled={readOnly}
									placeholder="Select project…"
									options={(ctx?.projects ?? []).map((p) => ({
										value: p.name,
										label: p.project_name || p.name,
										sub: [p.company_name, p.store_name].filter(Boolean).join(' · '),
									}))}
								/>
							</Field>
							<Field label="Company">
								<input className="inp" disabled value={companyName || '—'} />
							</Field>
							<Field label="Priority">
								<SelectInput
									value={priority}
									onChange={setPriority}
									disabled={readOnly}
									options={(ctx?.priorities ?? ['Low', 'Medium', 'High']).map((p) => ({ value: p }))}
								/>
							</Field>
							<Field label="Required by">
								<input
									className="inp mono"
									type="date"
									value={requiredBy}
									disabled={readOnly}
									onChange={(e) => setRequiredBy(e.target.value)}
								/>
							</Field>
							<Field label="Store / warehouse">
								<input className="inp" disabled value={storeName || '—'} />
							</Field>
							<div className="span2">
								<Field label="Remark">
									<TextArea
										value={remark}
										onChange={setRemark}
										rows={2}
										disabled={readOnly}
										placeholder="Header note for the whole request…"
									/>
								</Field>
							</div>
							<div className="span2">
								{/* NOT a <label> on purpose: a label wrapping a hidden file input fires
								    the picker natively too, which double-triggers / leaks to the next click. */}
								<div className="field">
									<span className="flabel">Attachment</span>
									<input
										ref={fileRef}
										type="file"
										style={{ display: 'none' }}
										onChange={(e) => {
											const f = e.target.files?.[0];
											e.target.value = '';
											if (f) onPickFile(f);
										}}
									/>
									<div
										className={'upload' + (readOnly ? ' disabled' : '')}
										onClick={() => !readOnly && fileRef.current?.click()}
									>
										<Icon name="download" size={20} style={{ transform: 'rotate(180deg)' }} />
										<div>
											{attachment ? (
												<a href={attachment} target="_blank" rel="noreferrer" style={{ color: 'var(--iris)' }}>
													View attached file
												</a>
											) : pendingFile ? (
												<span>
													<b>{pendingFile.name}</b> <span className="dim">— attaches on save</span>
												</span>
											) : uploading ? (
												'Uploading…'
											) : readOnly ? (
												<span className="dim">No attachment.</span>
											) : (
												<span>
													Drop a file or <span style={{ color: 'var(--iris)', fontWeight: 500 }}>browse</span>
												</span>
											)}
										</div>
									</div>
									<span className="fhint">PO / indent scan, drawing — header level only</span>
								</div>
							</div>
						</div>
					</section>

					<section className="card">
						<div className="chead">
							<Icon name="layers" size={16} />
							<span className="ttl">Items</span>
							<span className="cnt">{lines.length}</span>
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
						<div className="mrhead">
							<span>#</span>
							<span>Item</span>
							<span>Sub-category</span>
							<span>Qty</span>
							<span>UOM</span>
							<span>Required by</span>
							<span />
						</div>
						{lines.length === 0 && (
							<div className="empty" style={{ padding: '26px 18px' }}>
								<div className="t2">No items yet. {category ? 'Add items above.' : 'Pick a category first.'}</div>
							</div>
						)}
						{lines.map((l, i) => (
							<div className="mrline" key={l.item_code}>
								<div className="mrtop">
									<span className="ix">{i + 1}</span>
									<div className="iname">
										<div className="t1">{l.item_name}</div>
										{l.item_code !== l.item_name && <div className="t2">{l.item_code}</div>}
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
										className="inp mono"
										type="date"
										value={l.schedule_date}
										disabled={readOnly}
										onChange={(e) => setLine(i, { schedule_date: e.target.value })}
									/>
									{!readOnly ? (
										<button className="xbtn" onClick={() => removeLine(i)} aria-label="Remove item">
											<Icon name="close" size={13} />
										</button>
									) : (
										<span />
									)}
								</div>
								<div className="mrbot">
									<div className="ff">
										<span className="fl">Specification</span>
										<input
											className="inp"
											value={l.specification}
											disabled={readOnly}
											placeholder="Grade, size, standard…"
											onChange={(e) => setLine(i, { specification: e.target.value })}
										/>
									</div>
									<div className="ff">
										<span className="fl">Remark</span>
										<input
											className="inp"
											value={l.remark}
											disabled={readOnly}
											placeholder="Line note…"
											onChange={(e) => setLine(i, { remark: e.target.value })}
										/>
									</div>
								</div>
							</div>
						))}
					</section>
				</div>

				<div className="stack">
					<section className="card">
						<div className="chead">
							<Icon name="circle-check" size={16} />
							<span className="ttl">Summary</span>
						</div>
						<div className="facts">
							<div className="f">
								<span className="k">Category</span>
								<span className="v">{category || '—'}</span>
							</div>
							<div className="f">
								<span className="k">Project</span>
								<span className="v">{proj?.project_name || '—'}</span>
							</div>
							<div className="f">
								<span className="k">Company</span>
								<span className="v">{companyName || '—'}</span>
							</div>
							<div className="f">
								<span className="k">Line items</span>
								<span className="v data">{lines.length}</span>
							</div>
							<div className="f">
								<span className="k">Total qty</span>
								<span className="v data">{lines.reduce((s, l) => s + (Number(l.qty) || 0), 0)}</span>
							</div>
							<div className="f">
								<span className="k">Priority</span>
								<span className="v">{priority}</span>
							</div>
						</div>
					</section>

					<section className="card twk">
						<div className="chead">
							<Icon name="sparkle" size={16} />
							<span className="ttl">Category &amp; sub-category</span>
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
