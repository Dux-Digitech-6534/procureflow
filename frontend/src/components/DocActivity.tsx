import { useState } from 'react';
import { useFrappeGetCall } from 'frappe-react-sdk';
import { API, type DocActivity as Activity } from '../lib/api';
import { Icon } from './Icon';
import { fmtDateLong } from '../lib/format';

const KIND: Record<string, { label: string; tone: string }> = {
	created: { label: 'Created', tone: 'ok' },
	submitted: { label: 'Submitted', tone: 'ok' },
	workflow: { label: 'Status', tone: 'pend' },
	cancelled: { label: 'Cancelled', tone: 'err' },
	edit: { label: 'Edited', tone: 'neutral' },
};

/** "2026-06-26 14:19:13" -> "26 Jun 2026, 2:19 PM" */
function whenText(s: string): string {
	const [d, t] = (s || '').split(' ');
	const date = fmtDateLong(d);
	if (!t) return date;
	const [h, m] = t.split(':');
	let hh = parseInt(h, 10);
	const ap = hh >= 12 ? 'PM' : 'AM';
	hh = hh % 12 || 12;
	return `${date}, ${hh}:${m} ${ap}`;
}

/** Audit trail for a document: created/last-edited by whom + when, and a timeline
 *  of field-level changes read from ERPNext's version history. */
export function DocActivity({ doctype, name }: { doctype: string; name: string }) {
	const [open, setOpen] = useState(false);
	const { data } = useFrappeGetCall<{ message: Activity }>(API.docActivity, { doctype, name }, name ? undefined : null);
	const a = data?.message;
	if (!a) return null;
	return (
		<section className="card">
			<button type="button" className="chead chead-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
				<Icon name="clock" size={16} />
				<span className="ttl">Activity</span>
				<span className="cnt">{a.entries.length}</span>
				<span className="spacer" />
				<Icon name="chevron" size={16} className={open ? 'chev open' : 'chev'} />
			</button>
			{!open ? null : (
			<>
			<div className="actmeta">
				<div><span className="k">Created</span><span className="v">{a.created_by} · {whenText(a.created_on)}</span></div>
				<div><span className="k">Last edited</span><span className="v">{a.modified_by} · {whenText(a.modified_on)}</span></div>
			</div>
			<div className="timeline">
				{a.entries.map((e, i) => {
					const k = KIND[e.kind] ?? KIND.edit;
					return (
						<div className="tl-item" key={i}>
							<span className={'tl-dot ' + k.tone} />
							<div className="tl-body">
								<div className="tl-head">
									<span className={'tag ' + k.tone}>{k.label}</span>
									<span className="tl-who">{e.who}</span>
									<span className="tl-when">{whenText(e.when)}</span>
								</div>
								{e.changes.length > 0 && (
									<div className="tl-changes">
										{e.changes.map((c, j) => (
											<div className="tl-change" key={j}>
												<span className="cl">{c.label}</span>
												{c.from != null && c.to != null && (
													<span className="cv">
														<span className="old">{c.from}</span>
														<span className="arr"> → </span>
														<span className="new">{c.to}</span>
													</span>
												)}
											</div>
										))}
									</div>
								)}
							</div>
						</div>
					);
				})}
			</div>
			</>
			)}
		</section>
	);
}
