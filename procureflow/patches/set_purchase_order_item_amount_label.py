import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter


def execute():
    # Match the "Rate (Without Tax)" relabel so the grid is unambiguous:
    # amount = qty * rate-without-tax, with GST shown separately below.
    make_property_setter(
        "Purchase Order Item",
        "amount",
        "label",
        "Amount (Without Tax)",
        "Data",
        validate_fields_for_doctype=False,
    )
    frappe.clear_cache(doctype="Purchase Order Item")
