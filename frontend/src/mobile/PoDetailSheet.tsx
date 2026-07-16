import { useState } from 'react';
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk';
import { API, poDisplayStatus, actionTone, type PoDetail } from '../lib/api';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { fmtDateLong, fmtMoney, parseServerError } from '../lib/format';
import { whatsAppPoUrl } from '../lib/whatsapp';
import { RelatedDocs } from './RelatedDocs';
import { AdvancePaymentModal } from '../components/AdvancePaymentModal';
import { useCaps } from './caps';
import { useLang, tStatus } from './i18n';

/**
 * Bottom-sheet view of a Purchase Order: supplier, items, tax breakdown and
 * totals. When `actions` are passed (from the approvals queue) it renders the
 * workflow buttons (Place order / Reject — reject collects a reason inline).
 */
export function PoDetailSheet({
	name,
	actions,
	onClose,
	onActed,
}: {
	name: string;
	actions?: string[];
	onClose: () => void;
	onActed?: () => void;
}) {
	const detailRes = useFrappeGetCall<{ message: PoDetail }>(API.poDetail, { name });
	const d = detailRes.data?.message;
	const { call: applyAction, loading } = useFrappePostCall(API.applyAction);
	const { t } = useLang();
	const toast = useToast();
	const caps = useCaps();
	const [rejecting, setRejecting] = useState(false);
	const [reason, setReason] = useState('');
	const [err, setErr] = useState('');
	const { call: deleteDoc, loading: deleting } = useFrappePostCall(API.deleteDoc);
	const [confirmDel, setConfirmDel] = useState(false);
	const { call: cancelDoc, loading: cancelling } = useFrappePostCall(API.cancelDoc);
	const [confirmCancel, setConfirmCancel] = useState(false);
	const [advModal, setAdvModal] = useState(false);

	async function doDelete() {
		setErr('');
		try {
			await deleteDoc({ doctype: 'Purchase Order', name });
			toast.success(t('d.deleted'));
			onActed?.();
			onClose();
		} catch (e) {
			setErr(parseServerError(e));
			setConfirmDel(false);
		}
	}

	async function doCancel() {
		setErr('');
		try {
			await cancelDoc({ doctype: 'Purchase Order', name });
			toast.success(t('d.cancelled'));
			onActed?.();
			void detailRes.mutate(); // stay open — Delete appears for the now-cancelled doc
			setConfirmCancel(false);
		} catch (e) {
			setErr(parseServerError(e));
			setConfirmCancel(false);
		}
	}

	async function act(action: string, remark = '') {
		setErr('');
		try {
			await applyAction({ doctype: 'Purchase Order', name, action, remark });
			toast.success(/reject/i.test(action) ? t('d.orderRejected') : t('d.orderApproved'));
			onActed?.();
			onClose();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	const st = d ? poDisplayStatus(d) : null;
	const total = d?.rounded_total ?? d?.grand_total ?? null;

	// Show Place-order / Reject whenever this user can act on the PO — from the
	// approvals queue (actions passed) OR when browsing a Pending PO from the list
	// (fall back to the permission-checked transitions po_detail returns). Excludes
	// the owner's "Send for Approval" submit step so it never appears on drafts.
	const derived = d?.workflow_state === 'Pending' ? (d?.transitions ?? []) : [];
	const workflowActions = (actions && actions.length ? actions : derived).filter((a) => a !== 'Send for Approval');

	return (
		<div className="mscope-sheet-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
			<div className="mscope-sheet" role="dialog" aria-label={'Purchase order ' + name}>
				<div className="grab" />
				<div className="sh">
					<span className="st">{t('d.order')}</span>
					<span className="sid">{name}</span>
					<button className="x" onClick={onClose} aria-label="Close">
						<Icon name="close" size={16} />
					</button>
				</div>

				<div className="sbody">
					{!d && <div className="mload">{t('common.loading')}</div>}
					{err && (
						<div className="malert">
							<Icon name="warning" size={16} />
							<span>{err}</span>
						</div>
					)}
					{d && (
						<>
							<div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
								{st && <span className={'chip ' + st.tone}>{tStatus(t, st.label)}</span>}
							</div>
							<div className="fct">
								<span className="k">{t('d.supplier')}</span>
								<span className="v">{d.supplier_name ?? d.supplier}</span>
							</div>
							<div className="fct">
								<span className="k">{t('d.project')}</span>
								<span className="v">{d.project ?? '—'}</span>
							</div>
							<div className="fct">
								<span className="k">{t('d.category')}</span>
								<span className="v">{d.category ?? '—'}</span>
							</div>
							<div className="fct">
								<span className="k">{t('d.orderDate')}</span>
								<span className="v">{fmtDateLong(d.transaction_date)}</span>
							</div>
							{d.remark && (
								<div className="fct">
									<span className="k">{t('d.remark')}</span>
									<span className="v">{d.remark}</span>
								</div>
							)}

							<div className="eyebrow2">{t('common.items')} · {d.items.length}</div>
							{d.items.map((it) => {
								const rec = Number(it.received_qty) || 0;
								const remaining = Math.round((Number(it.qty) - rec) * 1000) / 1000;
								return (
									<div className="iline" key={it.item_code}>
										<div className="inm2">
											<div className="t1">{it.item_name}</div>
											<div className="t2">
												{it.qty} {it.uom} · {fmtMoney(it.rate_with_tax ?? it.rate, 'INR')}
											</div>
											{rec > 0 && remaining > 0 && (
												<div className="t2" style={{ color: 'var(--amber, #b45309)' }}>
													{t('d.remaining', { n: remaining, uom: it.uom, r: rec, o: it.qty })}
												</div>
											)}
											{rec > 0 && remaining <= 0 && (
												<div className="t2" style={{ color: 'var(--ok-fg, #15803d)' }}>{t('d.fullyReceived')}</div>
											)}
										</div>
										<span className="iq">{fmtMoney(it.amount, 'INR')}</span>
									</div>
								);
							})}

							<div className="eyebrow2">{t('d.totals')}</div>
							<div className="fct">
								<span className="k">{t('d.netTotal')}</span>
								<span className="v">{fmtMoney(d.net_total, 'INR')}</span>
							</div>
							{d.taxes.map((t, i) => (
								<div className="fct" key={i}>
									<span className="k">{t.description}</span>
									<span className="v">{fmtMoney(t.amount, 'INR')}</span>
								</div>
							))}
							<div className="fct" style={{ fontWeight: 700 }}>
								<span className="k">{t('d.grandTotal')}</span>
								<span className="v">{fmtMoney(total, 'INR')}</span>
							</div>

							{/* Advance credit against this PO (auto-applied to receipts). */}
							{(d.advance_paid > 0 || d.can_pay_advance) && (
								<>
									<div className="eyebrow2">{t('d.advance')}</div>
									<div className="fct">
										<span className="k">{t('d.advancePaid')}</span>
										<span className="v">{fmtMoney(d.advance_paid, 'INR')}</span>
									</div>
									{d.advance_paid > 0 && (
										<>
											<div className="fct">
												<span className="k">{t('d.advanceApplied')}</span>
												<span className="v">{fmtMoney(d.advance_applied, 'INR')}</span>
											</div>
											<div className="fct">
												<span className="k">{t('d.advanceUnapplied')}</span>
												<span className="v">{fmtMoney(d.advance_unapplied, 'INR')}</span>
											</div>
										</>
									)}
									{d.can_pay_advance && (
										<button className="mbtn sec" style={{ marginTop: 12, justifyContent: 'center', width: '100%' }} onClick={() => setAdvModal(true)}>
											<Icon name="banknote" size={17} /> {t('d.payAdvance')}
										</button>
									)}
								</>
							)}

							{/* Sending the PO to the supplier is a Purchase-Officer action —
							    viewers (e.g. the assigned receiver) don't get the button. */}
							{d.docstatus === 1 && caps.create_po && (
								<a
									className="mbtn sec"
									href={whatsAppPoUrl(d)}
									target="_blank"
									rel="noopener noreferrer"
									style={{ marginTop: 16, justifyContent: 'center', width: '100%' }}
								>
									<Icon name="whatsapp" size={17} /> Send on WhatsApp
								</a>
							)}

							<RelatedDocs doctype="Purchase Order" name={name} />

							{advModal && d && (
								<AdvancePaymentModal
									po={name}
									onClose={() => setAdvModal(false)}
									onSaved={() => { setAdvModal(false); void detailRes.mutate(); }}
								/>
							)}

							{/* A SUBMITTED order can be cancelled (permission-checked). */}
							{d.can_cancel && (
								<button
									className="mbtn danger grow"
									style={{ marginTop: 12 }}
									disabled={cancelling}
									onClick={() => (confirmCancel ? void doCancel() : setConfirmCancel(true))}
								>
									<Icon name="close" size={16} /> {cancelling ? t('d.cancelling') : confirmCancel ? t('d.cancelConfirm') : t('d.cancelDoc')}
								</button>
							)}

							{/* A CANCELLED order can be permanently deleted (permission-checked). */}
							{d.can_delete && (
								<button
									className="mbtn danger grow"
									style={{ marginTop: 16 }}
									disabled={deleting}
									onClick={() => (confirmDel ? void doDelete() : setConfirmDel(true))}
								>
									<Icon name="trash" size={16} /> {deleting ? t('d.deleting') : confirmDel ? t('d.deleteConfirm') : t('d.delete')}
								</button>
							)}
						</>
					)}
				</div>

				{d && workflowActions.length > 0 && (
					<div className="sfoot">
						{rejecting ? (
							<div style={{ flex: 1 }}>
								<textarea
									className="minp"
									rows={2}
									placeholder={t('d.rejectReason')}
									value={reason}
									onChange={(e) => setReason(e.target.value)}
									style={{ marginBottom: 10 }}
								/>
								<div style={{ display: 'flex', gap: 10 }}>
									<button className="mbtn sec sm" onClick={() => setRejecting(false)} disabled={loading}>
										{t('common.cancel')}
									</button>
									<button className="mbtn danger sm" onClick={() => act('Reject', reason)} disabled={loading}>
										{loading ? t('d.rejecting') : t('d.confirmReject')}
									</button>
								</div>
							</div>
						) : (
							workflowActions.map((a) =>
								actionTone(a) === 'danger' ? (
									<button key={a} className="mbtn danger grow" onClick={() => setRejecting(true)} disabled={loading}>
										<Icon name="close" size={17} /> {a}
									</button>
								) : (
									<button key={a} className="mbtn grow" onClick={() => act(a)} disabled={loading}>
										<Icon name="check" size={17} /> {loading ? t('common.working') : a}
									</button>
								),
							)
						)}
					</div>
				)}
			</div>
		</div>
	);
}
