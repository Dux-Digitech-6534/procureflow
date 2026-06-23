import { useFrappeGetCall, useFrappePostCall } from 'frappe-react-sdk';
import { API, type NotificationsResult } from '../lib/api';
import { Icon } from '../components/Icon';
import { MHeader, MLoad, MEmpty, PullToRefresh } from './MobileShell';
import { useLang } from './i18n';

function fmtWhen(s: string): string {
	const d = new Date(s.replace(' ', 'T'));
	if (Number.isNaN(d.getTime())) return s;
	return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function stripHtml(s: string): string {
	return (s || '').replace(/<[^>]*>/g, '').trim();
}

export function MNotifications() {
	const { t } = useLang();
	const { data, isLoading, error, mutate } = useFrappeGetCall<{ message: NotificationsResult }>(API.notifications, {});
	const { call: markRead, loading: marking } = useFrappePostCall(API.markNotificationsRead);
	const items = data?.message.items ?? [];
	const unread = data?.message.unread ?? 0;

	async function doMark() {
		await markRead({});
		await mutate();
	}

	return (
		<>
			<MHeader
				title={t('notif.title')}
				backTo="/m"
				right={
					unread > 0 ? (
						<button className="tact" onClick={() => void doMark()} disabled={marking}>
							{marking ? '…' : t('notif.markRead')}
						</button>
					) : undefined
				}
			/>
			<div className="body">
				{isLoading && <MLoad />}
				{error && (
					<div className="malert">
						<Icon name="warning" size={16} />
						<span>{t('notif.couldNotLoad')}</span>
					</div>
				)}
				{!isLoading && !error && items.length === 0 && (
					<MEmpty icon="circle-check" title={t('notif.emptyTitle')} sub={t('notif.emptySub')} />
				)}

				{items.length > 0 && (
					<PullToRefresh onRefresh={() => mutate()}>
						<div className="ncard-list">
							{items.map((n) => (
								<div key={n.name} className={'ncard' + (n.read ? '' : ' unread')}>
									<span className="nic">
										<Icon name={n.read ? 'circle-check' : 'shield-check'} size={16} />
									</span>
									<span className="ntx">
										<span className="nsub">{stripHtml(n.subject)}</span>
										<span className="nwhen">
											{fmtWhen(n.creation)}
											{n.document_name ? ' · ' + n.document_name : ''}
										</span>
									</span>
									{!n.read && <span className="ndot" />}
								</div>
							))}
						</div>
					</PullToRefresh>
				)}
			</div>
		</>
	);
}
