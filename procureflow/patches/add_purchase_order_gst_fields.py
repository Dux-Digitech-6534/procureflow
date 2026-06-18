import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
from frappe.custom.doctype.property_setter.property_setter import make_property_setter

from procureflow.purchase_tax import ensure_gst_accounts


def execute():
    create_custom_fields(
        {
            "Purchase Order Item": [
                {
                    "fieldname": "custom_gst_percent",
                    "label": "GST %",
                    "fieldtype": "Percent",
                    "insert_after": "rate",
                    "in_list_view": 1,
                    "columns": 1,
                    "allow_on_submit": 0,
                },
                {
                    "fieldname": "custom_rate_with_tax",
                    "label": "Rate (With Tax)",
                    "fieldtype": "Currency",
                    "options": "currency",
                    "insert_after": "custom_gst_percent",
                    "in_list_view": 1,
                    "columns": 1,
                    "allow_on_submit": 0,
                },
            ],
            "Purchase Order": [
                {
                    "fieldname": "custom_tax_type",
                    "label": "Tax Type",
                    "fieldtype": "Select",
                    "options": "\nIntra-State (CGST + SGST)\nInter-State (IGST)",
                    "insert_after": "tax_category",
                    "allow_on_submit": 0,
                    "description": (
                        "CGST + SGST when supplier and company are in the same state, "
                        "else IGST. Auto-detected from addresses; choose manually if blank."
                    ),
                },
            ],
        },
        update=True,
    )

    # Make the tax model explicit: the standard Rate column is the rate WITHOUT tax.
    make_property_setter(
        "Purchase Order Item",
        "rate",
        "label",
        "Rate (Without Tax)",
        "Data",
        validate_fields_for_doctype=False,
    )

    # Pre-create the GST label accounts for every company so the first PO save
    # never has to create them mid-transaction.
    for company in frappe.get_all("Company", pluck="name"):
        try:
            ensure_gst_accounts(company)
        except Exception:
            frappe.log_error(frappe.get_traceback(), "procureflow: ensure_gst_accounts in patch")

    frappe.clear_cache(doctype="Purchase Order Item")
    frappe.clear_cache(doctype="Purchase Order")
