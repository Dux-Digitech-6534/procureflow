import frappe


DOCTYPE = "Purchase Receipt"
FIELDNAME = "custom_payment_status"
OPTIONS = "Not Paid\nPartially Paid\nFully Paid"
DEFAULT = "Not Paid"


def execute():
    custom_field_name = frappe.db.exists(
        "Custom Field",
        {
            "dt": DOCTYPE,
            "fieldname": FIELDNAME,
        },
    )

    if custom_field_name:
        fieldtype = frappe.db.get_value("Custom Field", custom_field_name, "fieldtype")
        if fieldtype in (None, "", "Select"):
            frappe.db.set_value(
                "Custom Field",
                custom_field_name,
                {
                    "fieldtype": "Select",
                    "options": OPTIONS,
                    "default": DEFAULT,
                    "in_list_view": 1,
                },
            )

    update_existing_property_setter("options", "Text", OPTIONS)
    update_existing_property_setter("default", "Text", DEFAULT)

    frappe.clear_cache(doctype=DOCTYPE)
    meta_field = frappe.get_meta(DOCTYPE).get_field(FIELDNAME)
    if meta_field and DEFAULT not in (meta_field.options or "").splitlines():
        upsert_property_setter("options", "Text", OPTIONS)
        upsert_property_setter("default", "Text", DEFAULT)

    frappe.db.sql(
        """
        update `tabPurchase Receipt`
        set custom_payment_status = %s
        where ifnull(custom_payment_status, '') = ''
        """,
        DEFAULT,
    )

    frappe.clear_cache(doctype=DOCTYPE)


def update_existing_property_setter(property_name, property_type, value):
    property_setter = frappe.db.exists(
        "Property Setter",
        {
            "doc_type": DOCTYPE,
            "doctype_or_field": "DocField",
            "field_name": FIELDNAME,
            "property": property_name,
        },
    )

    if property_setter:
        frappe.db.set_value(
            "Property Setter",
            property_setter,
            {
                "property_type": property_type,
                "value": value,
            },
        )


def upsert_property_setter(property_name, property_type, value):
    property_setter = frappe.db.exists(
        "Property Setter",
        {
            "doc_type": DOCTYPE,
            "doctype_or_field": "DocField",
            "field_name": FIELDNAME,
            "property": property_name,
        },
    )

    if property_setter:
        frappe.db.set_value(
            "Property Setter",
            property_setter,
            {
                "property_type": property_type,
                "value": value,
            },
        )
        return

    frappe.get_doc(
        {
            "doctype": "Property Setter",
            "doc_type": DOCTYPE,
            "doctype_or_field": "DocField",
            "field_name": FIELDNAME,
            "property": property_name,
            "property_type": property_type,
            "value": value,
        }
    ).insert(ignore_permissions=True)
