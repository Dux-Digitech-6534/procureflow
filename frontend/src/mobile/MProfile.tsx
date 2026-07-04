import { useFrappeAuth, useFrappeGetCall } from 'frappe-react-sdk';
import { API, type UserInfo } from '../lib/api';
import { Icon } from '../components/Icon';
import { MHeader, MLoad } from './MobileShell';
import { useLang } from './i18n';

// Only procurement-relevant roles are meaningful here — the backend may return
// every Frappe role (e.g. for admins), which would just be noise.
const PROCURE_ROLES = [
	'PO Approver',
	'Purchase Officer',
	'Material Request Approval',
	'Purchase Manager',
	'Purchase User',
	'Supervisor',
	'Stock Manager',
	'Stock User',
];

function initials(name: string): string {
	const parts = name.trim().split(/\s+/);
	return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'U';
}

export function MProfile() {
	const { t, lang, setLang } = useLang();
	const { data, isLoading } = useFrappeGetCall<{ message: UserInfo }>(API.userInfo, {});
	const { logout } = useFrappeAuth();
	const u = data?.message;
	const roles = (u?.roles ?? []).filter((r) => PROCURE_ROLES.includes(r));

	async function doLogout() {
		try {
			await logout();
		} finally {
			// Carry redirect-to so the NEXT login lands back in the mobile app —
			// without it Frappe's login sends desk users to /app and web users to /me.
			window.location.href = '/login?redirect-to=' + encodeURIComponent('/procureflow/m');
		}
	}

	return (
		<>
			<MHeader title={t('prof.title')} backTo="/m" />
			<div className="body">
				{isLoading && <MLoad />}
				{u && (
					<>
						<div className="profcard">
							<div className="avatar">{u.user_image ? <img src={u.user_image} alt="" /> : initials(u.full_name)}</div>
							<div className="pname">{u.full_name}</div>
							<div className="pmail">{u.email}</div>
						</div>

						<div className="prow">
							<span className="k">{t('prof.company')}</span>
							<span className="v">{u.company ?? '—'}</span>
						</div>

						{roles.length > 0 && (
							<>
								<div className="eyebrow2">{t('prof.roles')}</div>
								<div className="rolewrap">
									{roles.map((r) => (
										<span key={r} className="rolechip">
											{r}
										</span>
									))}
								</div>
							</>
						)}

						<div className="eyebrow2">{t('prof.language')}</div>
						<div className="seg">
							<button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')} type="button">
								English
							</button>
							<button className={lang === 'hi' ? 'on' : ''} onClick={() => setLang('hi')} type="button">
								हिंदी
							</button>
						</div>

						<div style={{ marginTop: 20 }}>
							<button className="mbtn danger" onClick={() => void doLogout()}>
								<Icon name="logout" size={18} /> {t('prof.logout')}
							</button>
						</div>
					</>
				)}
			</div>
		</>
	);
}
