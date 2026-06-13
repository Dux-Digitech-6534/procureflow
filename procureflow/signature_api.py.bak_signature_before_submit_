import frappe


SIGNATURE_DOCTYPE = 'Company Authorized Signature'
PO_SIGNATURE_FIELD = 'custom_company_signature'


def get_company_authorized_signature(company, transaction_date=None):
    if not company:
        return None

    signatures = frappe.get_all(
        SIGNATURE_DOCTYPE,
        filters={'company': company, 'is_active': 1},
        fields=['name', 'user', 'company', 'signature_image', 'modified'],
        order_by='modified desc',
        limit_page_length=1,
    )
    return signatures[0] if signatures else None


def _set_if_field_exists(doc, fieldname, value):
    if doc.meta.has_field(fieldname):
        doc.set(fieldname, value or '')


def set_purchase_order_company_signature(doc, method=None):
    company = doc.get('custom_test_company_') or doc.get('company')
    signature = get_company_authorized_signature(company)
    signature_image = signature.signature_image if signature else ''

    _set_if_field_exists(doc, PO_SIGNATURE_FIELD, signature_image)
