import { useNavigate } from 'react-router-dom';
import { useFrappeAuth, useFrappeGetCall } from 'frappe-react-sdk';
import { API, type PendingApprovals, type MrListRow, type ReceivablePo, type NotificationsResult } from '../lib/api';
import { Icon } from '../components/Icon';
import { MHeader } from './MobileShell';
import { useLang } from './i18n';

const COMPANY_LOGO = '/assets/procureflow/img/sanskruti-group-asia-logo.png';

function firstName(user: string | null | undefined): string {
	if (!user) return 'there';
	const local = user.split('@')[0].split(/[._\-\s]+/)[0];
	return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'there';
}

export function MHome() {
	const nav = useNavigate();
	const { t } = useLang();
	const { currentUser } = useFrappeAuth();

	const apprRes = useFrappeGetCall<{ message: PendingApprovals }>(API.pendingApprovals, {});
	const mrRes = useFrappeGetCall<{ message: MrListRow[] }>(API.mrList, {});
	const poRes = useFrappeGetCall<{ message: ReceivablePo[] }>(API.receivablePos, {});
	const notifRes = useFrappeGetCall<{ message: NotificationsResult }>(API.notifications, {});

	const awaitingMe = apprRes.data?.message.material_requests.length ?? 0;
	const myOpen =
		(mrRes.data?.message ?? []).filter(
			(r) => r.owner === currentUser && (r.workflow_state === 'Draft' || r.workflow_state === 'Pending Approval'),
		).length ?? 0;
	const toReceive = poRes.data?.message.length ?? 0;
	const unread = notifRes.data?.message.unread ?? 0;

	return (
		<>
			<MHeader
				title={
					<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						<img className="cologo" src={COMPANY_LOGO} alt="Sanskruti" />
					</span>
				}
				right={
					<span style={{ display: 'flex', alignItems: 'center' }}>
						<button className="bell" onClick={() => nav('/m/notifications')} aria-label={t('home.notifications')}>
							<Icon name="bell" size={20} />
							{unread > 0 && <span className="dot" />}
						</button>
						<button className="bell" onClick={() => nav('/m/profile')} aria-label={t('home.profile')}>
							<Icon name="user" size={20} />
						</button>
					</span>
				}
			/>
			<div className="body">
				<div style={{ margin: '4px 2px 18px' }}>
					<div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--fg-1)' }}>
						{t('home.hi', { name: firstName(currentUser) })}
					</div>
					<div style={{ fontSize: 13.5, color: 'var(--fg-3)', marginTop: 2 }}>{t('home.subtitle')}</div>
				</div>

				<div className="kgrid">
					<button className={'kpi' + (awaitingMe ? ' warn' : '')} onClick={() => nav('/m/approvals')}>
						<span className="kic">
							<Icon name="shield-check" size={19} />
						</span>
						<span className="kv">{awaitingMe}</span>
						<span className="kl">{t('home.awaitingApproval')}</span>
					</button>
					<button className="kpi" onClick={() => nav('/m/requests')}>
						<span className="kic">
							<Icon name="file-text" size={19} />
						</span>
						<span className="kv">{myOpen}</span>
						<span className="kl">{t('home.myOpenRequests')}</span>
					</button>
					<button className="kpi" onClick={() => nav('/m/receipts')}>
						<span className="kic">
							<Icon name="package" size={19} />
						</span>
						<span className="kv">{toReceive}</span>
						<span className="kl">{t('home.deliveriesToReceive')}</span>
					</button>
					<button className="kpi" onClick={() => nav('/m/requests/new')}>
						<span className="kic">
							<Icon name="plus" size={19} />
						</span>
						<span className="kv" style={{ fontSize: 17, fontWeight: 650, fontFamily: 'var(--font-ui)' }}>
							{t('home.new')}
						</span>
						<span className="kl">{t('home.raiseMr')}</span>
					</button>
				</div>

				<div style={{ marginTop: 18 }}>
					<button className="mbtn" onClick={() => nav('/m/requests/new')}>
						<Icon name="plus" size={18} /> {t('home.newMr')}
					</button>
				</div>

				<div className="eyebrow2" style={{ marginTop: 22 }}>
					{t('home.browse')}
				</div>
				<div className="lcard">
					<button className="lrow" onClick={() => nav('/m/orders')}>
						<span className="glyph">
							<Icon name="box" size={18} />
						</span>
						<span className="tx">
							<span className="l1">{t('home.purchaseOrders')}</span>
							<span className="l2">{t('home.poSub')}</span>
						</span>
						<span className="rt">
							<Icon name="chevron" size={16} style={{ transform: 'rotate(180deg)', color: 'var(--fg-4)' }} />
						</span>
					</button>
					<button className="lrow" onClick={() => nav('/m/receipt-history')}>
						<span className="glyph">
							<Icon name="package" size={18} />
						</span>
						<span className="tx">
							<span className="l1">{t('home.receiptHistory')}</span>
							<span className="l2">{t('home.receiptHistorySub')}</span>
						</span>
						<span className="rt">
							<Icon name="chevron" size={16} style={{ transform: 'rotate(180deg)', color: 'var(--fg-4)' }} />
						</span>
					</button>
					<button className="lrow" onClick={() => nav('/m/stock')}>
						<span className="glyph">
							<Icon name="cube" size={18} />
						</span>
						<span className="tx">
							<span className="l1">{t('home.stockOnHand')}</span>
							<span className="l2">{t('home.stockSub')}</span>
						</span>
						<span className="rt">
							<Icon name="chevron" size={16} style={{ transform: 'rotate(180deg)', color: 'var(--fg-4)' }} />
						</span>
					</button>
				</div>
			</div>
		</>
	);
}
