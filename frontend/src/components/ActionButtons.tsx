import { useState, type MouseEvent } from 'react';
import { useFrappePostCall } from 'frappe-react-sdk';
import { API, actionTone } from '../lib/api';
import { Modal } from './ui';
import { TextArea } from './form';
import { parseServerError } from '../lib/format';

const SM = { padding: '5px 12px', fontSize: 12.5 };

export function ActionButtons({
	doctype,
	name,
	actions,
	onDone,
}: {
	doctype: string;
	name: string;
	actions: string[];
	onDone: () => void;
}) {
	const { call: apply, loading } = useFrappePostCall(API.applyAction);
	const [rejecting, setRejecting] = useState<string | null>(null);
	const [reason, setReason] = useState('');
	const [busy, setBusy] = useState<string | null>(null);
	const [err, setErr] = useState('');

	async function run(action: string, remark = '') {
		setBusy(action);
		setErr('');
		try {
			await apply({ doctype, name, action, remark });
			setRejecting(null);
			setReason('');
			onDone();
		} catch (e) {
			setErr(parseServerError(e));
		} finally {
			setBusy(null);
		}
	}

	function onClick(e: MouseEvent, action: string) {
		e.stopPropagation();
		if (/reject/i.test(action)) {
			setReason('');
			setErr('');
			setRejecting(action);
			return;
		}
		void run(action);
	}

	if (!actions || actions.length === 0) return null;

	return (
		<span style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
			{actions.map((a) => {
				const tone = actionTone(a);
				const cls = 'btn' + (tone === 'primary' ? ' primary' : tone === 'danger' ? ' danger' : '');
				return (
					<button key={a} className={cls} style={SM} disabled={loading} onClick={(e) => onClick(e, a)}>
						{busy === a ? '…' : a}
					</button>
				);
			})}
			{rejecting && (
				<Modal title={`${rejecting} — reason`} icon="close" onClose={() => setRejecting(null)}>
					<div className="formgrid">
						<div className="span2">
							<label className="field">
								<span className="flabel">Rejection remark</span>
								<TextArea value={reason} onChange={setReason} rows={3} placeholder="Why is this being rejected?" />
							</label>
						</div>
					</div>
					<div className="formfoot">
						{err && <span className="ferr">{err}</span>}
						<span className="spacer" />
						<button className="btn" onClick={() => setRejecting(null)}>
							Cancel
						</button>
						<button className="btn danger" disabled={loading} onClick={() => void run(rejecting, reason)}>
							{loading ? 'Rejecting…' : 'Confirm reject'}
						</button>
					</div>
				</Modal>
			)}
		</span>
	);
}
