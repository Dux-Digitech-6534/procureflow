import { useNavigate } from 'react-router-dom';
import { useFrappeAuth, useFrappeGetCall } from 'frappe-react-sdk';
import { API, type PendingApprovals, type MrListRow, type ReceivablePo, type NotificationsResult } from '../lib/api';
import { Icon } from '../components/Icon';
import { MHeader } from './MobileShell';
import { useLang } from './i18n';
import { useCaps } from './caps';

const COMPANY_LOGO = '/assets/procureflow/img/sanskruti-group-asia-logo.png';

function firstName(user: string | null | undefined): string {
	if (!user) return 'there';
	const local = user.split('@')[0].split(/[._\-\s]+/)[0];
	return local ? local.charAt(0).toUpperCase() + local.slice(1) : 'there';
}

export function MHome() {
	const nav = useNavigate();
	const { t } = useLang();
	const caps = useCaps();
	const { currentUser } = useFrappeAuth();

	const apprRes = useFrappeGetCall<{ message: PendingApprovals }>(API.pendingApprovals, {});
	const mrRes = useFrappeGetCall<{ message: MrListRow[] }>(API.mrList, {});
	const poRes = useFrappeGetCall<{ message: ReceivablePo[] }>(API.receivablePos, {});
	const notifRes = useFrappeGetCall<{ message: NotificationsResult }>(API.notifications, {});
	// Greet by the user's actual NAME (User.full_name), not the email local-part.
	const userRes = useFrappeGetCall<{ message: { full_name?: string } }>(API.userInfo, {});
	const fullName = (userRes.data?.message?.full_name ?? '').trim();
	const greetName = fullName && !fullName.includes('@') ? fullName.split(/\s+/)[0] : firstName(currentUser);

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
						{t('home.hi', { name: greetName })}
					</div>
					<div style={{ fontSize: 13.5, color: 'var(--fg-3)', marginTop: 2 }}>{t('home.subtitle')}</div>
				</div>

				<div className="kgrid">
					{caps.approve && (
						<button className={'kpi' + (awaitingMe ? ' warn' : '')} onClick={() => nav('/m/approvals')}>
							<span className="kic">
								<Icon name="shield-check" size={19} />
							</span>
							<span className="kv">{awaitingMe}</span>
							<span className="kl">{t('home.awaitingApproval')}</span>
						</button>
					)}
					{caps.create_mr && (
						<button className="kpi" onClick={() => nav('/m/requests')}>
							<span className="kic">
								<Icon name="file-text" size={19} />
							</span>
							<span className="kv">{myOpen}</span>
							<span className="kl">{t('home.myOpenRequests')}</span>
						</button>
					)}
					{caps.receive && (
						<button className="kpi" onClick={() => nav('/m/receipts')}>
							<span className="kic">
								<Icon name="package" size={19} />
							</span>
							<span className="kv">{toReceive}</span>
							<span className="kl">{t('home.deliveriesToReceive')}</span>
							<span className="kl" style={{ fontSize: 10.5, color: 'var(--fg-4)', marginTop: 2 }}>
								{t('home.receiveHint')}
							</span>
						</button>
					)}
				</div>

				{caps.create_mr && (
					<div style={{ marginTop: 18 }}>
						<button className="mbtn" onClick={() => nav('/m/requests/new')}>
							<Icon name="plus" size={18} /> {t('home.newMr')}
						</button>
					</div>
				)}

				{(caps.read_po || caps.read_pr || caps.read_stock) && (
					<>
						<div className="eyebrow2" style={{ marginTop: 22 }}>
							{t('home.browse')}
						</div>
						<div className="lcard">
							{caps.read_po && (
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
							)}
							{caps.read_pr && (
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
							)}
							{caps.read_stock && (
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
							)}
						</div>
					</>
				)}
			</div>
		</>
	);
}
