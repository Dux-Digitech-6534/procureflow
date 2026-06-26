import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, payTone, type PrDetail } from '../lib/api';
import { Icon } from '../components/Icon';
import { Attachment } from '../components/Attachment';
import { fmtDateLong, fmtMoney } from '../lib/format';
import { RelatedDocs } from './RelatedDocs';
import { useLang, tPay } from './i18n';

/** Read-only bottom-sheet for a submitted Purchase Receipt: items, totals,
 *  payment status, the material/invoice photos, and related documents. */
export function PrDetailSheet({ name, onClose }: { name: string; onClose: () => void }) {
	const { t } = useLang();
	const res = useFrappeGetCall<{ message: PrDetail }>(API.prDetail, { name });
	const d = res.data?.message;
	const photos = [d?.material_image, d?.invoice_image].filter(Boolean) as string[];

	return (
		<div className="mscope-sheet-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
			<div className="mscope-sheet" role="dialog" aria-label={t('d.receipt') + ' ' + name}>
				<div className="grab" />
				<div className="sh">
					<span className="st">{t('d.receipt')}</span>
					<span className="sid">{name}</span>
					<button className="x" onClick={onClose} aria-label="Close">
						<Icon name="close" size={16} />
					</button>
				</div>

				<div className="sbody">
					{!d && <div className="mload">{t('common.loading')}</div>}
					{d && (
						<>
							<div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
								{d.payment_status && <span className={'chip ' + payTone(d.payment_status)}>{tPay(t, d.payment_status)}</span>}
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
								<span className="k">{t('d.receivedOn')}</span>
								<span className="v">{fmtDateLong(d.posting_date)}</span>
							</div>

							<div className="eyebrow2">{t('common.items')} · {d.items.length}</div>
							{d.items.map((it) => (
								<div className="iline" key={it.item_code}>
									<div className="inm2">
										<div className="t1">{it.item_name}</div>
										<div className="t2">
											{it.qty} {it.uom} · {fmtMoney(it.rate, 'INR')}
										</div>
									</div>
									<span className="iq">{fmtMoney(it.amount, 'INR')}</span>
								</div>
							))}

							<div className="eyebrow2">{t('d.payment')}</div>
							<div className="fct">
								<span className="k">{t('d.receiptTotal')}</span>
								<span className="v">{fmtMoney(d.total, 'INR')}</span>
							</div>
							<div className="fct">
								<span className="k">{t('d.paid')}</span>
								<span className="v">{fmtMoney(d.paid, 'INR')}</span>
							</div>
							<div className="fct" style={{ fontWeight: 700 }}>
								<span className="k">{t('d.outstanding')}</span>
								<span className="v">{fmtMoney(d.outstanding, 'INR')}</span>
							</div>

							{photos.length > 0 && (
								<>
									<div className="eyebrow2">{t('d.photos')}</div>
									<div className="attach">
										{photos.map((url) => (
											<Attachment key={url} url={url} label="Receipt photo" />
										))}
									</div>
								</>
							)}

							<RelatedDocs doctype="Purchase Receipt" name={name} />
						</>
					)}
				</div>
			</div>
		</div>
	);
}
