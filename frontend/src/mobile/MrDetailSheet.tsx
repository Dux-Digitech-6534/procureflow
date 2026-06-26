import { useState } from 'react';
import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk';
import { API, mrDisplayStatus, actionTone, type MrDetail } from '../lib/api';
import { Icon } from '../components/Icon';
import { Attachment } from '../components/Attachment';
import { useToast } from '../components/Toast';
import { fmtDateLong, parseServerError } from '../lib/format';
import { RelatedDocs } from './RelatedDocs';
import { useLang, tStatus, tPrio } from './i18n';

/**
 * Bottom-sheet view of a Material Request: status, key facts and its items.
 * When `actions` are passed (from the approvals queue) it also renders the
 * workflow buttons (Approve / Reject — reject collects a reason inline).
 */
export function MrDetailSheet({
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
	const detailRes = useFrappeGetCall<{ message: MrDetail }>(API.mrDetail, { name });
	const d = detailRes.data?.message;
	const { call: applyAction, loading } = useFrappePostCall(API.applyAction);
	const { t } = useLang();
	const toast = useToast();
	const [rejecting, setRejecting] = useState(false);
	const [reason, setReason] = useState('');
	const [err, setErr] = useState('');

	async function act(action: string, remark = '') {
		setErr('');
		try {
			await applyAction({ doctype: 'Material Request', name, action, remark });
			toast.success(
				/approve/i.test(action) ? t('d.approved') : /reject/i.test(action) ? t('d.rejected') : `${action} applied`,
			);
			onActed?.();
			onClose();
		} catch (e) {
			setErr(parseServerError(e));
		}
	}

	const st = d ? mrDisplayStatus(d) : null;

	return (
		<div className="mscope-sheet-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
			<div className="mscope-sheet" role="dialog" aria-label={'Material request ' + name}>
				<div className="grab" />
				<div className="sh">
					<span className="st">{t('d.request')}</span>
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
								{d.priority && <span className={'prio ' + d.priority}>{tPrio(t, d.priority)}</span>}
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
								<span className="k">{t('d.requiredBy')}</span>
								<span className="v">{fmtDateLong(d.schedule_date)}</span>
							</div>
							<div className="fct">
								<span className="k">{t('d.requestedBy')}</span>
								<span className="v">{d.owner}</span>
							</div>
							{d.remark && (
								<div className="fct">
									<span className="k">{t('d.remark')}</span>
									<span className="v">{d.remark}</span>
								</div>
							)}

							<div className="eyebrow2">{t('common.items')} · {d.items.length}</div>
							{d.items.map((it) => (
								<div className="iline" key={it.item_code}>
									<div className="inm2">
										<div className="t1">{it.item_name}</div>
										{it.item_code !== it.item_name && <div className="t2">{it.item_code}</div>}
									</div>
									<span className="iq">
										{it.qty} {it.uom}
									</span>
								</div>
							))}

							{d.attachment && (
								<>
									<div className="eyebrow2">{t('d.attachment')}</div>
									<div className="attach">
										<Attachment url={d.attachment} label="Attached file" />
									</div>
								</>
							)}

							<RelatedDocs doctype="Material Request" name={name} />
						</>
					)}
				</div>

				{d && actions && actions.length > 0 && (
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
							actions.map((a) =>
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
