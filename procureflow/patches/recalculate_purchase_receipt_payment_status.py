import frappe
from procureflow.procure_flow.doctype.procureflow_payment_entry.procureflow_payment_entry import (
    update_purchase_receipt_payment_status,
)


def execute():
    purchase_receipts = frappe.get_all(
        "Purchase Receipt",
        filters={"custom_payment_status": ["in", ["", None]]},
        pluck="name",
    )

    for purchase_receipt in purchase_receipts:
        update_purchase_receipt_payment_status(purchase_receipt)

    frappe.clear_cache(doctype="Purchase Receipt")
