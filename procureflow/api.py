import frappe
from frappe.model.mapper import get_mapped_doc

@frappe.whitelist()
def make_supplier_quotation(source_name, target_doc=None):

    def set_missing_values(source, target):
        # 🔥 Direct assign (guaranteed working)
        target.custom_project_name = source.custom_select_project_
        target.custom_store_name = source.set_warehouse

    doc = get_mapped_doc(
        "Material Request",
        source_name,
        {
            "Material Request": {
                "doctype": "Supplier Quotation",
                "field_map": {
                    "name": "material_request"
                }
            },
            "Material Request Item": {
                "doctype": "Supplier Quotation Item",
                "field_map": {
                    "name": "material_request_item",
                    "parent": "material_request"
                }
            }
        },
        target_doc,
        set_missing_values
    )

    return doc





#    Fetch attachment for purchase order on material request 

import frappe


def copy_receipt_from_material_request(doc, method=None):
    """
    Copy custom_add_receipt from linked Material Request to Purchase Order.

    Conditions:
    - Only set if Purchase Order custom_add_receipt is empty
    - If multiple Material Requests are linked, use the first one with attachment
    - Works when items are added using Get Items From Material Request
    """

    if doc.custom_add_receipt:
        return

    material_requests = []

    for item in doc.items:
        if item.material_request and item.material_request not in material_requests:
            material_requests.append(item.material_request)

    for mr in material_requests:
        receipt = frappe.db.get_value(
            "Material Request",
            mr,
            "custom_add_receipt"
        )

        if receipt:
            doc.custom_add_receipt = receipt
            break