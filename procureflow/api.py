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