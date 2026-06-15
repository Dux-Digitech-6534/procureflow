import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields


def execute():
    if frappe.db.exists("Custom Field", "Purchase Order Item-custom_remark"):
        return

    create_custom_fields(
        {
            "Purchase Order Item": [
                {
                    "fieldname": "custom_remark",
                    "label": "Remark",
                    "fieldtype": "Small Text",
                    "insert_after": "description",
                    "allow_on_submit": 0,
                    "read_only": 0,
                }
            ]
        },
        update=True,
    )
    frappe.clear_cache(doctype="Purchase Order Item")
