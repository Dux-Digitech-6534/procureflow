import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFrappeFileUpload, useFrappeGetCall, useFrappePostCall, useFrappeUpdateDoc } from 'frappe-react-sdk';
import { API, type MrContext, type ItemOption, type MrDetail, type SaveMrResult, type UomOption } from '../lib/api';
import { Icon } from '../components/Icon';
import { SearchSelect } from '../components/form';
import { useToast } from '../components/Toast';
import { parseServerError } from '../lib/format';
import { MHeader, useExitGuard, ConfirmSheet } from './MobileShell';
import { useLang } from './i18n';

interface Line {
	item_code: string;
	item_name: string;
	uom: string;
	uoms: UomOption[];
	sub_category: string | null;
	qty: string;
	spec: string;
	remark: string;
}

const PRIORITIES = ['Low', 'Medium', 'High'];

export function MNewRequest() {
	const nav = useNavigate();
	const toast = useToast();
	const { t } = useLang();
	// When a draft name is in the URL (/m/requests/:name/edit) we load it and edit in place.
	const { name: editName } = useParams<{ name: string }>();
	const isEdit = !!editName;

	const ctxRes = useFrappeGetCall<{ message: MrContext }>(API.mrContext, {});
	const ctx = ctxRes.data?.message;
	// Load the existing draft when editing.
	const editRes = useFrappeGetCall<{ message: MrDetail }>(API.mrDetail, { name: editName }, isEdit ? undefined : null);

	const [category, setCategory] = useState('');
	const [project, setProject] = useState('');
	const [requiredBy, setRequiredBy] = useState('');
	const [priority, setPriority] = useState('Medium');
	const [remark, setRemark] = useState('');
	const [showRemark, setShowRemark] = useState(false);
	const [lines, setLines] = useState<Line[]>([]);
	const [photo, setPhoto] = useState<File | null>(null);
	const [err, setErr] = useState('');
	// Tracks whether the user has changed anything — so editing a loaded draft doesn't
	// trigger the "leave without saving?" guard until they actually touch something.
	const [touched, setTouched] = useState(false);
	const [seeded, setSeeded] = useState(false);
	const photoRef = useRef<HTMLInputElement>(null);

	const { call: saveMr, loading: saving } = useFrappePostCall<{ message: SaveMrResult }>(API.saveMr);
	const { upload, loading: uploading } = useFrappeFileUpload();
	const { updateDoc } = useFrappeUpdateDoc();

	// Prefill the form from the loaded draft (once). Only drafts are editable;
	// anything already submitted bounces back to the detail (save would be rejected).
	useEffect(() => {
		const d = editRes.data?.message;
		if (!isEdit || !d || seeded) return;
		if (d.docstatus !== 0) {
			toast.error(t('nr.cannotEditSubmitted'));
			nav('/m/requests', { replace: true });
			return;
		}
		setCategory(d.category ?? '');
		setProject(d.project ?? '');
		setRequiredBy(d.schedule_date ?? '');
		setPriority(d.priority ?? 'Medium');
		setRemark(d.remark ?? '');
		if (d.remark) setShowRemark(true);
		setLines(
			(d.items ?? []).map((it) => ({
				item_code: it.item_code,
				item_name: it.item_name,
				uom: it.uom,
				uoms: it.uoms?.length ? it.uoms : [{ uom: it.uom, conversion_factor: 1 }],
				sub_category: it.sub_category,
				qty: String(it.qty ?? ''),
				spec: it.specification ?? '',
				remark: it.remark ?? '',
			})),
		);
		setSeeded(true);
	}, [isEdit, editRes.data, seeded, nav, t, toast]);

	const dirty = isEdit ? touched : lines.length > 0 || !!category || !!remark || !!photo;
	const { confirming, setConfirming } = useExitGuard(dirty);

	// Smart defaults: today's date, and auto-select the project ONLY when there is
	// exactly one — otherwise the field stays empty so each request is a deliberate
	// pick (we no longer pre-fill the previously used project).
	useEffect(() => {
		if (!ctx) return;
		setRequiredBy((d) => d || ctx.today);
		setProject((p) => (p ? p : ctx.projects.length === 1 ? ctx.projects[0].name : ''));
	}, [ctx]);

	const itemsRes = useFrappeGetCall<{ message: ItemOption[] }>(API.itemSearch, { category }, category ? undefined : null);
	const itemOptions = itemsRes.data?.message ?? [];
	const pickerOptions = useMemo(
		() => itemOptions.map((o) => ({ value: o.value, label: o.label, sub: o.sub_category ? `${o.sub_category} · ${o.uom}` : o.uom })),
		[itemOptions],
	);

	function onCategory(v: string) {
		setTouched(true);
		setCategory(v);
		setLines([]);
	}
	function addItem(code: string) {
		if (!code || lines.some((l) => l.item_code === code)) return;
		const o = itemOptions.find((x) => x.value === code);
		if (!o) return;
		setTouched(true);
		setLines((ls) => [
			...ls,
			{
				item_code: o.value,
				item_name: o.label,
				uom: o.uom,
				uoms: o.uoms ?? [{ uom: o.uom, conversion_factor: 1 }],
				sub_category: o.sub_category,
				qty: '1',
				spec: '',
				remark: '',
			},
		]);
	}
	function setLine(i: number, patch: Partial<Line>) {
		setTouched(true);
		setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
	}
	function bump(i: number, delta: number) {
		setTouched(true);
		setLines((ls) =>
			ls.map((l, idx) => (idx === i ? { ...l, qty: String(Math.max(0, (Number(l.qty) || 0) + delta)) } : l)),
		);
	}
	function removeLine(i: number) {
		setTouched(true);
		setLines((ls) => ls.filter((_, idx) => idx !== i));
	}

	async function save(strict: boolean) {
		setErr('');
		if (!category) return setErr(t('nr.errCategory'));
		if (strict) {
			if (!project) return setErr(t('nr.errProject'));
			if (!requiredBy) return setErr(t('nr.errDate'));
			if (lines.length === 0) return setErr(t('nr.errItems'));
			if (lines.some((l) => !l.qty || Number(l.qty) <= 0)) return setErr(t('nr.errQty'));
		}
		try {
			const res = await saveMr({
				data: {
					name: editName ?? null,
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
						schedule_date: requiredBy || null,
						specification: l.spec,
						remark: l.remark,
					})),
				},
			});
			const name = res.message.name;
			// Attach the optional photo to the saved request (non-fatal on failure).
			if (photo && name) {
				try {
					const up = await upload(photo, {
						doctype: 'Material Request',
						docname: name,
						fieldname: 'custom_add_receipt',
						isPrivate: true,
					});
					await updateDoc('Material Request', name, { custom_add_receipt: up.file_url });
				} catch (e) {
					console.error(e);
				}
			}
			toast.success(res.message.workflow_state === 'Pending Approval' ? t('nr.submitted') : t('nr.savedDraft'));
			nav('/m/requests');
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	const busy = saving || uploading;

	return (
		<>
			<MHeader title={isEdit ? t('nr.editTitle') : t('nr.title')} backTo="/m/requests" onBack={dirty ? () => setConfirming(true) : undefined} />
			<div className="body task">
				{err && (
					<div className="malert">
						<Icon name="warning" size={16} />
						<span>{err}</span>
					</div>
				)}

				<div className="mfield">
					<span className="mlabel">
						{t('nr.category')} <em>*</em>
					</span>
					<SearchSelect
						value={category}
						onChange={onCategory}
						placeholder={t('nr.categoryPlaceholder')}
						options={(ctx?.categories ?? []).map((c) => ({ value: c }))}
					/>
					<span className="mhint">{t('nr.categoryHint')}</span>
				</div>

				<div className="mfield">
					<span className="mlabel">
						{t('nr.project')} <em>*</em>
					</span>
					<SearchSelect
						value={project}
						onChange={(v) => { setTouched(true); setProject(v); }}
						placeholder={t('nr.projectPlaceholder')}
						options={(ctx?.projects ?? []).map((p) => ({
							value: p.name,
							label: p.project_name || p.name,
							sub: [p.company_name, p.store_name].filter(Boolean).join(' · '),
						}))}
					/>
				</div>

				<div className="mfield">
					<span className="mlabel">
						{t('nr.requiredBy')} <em>*</em>
					</span>
					<input className="minp" type="date" value={requiredBy} onChange={(e) => { setTouched(true); setRequiredBy(e.target.value); }} />
				</div>

				<div className="mfield">
					<span className="mlabel">{t('nr.priority')}</span>
					<div className="seg">
						{PRIORITIES.map((p) => (
							<button key={p} className={priority === p ? 'on' : ''} onClick={() => { setTouched(true); setPriority(p); }} type="button">
								{t(p === 'Low' ? 'nr.prioLow' : p === 'Medium' ? 'nr.prioMedium' : 'nr.prioHigh')}
							</button>
						))}
					</div>
				</div>

				<div className="eyebrow2">{t('common.items')}{lines.length ? ` · ${lines.length}` : ''}</div>
				<div className="mcard">
					<div className="additem">
						<SearchSelect
							value=""
							onChange={addItem}
							disabled={!category}
							placeholder={category ? t('nr.addItem') : t('nr.pickCategoryFirst')}
							options={pickerOptions}
						/>
					</div>
					{lines.map((l, i) => (
						<div className="item" key={l.item_code}>
							<div className="ih">
								<div className="inm">
									<div className="t1">{l.item_name}</div>
									<div className="t2">
										{l.item_code !== l.item_name ? l.item_code : ''}
										{l.sub_category ? `${l.item_code !== l.item_name ? ' · ' : ''}${l.sub_category}` : ''}
									</div>
								</div>
								<button className="rm" onClick={() => removeLine(i)} aria-label="Remove" type="button">
									<Icon name="close" size={15} />
								</button>
							</div>
							<div className="qrow">
								<div className="stepper">
									<button type="button" onClick={() => bump(i, -1)} aria-label="Decrease">
										−
									</button>
									<input value={l.qty} inputMode="decimal" onChange={(e) => setLine(i, { qty: e.target.value })} aria-label="Quantity" />
									<button type="button" onClick={() => bump(i, 1)} aria-label="Increase">
										+
									</button>
								</div>
								{l.uoms.length > 1 ? (
									<select className="uomsel" value={l.uom} onChange={(e) => setLine(i, { uom: e.target.value })} aria-label="Unit">
										{l.uoms.map((u) => (
											<option key={u.uom} value={u.uom}>
												{u.uom}
											</option>
										))}
									</select>
								) : (
									<span className="uomtag">{l.uom}</span>
								)}
							</div>
							<input
								className="minp ispec"
								value={l.spec}
								onChange={(e) => setLine(i, { spec: e.target.value })}
								placeholder={t('nr.specPlaceholder')}
							/>
							<input
								className="minp ispec"
								value={l.remark}
								onChange={(e) => setLine(i, { remark: e.target.value })}
								placeholder={t('nr.remarkPlaceholder')}
							/>
						</div>
					))}
				</div>

				<div className="mfield" style={{ marginTop: 16 }}>
					<span className="mlabel">{t('nr.attachment')}</span>
					<input
						ref={photoRef}
						type="file"
						accept="image/*"
						capture="environment"
						style={{ display: 'none' }}
						onChange={(e) => {
							const f = e.target.files?.[0];
							e.target.value = '';
							if (f) { setTouched(true); setPhoto(f); }
						}}
					/>
					<button type="button" className={'mphoto' + (photo ? ' has' : '')} onClick={() => photoRef.current?.click()} style={{ minHeight: 76 }}>
						<Icon name={photo ? 'circle-check' : 'camera'} size={22} />
						<span className="pl">{photo ? t('nr.photoAttached') : t('nr.addPhoto')}</span>
						<span className="ps">{photo ? photo.name : t('nr.photoHint')}</span>
					</button>
				</div>

				{showRemark ? (
					<div className="mfield" style={{ marginTop: 4 }}>
						<span className="mlabel">{t('nr.noteForApprover')}</span>
						<textarea
							className="minp"
							rows={2}
							value={remark}
							onChange={(e) => { setTouched(true); setRemark(e.target.value); }}
							placeholder={t('nr.notePlaceholder')}
						/>
					</div>
				) : (
					<button
						type="button"
						className="draftlink"
						style={{ marginTop: 10, padding: 0 }}
						onClick={() => setShowRemark(true)}
					>
						{t('nr.addNote')}
					</button>
				)}
			</div>

			<div className="actionbar">
				<button className="draftlink" onClick={() => save(false)} disabled={busy}>
					{t('nr.saveDraft')}
				</button>
				<button className="mbtn grow" onClick={() => save(true)} disabled={busy}>
					<Icon name="check" size={18} /> {uploading ? t('nr.uploading') : saving ? t('nr.submitting') : t('nr.submit')}
				</button>
			</div>

			{confirming && (
				<ConfirmSheet
					title={t('confirm.leaveTitle')}
					message={t('nr.leaveMsg')}
					onCancel={() => setConfirming(false)}
					onConfirm={() => nav('/m/requests', { replace: true })}
				/>
			)}
		</>
	);
}
