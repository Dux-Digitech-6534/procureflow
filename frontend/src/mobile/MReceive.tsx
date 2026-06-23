import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFrappeFileUpload, useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk';
import { API, type PoReceiptItems, type ReceivablePo } from '../lib/api';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { fmtMoney, parseServerError } from '../lib/format';
import { MHeader, MLoad, useExitGuard, ConfirmSheet } from './MobileShell';
import { useLang } from './i18n';

interface Line {
	po_item: string;
	item_code: string;
	item_name: string;
	uom: string;
	ordered: number;
	pending: number;
	qty: string;
}

function todayStr(): string {
	const d = new Date();
	const z = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** Camera/photo capture tile — uses the native camera on phones via capture. */
function PhotoTile({ label, file, onPick }: { label: string; file: File | null; onPick: (f: File) => void }) {
	const ref = useRef<HTMLInputElement>(null);
	const { t } = useLang();
	return (
		<>
			<input
				ref={ref}
				type="file"
				accept="image/*"
				capture="environment"
				style={{ display: 'none' }}
				onChange={(e) => {
					const f = e.target.files?.[0];
					e.target.value = '';
					if (f) onPick(f);
				}}
			/>
			<button type="button" className={'mphoto' + (file ? ' has' : '')} onClick={() => ref.current?.click()}>
				<Icon name={file ? 'circle-check' : 'camera'} size={22} />
				<span className="pl">{label}</span>
				<span className="ps">{file ? file.name : t('rv.tapCapture')}</span>
			</button>
		</>
	);
}

export function MReceive() {
	const { po = '' } = useParams();
	const nav = useNavigate();
	const toast = useToast();
	const { t } = useLang();

	const posRes = useFrappeGetCall<{ message: ReceivablePo[] }>(API.receivablePos, {});
	const itemsRes = useFrappeGetCall<{ message: PoReceiptItems }>(API.poReceiptItems, { purchase_order: po }, po ? undefined : null);
	const { call: createReceipt, loading: saving } = useFrappePostCall<{ message: { name: string } }>(API.createReceipt);
	const { upload, loading: uploading } = useFrappeFileUpload();

	const meta = useMemo(() => (posRes.data?.message ?? []).find((p) => p.name === po), [posRes.data, po]);
	const [lines, setLines] = useState<Line[]>([]);
	const [postingDate, setPostingDate] = useState(todayStr());
	const [deliveryNote, setDeliveryNote] = useState('');
	const [remark, setRemark] = useState('');
	const [materialImage, setMaterialImage] = useState<File | null>(null);
	const [invoiceImage, setInvoiceImage] = useState<File | null>(null);
	const [err, setErr] = useState('');
	const [seeded, setSeeded] = useState(false);
	const [touched, setTouched] = useState(false);
	const dirty = touched || !!materialImage || !!invoiceImage || !!deliveryNote || !!remark;
	const { confirming, setConfirming } = useExitGuard(dirty);

	useEffect(() => {
		const msg = itemsRes.data?.message;
		if (msg && !seeded) {
			setLines(
				msg.items.map((it) => ({
					po_item: it.po_item,
					item_code: it.item_code,
					item_name: it.item_name,
					uom: it.uom,
					ordered: it.ordered,
					pending: it.pending,
					qty: String(it.pending),
				})),
			);
			setSeeded(true);
		}
	}, [itemsRes.data, seeded]);

	// A receipt's posting date can't precede the PO date.
	useEffect(() => {
		if (meta?.transaction_date && postingDate < meta.transaction_date) setPostingDate(meta.transaction_date);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [meta?.transaction_date]);

	function setQty(i: number, v: string) {
		setTouched(true);
		setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, qty: v } : l)));
	}
	function bump(i: number, delta: number) {
		setTouched(true);
		setLines((ls) =>
			ls.map((l, idx) =>
				idx === i ? { ...l, qty: String(Math.max(0, Math.min(l.pending, (Number(l.qty) || 0) + delta))) } : l,
			),
		);
	}

	async function save() {
		setErr('');
		if (!po) return setErr(t('rv.errNoPo'));
		if (!postingDate) return setErr(t('rv.errDate'));
		const items = lines.map((l) => ({ po_item: l.po_item, qty: Number(l.qty) || 0 })).filter((l) => l.qty > 0);
		if (items.length === 0) return setErr(t('rv.errQty'));
		if (lines.some((l) => Number(l.qty) > l.pending)) return setErr(t('rv.errExceed'));
		try {
			let materialUrl: string | null = null;
			let invoiceUrl: string | null = null;
			if (materialImage) materialUrl = (await upload(materialImage, { isPrivate: true })).file_url;
			if (invoiceImage) invoiceUrl = (await upload(invoiceImage, { isPrivate: true })).file_url;
			await createReceipt({
				data: {
					purchase_order: po,
					posting_date: postingDate,
					supplier_delivery_note: deliveryNote || null,
					remark: remark || null,
					material_image: materialUrl,
					invoice_image: invoiceUrl,
					items,
				},
			});
			toast.success(t('rv.recorded'));
			nav('/m/receipts');
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	const busy = saving || uploading;

	return (
		<>
			<MHeader title={t('rv.title')} backTo="/m/receipts" onBack={dirty ? () => setConfirming(true) : undefined} />
			<div className="body task">
				{err && (
					<div className="malert">
						<Icon name="warning" size={16} />
						<span>{err}</span>
					</div>
				)}

				{meta && (
					<div className="mcard" style={{ padding: 14, marginBottom: 16 }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
							<span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--cyan)' }}>{po}</span>
							<span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{fmtMoney(meta.grand_total, 'INR')}</span>
						</div>
						<div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 3 }}>
							{(meta.supplier_name ?? meta.supplier) + ' · ' + (meta.custom_project_name ?? '—')}
						</div>
					</div>
				)}

				<div className="mfield">
					<span className="mlabel">{t('rv.receiptDate')}</span>
					<input className="minp" type="date" value={postingDate} min={meta?.transaction_date || undefined} onChange={(e) => setPostingDate(e.target.value)} />
				</div>

				<div className="eyebrow2">{t('rv.itemsReceived')}</div>
				{!itemsRes.data && <MLoad />}
				<div className="mcard">
					{lines.map((l, i) => (
						<div className="item" key={l.po_item}>
							<div className="ih">
								<div className="inm">
									<div className="t1">{l.item_name}</div>
									<div className="t2">{t('rv.pending', { n: l.pending, uom: l.uom, o: l.ordered })}</div>
								</div>
							</div>
							<div className="qrow">
								<div className="stepper">
									<button type="button" onClick={() => bump(i, -1)} aria-label="Decrease">−</button>
									<input value={l.qty} inputMode="decimal" onChange={(e) => setQty(i, e.target.value)} aria-label="Received quantity" />
									<button type="button" onClick={() => bump(i, 1)} aria-label="Increase">+</button>
								</div>
								<span className="uomtag">{t('rv.uomReceived', { uom: l.uom })}</span>
							</div>
						</div>
					))}
					{itemsRes.data && lines.length === 0 && (
						<div className="item"><div className="t2" style={{ color: 'var(--fg-3)' }}>{t('rv.nothingPending')}</div></div>
					)}
				</div>

				<div className="eyebrow2">{t('d.photos')}</div>
				<div className="mphotos">
					<PhotoTile label={t('rv.material')} file={materialImage} onPick={setMaterialImage} />
					<PhotoTile label={t('rv.invoice')} file={invoiceImage} onPick={setInvoiceImage} />
				</div>

				<div className="mfield" style={{ marginTop: 16 }}>
					<span className="mlabel">{t('rv.deliveryNote')}</span>
					<input className="minp" value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder={t('rv.deliveryNotePlaceholder')} />
				</div>
				<div className="mfield">
					<span className="mlabel">{t('rv.remark')}</span>
					<textarea className="minp" rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder={t('rv.remarkPlaceholder')} />
				</div>
			</div>

			<div className="actionbar">
				<button className="mbtn grow" onClick={() => void save()} disabled={busy || lines.length === 0}>
					<Icon name="check" size={18} /> {uploading ? t('nr.uploading') : saving ? t('rv.recording') : t('rv.title')}
				</button>
			</div>

			{confirming && (
				<ConfirmSheet
					title={t('rv.leaveTitle')}
					message={t('rv.leaveMsg')}
					onCancel={() => setConfirming(false)}
					onConfirm={() => nav('/m/receipts', { replace: true })}
				/>
			)}
		</>
	);
}
