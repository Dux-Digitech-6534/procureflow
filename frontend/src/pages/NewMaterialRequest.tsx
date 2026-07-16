import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
	useFrappeAuth,
	useFrappeGetCall,
	useFrappePostCall,
	useFrappeFileUpload,
	useFrappeUpdateDoc,
} from 'frappe-react-sdk';
import {
	API,
	mrDisplayStatus,
	type MrContext,
	type ItemOption,
	type MrDetail,
	type SaveMrResult,
} from '../lib/api';
import { Field, SelectInput, SearchSelect, TextArea } from '../components/form';
import { Icon } from '../components/Icon';
import { DocLifecycleActions } from '../components/DocLifecycleActions';
import { LinkedDocs } from '../components/LinkedDocs';
import { DocActivity } from '../components/DocActivity';
import { Attachment } from '../components/Attachment';
import { CreateItemModal } from '../components/CreateItemModal';
import { useToast } from '../components/Toast';
import { parseServerError } from '../lib/format';

interface LineRow {
	item_code: string;
	item_name: string;
	uom: string;
	uoms: { uom: string; conversion_factor: number }[];
	sub_category: string | null;
	qty: string;
	specification: string;
	remark: string;
	schedule_date: string;
}

export function NewMaterialRequest() {
	const { id } = useParams();
	const navigate = useNavigate();
	const toast = useToast();
	const { currentUser } = useFrappeAuth();
	const isEdit = !!id;

	const ctxRes = useFrappeGetCall<{ message: MrContext }>(API.mrContext, {});
	const ctx = ctxRes.data?.message;

	const detailRes = useFrappeGetCall<{ message: MrDetail }>(
		API.mrDetail,
		{ name: id },
		isEdit ? undefined : null,
	);
	const detail = detailRes.data?.message;
	// Editable only as a brand-new request or while still a Draft. Once it's been
	// sent for approval (Pending Approval / Rejected / Approved) the form is locked
	// and the workflow actions take over (mirrors the PO page).
	// Editable (and therefore the "Submit for approval" button) only as a brand-new
	// request or while it's still YOUR OWN Draft. An approver opening someone else's
	// request must never see Save/Submit — they only Approve/Reject (or Reopen).
	const editable = isEdit
		? !!detail && detail.docstatus === 0 && detail.workflow_state === 'Draft' && detail.owner === currentUser
		: true;
	const readOnly = !editable;

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
					uoms: it.uoms ?? [{ uom: it.uom, conversion_factor: 1 }],
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
		if (!itemCode) return;
		const opt = itemOptions.find((o) => o.value === itemCode);
		if (!opt) return;
		// The same item may sit on several lines (same material, different
		// specification/brand) — nudge the user to tell the lines apart.
		if (lines.some((l) => l.item_code === itemCode))
			toast.success('Same item added again — use the specification to tell the lines apart.');
		setLines((ls) => [
			...ls,
			{
				item_code: opt.value,
				item_name: opt.label,
				uom: opt.uom,
				uoms: opt.uoms ?? [{ uom: opt.uom, conversion_factor: 1 }],
				sub_category: opt.sub_category,
				qty: '',
				specification: '',
				remark: '',
				schedule_date: requiredBy,
			},
		]);
	}
	const [itemModal, setItemModal] = useState(false);
	const [pendingAdd, setPendingAdd] = useState<string | null>(null);
	useEffect(() => {
		if (pendingAdd && itemOptions.some((o) => o.value === pendingAdd)) {
			addItem(pendingAdd);
			setPendingAdd(null);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [pendingAdd, itemsRes.data]);
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
			if (!project) return setErr('Select a project before submitting for approval.');
			if (!requiredBy) return setErr('Set the required-by date before submitting for approval.');
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
				submit_for_approval: strict,
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
			// Reflect the actual resulting state (a submit the user can't perform
			// stays a Draft — report it honestly rather than "submitted").
			toast.success(res.message.workflow_state === 'Pending Approval' ? 'Material request submitted for approval' : 'Draft saved');
			if (pendingFile && !id) {
				try {
					const url = await uploadTo(newName, pendingFile);
					setAttachment(url); // keep the just-uploaded file visible
				} catch (e) {
					/* non-fatal — the MR is saved; surface but still navigate */
					console.error(e);
				}
				setPendingFile(null);
			}
			// Editing an existing request stays on the same URL. Revalidate, then
			// re-seed ONLY the items (the part the backend rebuilds) from the fresh
			// doc — do NOT re-run the full seed, which would overwrite header fields
			// the user just set (e.g. snap Required-by back to today).
			if (isEdit && newName === id) {
				const fresh = await detailRes.mutate();
				const d = fresh?.message;
				if (d) {
					setLines(
						d.items.map((it) => ({
							item_code: it.item_code,
							item_name: it.item_name,
							uom: it.uom,
							uoms: it.uoms ?? [{ uom: it.uom, conversion_factor: 1 }],
							sub_category: it.sub_category,
							qty: String(it.qty ?? ''),
							specification: it.specification ?? '',
							remark: it.remark ?? '',
							schedule_date: it.schedule_date ?? '',
						})),
					);
					setAttachment(d.attachment ?? null);
				}
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
					{detail && (
						<div style={{ marginTop: 8 }}>
							<span className={'tag ' + mrDisplayStatus(detail).tone}>{mrDisplayStatus(detail).label}</span>
						</div>
					)}
					{detail && detail.workflow_state === 'Rejected' && detail.rejection_remark && (
						<div className="alert" style={{ marginTop: 10 }}>
							<Icon name="warning" size={16} />
							<span><b>Rejected.</b> {detail.rejection_remark}</span>
						</div>
					)}
				</div>
				<div className="spacer" />
				{/* New or Draft → Save draft + Submit for approval. Once it leaves Draft
				    the form is locked and DocLifecycleActions carries the workflow actions
				    (Approve / Reject / Reopen / Cancel / Amend). */}
				{editable && (
					<>
						<button className="btn" disabled={busy} onClick={() => save(false)}>
							{saving ? 'Saving…' : 'Save draft'}
						</button>
						<button className="btn primary" disabled={busy} onClick={() => save(true)}>
							<Icon name="check" size={15} />
							{saving ? 'Saving…' : 'Submit for approval'}
						</button>
					</>
				)}
				{isEdit && detail?.can_create_po && (
					<button
						className="btn primary"
						onClick={() => navigate('/purchase-orders/new?mr=' + encodeURIComponent(detail.name))}
						title="Raise a purchase order for this request's items"
					>
						<Icon name="cube" size={15} /> Create purchase order
					</button>
				)}
				{isEdit && detail && !editable && (
					<DocLifecycleActions
						doctype="Material Request"
						name={detail.name}
						noun="request"
						transitions={detail.transitions}
						canCancel={detail.can_cancel}
						canAmend={detail.can_amend}
						canDelete={detail.can_delete}
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
							<Field label="Project" required hint="Store / warehouse and company auto-fill from the project.">
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
							<Field label="Required by" required>
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
										<div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
											{attachment ? (
												<span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-block', maxWidth: '100%' }}>
													<Attachment url={attachment} label="Attachment" />
												</span>
											) : pendingFile ? (
												<span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, maxWidth: '100%' }}>
													{pendingFile.type.startsWith('image/') && (
														<img src={URL.createObjectURL(pendingFile)} alt={pendingFile.name} style={{ height: 88, width: 'auto', maxWidth: 160, borderRadius: 9, objectFit: 'cover' }} onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)} />
													)}
													<span><b>{pendingFile.name}</b> <span className="dim">— attaches on save</span></span>
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
									onCreate={category ? () => setItemModal(true) : undefined}
									createLabel="New item"
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
							<div className="mrline" key={i}>
								<div className="mrtop">
									<span className="ix">{i + 1}</span>
									<div className="iname">
										<div className="t1">{l.item_name}</div>
										{l.item_code !== l.item_name && <div className="t2">{l.item_code}</div>}
									</div>
									<div className="lf">
										<span className="lfl">Sub-category</span>
										<span>
											{l.sub_category ? (
												<span className="subpill">{l.sub_category}</span>
											) : (
												<span className="nosub">No sub-category</span>
											)}
										</span>
									</div>
									<div className="lf">
										<span className="lfl">Qty</span>
										<input
											className="inp mono"
											value={l.qty}
											disabled={readOnly}
											inputMode="decimal"
											onChange={(e) => setLine(i, { qty: e.target.value })}
										/>
									</div>
									<div className="lf">
										<span className="lfl">UOM</span>
										{l.uoms.length > 1 ? (
											<SelectInput value={l.uom} onChange={(v) => setLine(i, { uom: v })} disabled={readOnly} options={l.uoms.map((u) => ({ value: u.uom }))} />
										) : (
											<input className="inp" value={l.uom} disabled />
										)}
									</div>
									<div className="lf">
										<span className="lfl">Required by</span>
										<input
											className="inp mono"
											type="date"
											value={l.schedule_date}
											disabled={readOnly}
											onChange={(e) => setLine(i, { schedule_date: e.target.value })}
										/>
									</div>
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

					{isEdit && detail && <LinkedDocs doctype="Material Request" name={detail.name} />}
					{isEdit && detail && <DocActivity doctype="Material Request" name={detail.name} />}
					{itemModal && (
						<CreateItemModal
							category={category}
							onClose={() => setItemModal(false)}
							onCreated={async (code) => { setItemModal(false); await itemsRes.mutate(); setPendingAdd(code); }}
						/>
					)}

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
