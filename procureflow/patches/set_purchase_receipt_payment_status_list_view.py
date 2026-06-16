import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter


def execute():
    make_property_setter(
        "Purchase Receipt",
        "status",
        "in_list_view",
        0,
        "Check",
    )

    custom_field = "Purchase Receipt-custom_payment_status"
    if frappe.db.exists("Custom Field", custom_field):
        frappe.db.set_value("Custom Field", custom_field, "in_list_view", 1)

    frappe.clear_cache(doctype="Purchase Receipt")
