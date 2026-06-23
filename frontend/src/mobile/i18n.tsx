import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'hi';
const STORAGE_KEY = 'pf:m:lang';

/**
 * Mobile-app i18n. Flat dot-keyed dictionaries; English is the source/fallback.
 * Hindi is everyday spoken Hindi (Hinglish loanwords welcome), NOT formal/shuddh
 * Hindi — the users are construction-site field staff. ERP data values (project /
 * item / supplier names, etc.) are never translated; only fixed UI chrome is.
 */
const en: Record<string, string> = {
	// nav / common
	'nav.home': 'Home',
	'nav.requests': 'Requests',
	'nav.approvals': 'Approvals',
	'nav.receipts': 'Receipts',
	'common.loading': 'Loading…',
	'common.all': 'All',
	'common.noMatches': 'No matches',
	'common.cancel': 'Cancel',
	'common.keepEditing': 'Keep editing',
	'common.leave': 'Leave',
	'common.working': 'Working…',
	'common.items': 'Items',
	'common.item_one': 'item',
	'common.item_other': 'items',
	'common.noMatchSub': 'Try a different search or filter.',
	'common.uncategorised': 'Uncategorised',

	// confirm sheet
	'confirm.leaveTitle': 'Leave without saving?',
	'confirm.leaveMsg': 'Your details will be lost.',

	// home
	'home.hi': 'Hi {name}',
	'home.subtitle': 'Here’s what needs you today.',
	'home.awaitingApproval': 'Awaiting my approval',
	'home.myOpenRequests': 'My open requests',
	'home.deliveriesToReceive': 'Deliveries to receive',
	'home.new': 'New',
	'home.raiseMr': 'Raise a material request',
	'home.newMr': 'New material request',
	'home.browse': 'Browse',
	'home.purchaseOrders': 'Purchase orders',
	'home.poSub': 'Orders, status & GST breakdown',
	'home.receiptHistory': 'Receipt history',
	'home.receiptHistorySub': 'Past deliveries & payments',
	'home.stockOnHand': 'Stock on hand',
	'home.stockSub': 'Item balances by warehouse',
	'home.logout': 'Log out',
	'home.notifications': 'Notifications',
	'home.profile': 'Profile',

	// requests
	'req.title': 'My requests',
	'req.search': 'Search id, project or category',
	'req.emptyTitle': 'No requests yet',
	'req.emptySub': 'Tap the button below to raise your first material request.',
	'req.noMatchSub': 'Try a different search, status or date range.',
	'req.requiredFrom': 'Required from',
	'req.requiredTo': 'Required to',
	'req.highPriority': 'High priority',
	'status.draft': 'Draft',
	'status.pending': 'Pending',
	'status.pendingApproval': 'Pending approval',
	'status.approved': 'Approved',
	'status.ordered': 'Ordered',
	'status.partiallyOrdered': 'Partially ordered',
	'status.received': 'Received',
	'status.partiallyReceived': 'Partially received',
	'status.rejected': 'Rejected',
	'status.cancelled': 'Cancelled',
	'status.closed': 'Closed',
	'status.onHold': 'On Hold',
	'status.stopped': 'Stopped',

	// approvals
	'appr.title': 'Approvals',
	'appr.search': 'Search id, supplier, project or requester',
	'appr.allClear': 'All clear',
	'appr.allClearSub': 'Nothing is waiting for your approval.',
	'appr.materialRequests': 'Material requests',
	'appr.purchaseOrders': 'Purchase orders',
	'appr.requests': 'Requests',
	'appr.orders': 'Orders',
	'appr.by': 'by {name}',
	'appr.couldNotLoad': 'Couldn’t load the approval queue.',

	// receipts (to-receive)
	'rec.title': 'Receipts',
	'rec.search': 'Search order, supplier or project',
	'rec.emptyTitle': 'Nothing to receive',
	'rec.emptySub': 'Approved orders awaiting delivery will show up here.',
	'rec.toReceive': 'Deliveries to receive',
	'rec.awaiting': 'Awaiting delivery',
	'rec.pctReceived': '{pct}% received',
	'rec.couldNotLoad': 'Couldn’t load deliveries.',

	// receipt history
	'rh.title': 'Receipt history',
	'rh.search': 'Search receipt, supplier or project',
	'rh.emptyTitle': 'No receipts yet',
	'rh.emptySub': 'Recorded deliveries will appear here.',
	'rh.unpaid': 'Unpaid',
	'rh.partial': 'Partial',
	'rh.paid': 'Paid',
	'rh.couldNotLoad': 'Couldn’t load receipts.',

	// purchase orders (browse)
	'po.title': 'Purchase orders',
	'po.search': 'Search order, supplier, project or category',
	'po.emptyTitle': 'No purchase orders',
	'po.emptySub': 'Orders raised from requests will appear here.',
	'po.couldNotLoad': 'Couldn’t load orders.',

	// stock
	'stock.title': 'Stock on hand',
	'stock.search': 'Search item or warehouse',
	'stock.emptyTitle': 'No stock on hand',
	'stock.emptySub': 'Items with a balance will appear here.',
	'stock.balance_one': '{n} balance',
	'stock.balance_other': '{n} balances',
	'stock.couldNotLoad': 'Couldn’t load stock.',

	// notifications
	'notif.title': 'Notifications',
	'notif.markRead': 'Mark read',
	'notif.emptyTitle': 'No notifications',
	'notif.emptySub': 'You’re all caught up.',
	'notif.couldNotLoad': 'Couldn’t load notifications.',

	// profile
	'prof.title': 'Profile',
	'prof.company': 'Company',
	'prof.roles': 'Roles',
	'prof.language': 'Language',
	'prof.logout': 'Log out',

	// new request
	'nr.title': 'New request',
	'nr.category': 'Category',
	'nr.categoryPlaceholder': 'Select category…',
	'nr.categoryHint': 'Items are filtered to this category.',
	'nr.project': 'Project',
	'nr.projectPlaceholder': 'Select project…',
	'nr.requiredBy': 'Required by',
	'nr.priority': 'Priority',
	'nr.prioLow': 'Low',
	'nr.prioMedium': 'Medium',
	'nr.prioHigh': 'High',
	'nr.addItem': 'Search an item to add…',
	'nr.pickCategoryFirst': 'Pick a category first',
	'nr.specPlaceholder': 'Specification — grade, size, brand…',
	'nr.remarkPlaceholder': 'Remark (optional)',
	'nr.attachment': 'Attachment',
	'nr.photoAttached': 'Photo attached',
	'nr.addPhoto': 'Add a photo (optional)',
	'nr.photoHint': 'e.g. a handwritten indent slip',
	'nr.noteForApprover': 'Note for approver',
	'nr.notePlaceholder': 'Anything the approver should know…',
	'nr.addNote': '+ Add a note',
	'nr.saveDraft': 'Save draft',
	'nr.submit': 'Submit for approval',
	'nr.submitting': 'Submitting…',
	'nr.uploading': 'Uploading…',
	'nr.errCategory': 'Pick a category first.',
	'nr.errProject': 'Select a project.',
	'nr.errDate': 'Set the required-by date.',
	'nr.errItems': 'Add at least one item.',
	'nr.errQty': 'Every item needs a quantity above zero.',
	'nr.savedDraft': 'Saved as draft',
	'nr.submitted': 'Submitted for approval',
	'nr.leaveMsg': 'Your material request details will be lost.',

	// detail sheets (shared)
	'd.request': 'Request',
	'd.order': 'Order',
	'd.receipt': 'Receipt',
	'd.project': 'Project',
	'd.category': 'Category',
	'd.supplier': 'Supplier',
	'd.requiredBy': 'Required by',
	'd.requestedBy': 'Requested by',
	'd.orderDate': 'Order date',
	'd.receivedOn': 'Received on',
	'd.remark': 'Remark',
	'd.attachment': 'Attachment',
	'd.photos': 'Photos',
	'd.totals': 'Totals',
	'd.netTotal': 'Net total',
	'd.grandTotal': 'Grand total',
	'd.payment': 'Payment',
	'd.receiptTotal': 'Receipt total',
	'd.paid': 'Paid',
	'd.outstanding': 'Outstanding',
	'd.related': 'Related documents',
	'd.payments': 'Payments',
	'd.rejectReason': 'Reason for rejection (optional)…',
	'd.confirmReject': 'Confirm reject',
	'd.rejecting': 'Rejecting…',
	'd.approved': 'Request approved',
	'd.rejected': 'Request rejected',
	'd.orderApproved': 'Order approved',
	'd.orderRejected': 'Order rejected',
	'req.couldNotLoad': 'Couldn’t load your requests.',

	// record delivery
	'rv.title': 'Record delivery',
	'rv.receiptDate': 'Receipt date',
	'rv.itemsReceived': 'Items received',
	'rv.pending': 'Pending {n} {uom} · ordered {o}',
	'rv.uomReceived': '{uom} received',
	'rv.nothingPending': 'Nothing pending to receive on this order.',
	'rv.material': 'Material',
	'rv.invoice': 'Invoice',
	'rv.tapCapture': 'Tap to capture',
	'rv.deliveryNote': 'Supplier delivery note',
	'rv.deliveryNotePlaceholder': 'e.g. DN-00123',
	'rv.remark': 'Remark',
	'rv.remarkPlaceholder': 'Anything to note…',
	'rv.recording': 'Recording…',
	'rv.recorded': 'Delivery recorded',
	'rv.errNoPo': 'No purchase order.',
	'rv.errDate': 'Pick a receipt date.',
	'rv.errQty': 'Enter a received quantity for at least one item.',
	'rv.errExceed': 'Received quantity can’t exceed the pending quantity.',
	'rv.leaveTitle': 'Leave without recording?',
	'rv.leaveMsg': 'This delivery and its photos won’t be saved.',
};

const hi: Record<string, string> = {
	// nav / common
	'nav.home': 'होम',
	'nav.requests': 'रिक्वेस्ट',
	'nav.approvals': 'अप्रूवल',
	'nav.receipts': 'रिसीप्ट',
	'common.loading': 'लोड हो रहा है…',
	'common.all': 'सभी',
	'common.noMatches': 'कुछ नहीं मिला',
	'common.cancel': 'कैंसिल',
	'common.keepEditing': 'एडिट करते रहें',
	'common.leave': 'छोड़ें',
	'common.working': 'हो रहा है…',
	'common.items': 'आइटम',
	'common.item_one': 'आइटम',
	'common.item_other': 'आइटम',
	'common.noMatchSub': 'दूसरा सर्च या फिल्टर आज़माएं।',
	'common.uncategorised': 'बिना कैटेगरी',

	// confirm sheet
	'confirm.leaveTitle': 'बिना सेव किए छोड़ें?',
	'confirm.leaveMsg': 'आपकी जानकारी चली जाएगी।',

	// home
	'home.hi': 'नमस्ते {name}',
	'home.subtitle': 'आज आपके लिए ये काम हैं।',
	'home.awaitingApproval': 'मेरे अप्रूवल बाकी',
	'home.myOpenRequests': 'मेरी ओपन रिक्वेस्ट',
	'home.deliveriesToReceive': 'आने वाली डिलीवरी',
	'home.new': 'नया',
	'home.raiseMr': 'नई रिक्वेस्ट बनाएं',
	'home.newMr': 'नई मटेरियल रिक्वेस्ट',
	'home.browse': 'ब्राउज़ करें',
	'home.purchaseOrders': 'परचेज़ ऑर्डर',
	'home.poSub': 'ऑर्डर, स्टेटस और GST',
	'home.receiptHistory': 'रिसीप्ट हिस्ट्री',
	'home.receiptHistorySub': 'पुरानी डिलीवरी और पेमेंट',
	'home.stockOnHand': 'मौजूद स्टॉक',
	'home.stockSub': 'वेयरहाउस के हिसाब से स्टॉक',
	'home.logout': 'लॉग आउट',
	'home.notifications': 'नोटिफिकेशन',
	'home.profile': 'प्रोफाइल',

	// requests
	'req.title': 'मेरी रिक्वेस्ट',
	'req.search': 'आईडी, प्रोजेक्ट या कैटेगरी खोजें',
	'req.emptyTitle': 'अभी कोई रिक्वेस्ट नहीं',
	'req.emptySub': 'नीचे बटन दबाकर अपनी पहली मटेरियल रिक्वेस्ट बनाएं।',
	'req.noMatchSub': 'दूसरा सर्च, स्टेटस या डेट रेंज आज़माएं।',
	'req.requiredFrom': 'किस तारीख से',
	'req.requiredTo': 'किस तारीख तक',
	'req.highPriority': 'ज़रूरी',
	'status.draft': 'ड्राफ्ट',
	'status.pending': 'पेंडिंग',
	'status.pendingApproval': 'अप्रूवल बाकी',
	'status.approved': 'अप्रूव हुआ',
	'status.ordered': 'ऑर्डर हुआ',
	'status.partiallyOrdered': 'कुछ ऑर्डर हुआ',
	'status.received': 'मिल गया',
	'status.partiallyReceived': 'कुछ मिला',
	'status.rejected': 'रिजेक्ट',
	'status.cancelled': 'कैंसिल',
	'status.closed': 'बंद',
	'status.onHold': 'होल्ड पर',
	'status.stopped': 'रुका हुआ',

	// approvals
	'appr.title': 'अप्रूवल',
	'appr.search': 'आईडी, सप्लायर, प्रोजेक्ट या बनाने वाला खोजें',
	'appr.allClear': 'सब क्लियर',
	'appr.allClearSub': 'आपके अप्रूवल के लिए कुछ बाकी नहीं है।',
	'appr.materialRequests': 'मटेरियल रिक्वेस्ट',
	'appr.purchaseOrders': 'परचेज़ ऑर्डर',
	'appr.requests': 'रिक्वेस्ट',
	'appr.orders': 'ऑर्डर',
	'appr.by': '{name} ने बनाई',
	'appr.couldNotLoad': 'अप्रूवल लिस्ट लोड नहीं हो पाई।',

	// receipts (to-receive)
	'rec.title': 'रिसीप्ट',
	'rec.search': 'ऑर्डर, सप्लायर या प्रोजेक्ट खोजें',
	'rec.emptyTitle': 'रिसीव करने को कुछ नहीं',
	'rec.emptySub': 'जो ऑर्डर डिलीवरी के इंतज़ार में हैं वो यहाँ दिखेंगे।',
	'rec.toReceive': 'रिसीव करने वाली डिलीवरी',
	'rec.awaiting': 'डिलीवरी बाकी',
	'rec.pctReceived': '{pct}% मिला',
	'rec.couldNotLoad': 'डिलीवरी लोड नहीं हो पाई।',

	// receipt history
	'rh.title': 'रिसीप्ट हिस्ट्री',
	'rh.search': 'रिसीप्ट, सप्लायर या प्रोजेक्ट खोजें',
	'rh.emptyTitle': 'अभी कोई रिसीप्ट नहीं',
	'rh.emptySub': 'दर्ज की गई डिलीवरी यहाँ दिखेगी।',
	'rh.unpaid': 'बकाया',
	'rh.partial': 'कुछ पेमेंट',
	'rh.paid': 'पेमेंट हुआ',
	'rh.couldNotLoad': 'रिसीप्ट लोड नहीं हो पाई।',

	// purchase orders (browse)
	'po.title': 'परचेज़ ऑर्डर',
	'po.search': 'ऑर्डर, सप्लायर, प्रोजेक्ट या कैटेगरी खोजें',
	'po.emptyTitle': 'कोई परचेज़ ऑर्डर नहीं',
	'po.emptySub': 'रिक्वेस्ट से बने ऑर्डर यहाँ दिखेंगे।',
	'po.couldNotLoad': 'ऑर्डर लोड नहीं हो पाए।',

	// stock
	'stock.title': 'मौजूद स्टॉक',
	'stock.search': 'आइटम या वेयरहाउस खोजें',
	'stock.emptyTitle': 'कोई स्टॉक नहीं',
	'stock.emptySub': 'जिन आइटम का बैलेंस होगा वो यहाँ दिखेंगे।',
	'stock.balance_one': '{n} बैलेंस',
	'stock.balance_other': '{n} बैलेंस',
	'stock.couldNotLoad': 'स्टॉक लोड नहीं हो पाया।',

	// notifications
	'notif.title': 'नोटिफिकेशन',
	'notif.markRead': 'पढ़ा हुआ करें',
	'notif.emptyTitle': 'कोई नोटिफिकेशन नहीं',
	'notif.emptySub': 'सब देख लिया।',
	'notif.couldNotLoad': 'नोटिफिकेशन लोड नहीं हो पाए।',

	// profile
	'prof.title': 'प्रोफाइल',
	'prof.company': 'कंपनी',
	'prof.roles': 'रोल',
	'prof.language': 'भाषा',
	'prof.logout': 'लॉग आउट',

	// new request
	'nr.title': 'नई रिक्वेस्ट',
	'nr.category': 'कैटेगरी',
	'nr.categoryPlaceholder': 'कैटेगरी चुनें…',
	'nr.categoryHint': 'आइटम इसी कैटेगरी के दिखेंगे।',
	'nr.project': 'प्रोजेक्ट',
	'nr.projectPlaceholder': 'प्रोजेक्ट चुनें…',
	'nr.requiredBy': 'कब तक चाहिए',
	'nr.priority': 'प्रायोरिटी',
	'nr.prioLow': 'कम',
	'nr.prioMedium': 'नॉर्मल',
	'nr.prioHigh': 'ज़रूरी',
	'nr.addItem': 'जोड़ने के लिए आइटम खोजें…',
	'nr.pickCategoryFirst': 'पहले कैटेगरी चुनें',
	'nr.specPlaceholder': 'स्पेसिफिकेशन — ग्रेड, साइज़, ब्रांड…',
	'nr.remarkPlaceholder': 'रिमार्क (ऑप्शनल)',
	'nr.attachment': 'अटैचमेंट',
	'nr.photoAttached': 'फोटो लग गई',
	'nr.addPhoto': 'फोटो जोड़ें (ऑप्शनल)',
	'nr.photoHint': 'जैसे हाथ से लिखी इंडेंट पर्ची',
	'nr.noteForApprover': 'अप्रूव करने वाले के लिए नोट',
	'nr.notePlaceholder': 'जो भी अप्रूव करने वाले को बताना हो…',
	'nr.addNote': '+ नोट जोड़ें',
	'nr.saveDraft': 'ड्राफ्ट सेव करें',
	'nr.submit': 'अप्रूवल के लिए भेजें',
	'nr.submitting': 'भेज रहे हैं…',
	'nr.uploading': 'अपलोड हो रहा है…',
	'nr.errCategory': 'पहले कैटेगरी चुनें।',
	'nr.errProject': 'प्रोजेक्ट चुनें।',
	'nr.errDate': 'कब तक चाहिए, तारीख डालें।',
	'nr.errItems': 'कम से कम एक आइटम जोड़ें।',
	'nr.errQty': 'हर आइटम की क्वांटिटी ज़ीरो से ज़्यादा होनी चाहिए।',
	'nr.savedDraft': 'ड्राफ्ट सेव हो गया',
	'nr.submitted': 'अप्रूवल के लिए भेज दिया',
	'nr.leaveMsg': 'आपकी रिक्वेस्ट की जानकारी चली जाएगी।',

	// detail sheets (shared)
	'd.request': 'रिक्वेस्ट',
	'd.order': 'ऑर्डर',
	'd.receipt': 'रिसीप्ट',
	'd.project': 'प्रोजेक्ट',
	'd.category': 'कैटेगरी',
	'd.supplier': 'सप्लायर',
	'd.requiredBy': 'कब तक चाहिए',
	'd.requestedBy': 'बनाने वाला',
	'd.orderDate': 'ऑर्डर डेट',
	'd.receivedOn': 'रिसीव की तारीख',
	'd.remark': 'रिमार्क',
	'd.attachment': 'अटैचमेंट',
	'd.photos': 'फोटो',
	'd.totals': 'टोटल',
	'd.netTotal': 'नेट टोटल',
	'd.grandTotal': 'ग्रैंड टोटल',
	'd.payment': 'पेमेंट',
	'd.receiptTotal': 'रिसीप्ट टोटल',
	'd.paid': 'पेमेंट हुआ',
	'd.outstanding': 'बकाया',
	'd.related': 'जुड़े हुए डॉक्यूमेंट',
	'd.payments': 'पेमेंट',
	'd.rejectReason': 'रिजेक्ट करने की वजह (ऑप्शनल)…',
	'd.confirmReject': 'रिजेक्ट कन्फर्म करें',
	'd.rejecting': 'रिजेक्ट हो रहा है…',
	'd.approved': 'रिक्वेस्ट अप्रूव हुई',
	'd.rejected': 'रिक्वेस्ट रिजेक्ट हुई',
	'd.orderApproved': 'ऑर्डर अप्रूव हुआ',
	'd.orderRejected': 'ऑर्डर रिजेक्ट हुआ',
	'req.couldNotLoad': 'आपकी रिक्वेस्ट लोड नहीं हो पाईं।',

	// record delivery
	'rv.title': 'डिलीवरी दर्ज करें',
	'rv.receiptDate': 'रिसीप्ट की तारीख',
	'rv.itemsReceived': 'मिले हुए आइटम',
	'rv.pending': 'बाकी {n} {uom} · ऑर्डर {o}',
	'rv.uomReceived': '{uom} मिला',
	'rv.nothingPending': 'इस ऑर्डर पर रिसीव करने को कुछ बाकी नहीं।',
	'rv.material': 'मटेरियल',
	'rv.invoice': 'इनवॉइस',
	'rv.tapCapture': 'फोटो लेने के लिए टैप करें',
	'rv.deliveryNote': 'सप्लायर डिलीवरी नोट',
	'rv.deliveryNotePlaceholder': 'जैसे DN-00123',
	'rv.remark': 'रिमार्क',
	'rv.remarkPlaceholder': 'कुछ लिखना हो तो…',
	'rv.recording': 'दर्ज हो रहा है…',
	'rv.recorded': 'डिलीवरी दर्ज हो गई',
	'rv.errNoPo': 'कोई परचेज़ ऑर्डर नहीं।',
	'rv.errDate': 'रिसीप्ट की तारीख चुनें।',
	'rv.errQty': 'कम से कम एक आइटम की रिसीव क्वांटिटी डालें।',
	'rv.errExceed': 'रिसीव क्वांटिटी बाकी क्वांटिटी से ज़्यादा नहीं हो सकती।',
	'rv.leaveTitle': 'बिना दर्ज किए छोड़ें?',
	'rv.leaveMsg': 'ये डिलीवरी और इसकी फोटो सेव नहीं होंगी।',
};

const DICTS: Record<Lang, Record<string, string>> = { en, hi };

type TFn = (key: string, vars?: Record<string, string | number>) => string;

interface LangCtx {
	lang: Lang;
	setLang: (l: Lang) => void;
	t: TFn;
}

const Ctx = createContext<LangCtx | null>(null);

function readLang(): Lang {
	try {
		const v = localStorage.getItem(STORAGE_KEY);
		return v === 'hi' ? 'hi' : 'en';
	} catch {
		return 'en';
	}
}

export function LangProvider({ children }: { children: ReactNode }) {
	const [lang, setLangState] = useState<Lang>(readLang);

	const setLang = useCallback((l: Lang) => {
		setLangState(l);
		try {
			localStorage.setItem(STORAGE_KEY, l);
		} catch {
			/* ignore */
		}
	}, []);

	const t = useCallback<TFn>(
		(key, vars) => {
			let s = DICTS[lang][key] ?? en[key] ?? key;
			if (vars) {
				for (const k in vars) s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
			}
			return s;
		},
		[lang],
	);

	const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
	return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
	const c = useContext(Ctx);
	if (!c) throw new Error('useLang must be used within LangProvider');
	return c;
}

/** Map an English status label (from mr/poDisplayStatus) to its i18n key. */
const STATUS_KEY: Record<string, string> = {
	Draft: 'status.draft',
	'Pending approval': 'status.pendingApproval',
	Approved: 'status.approved',
	Ordered: 'status.ordered',
	'Partially ordered': 'status.partiallyOrdered',
	Received: 'status.received',
	'Partially received': 'status.partiallyReceived',
	Rejected: 'status.rejected',
	Cancelled: 'status.cancelled',
	Closed: 'status.closed',
	'On Hold': 'status.onHold',
	Stopped: 'status.stopped',
};

/** Translate a backend/display status label; passes through if unknown. */
export function tStatus(t: TFn, label: string): string {
	const key = STATUS_KEY[label];
	return key ? t(key) : label;
}

const PAY_KEY: Record<string, string> = {
	'Not Paid': 'rh.unpaid',
	'Partially Paid': 'rh.partial',
	'Fully Paid': 'rh.paid',
};
/** Translate a payment-status enum value (custom_payment_status). */
export function tPay(t: TFn, label: string | null | undefined): string {
	if (!label) return '';
	return PAY_KEY[label] ? t(PAY_KEY[label]) : label;
}

const PRIO_KEY: Record<string, string> = {
	High: 'nr.prioHigh',
	Medium: 'nr.prioMedium',
	Low: 'nr.prioLow',
};
/** Translate a priority enum value (custom_priority). */
export function tPrio(t: TFn, label: string | null | undefined): string {
	if (!label) return '';
	return PRIO_KEY[label] ? t(PRIO_KEY[label]) : label;
}
