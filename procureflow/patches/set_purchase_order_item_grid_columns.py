import json

import frappe
from frappe.custom.doctype.property_setter.property_setter import make_property_setter


def execute():
    # Trim two wide columns so all Purchase Order Item list-view columns
    # (including the new GST fields) fit inside Frappe's grid width budget,
    # i.e. they show by default without users having to add them manually.
    for fieldname in ("schedule_date", "rate"):
        make_property_setter(
            "Purchase Order Item",
            fieldname,
            "columns",
            1,
            "Int",
            validate_fields_for_doctype=False,
        )

    # Reset stale per-user grid column choices for Purchase Order. These saved
    # layouts predate the GST fields and override the in_list_view default, so
    # the new columns never appear until the user adds them by hand. Dropping
    # only the GridView key falls back to the (now complete) default and keeps
    # any saved list filters intact.
    rows = frappe.db.sql(
        "select user, data from `__UserSettings` where doctype=%s",
        ("Purchase Order",),
        as_dict=True,
    )
    for row in rows:
        try:
            data = json.loads(row.data or "{}")
        except Exception:
            continue
        if data.get("GridView"):
            data.pop("GridView", None)
            frappe.db.sql(
                "update `__UserSettings` set data=%s where user=%s and doctype=%s",
                (json.dumps(data), row.user, "Purchase Order"),
            )

    frappe.clear_cache(doctype="Purchase Order Item")
    frappe.clear_cache(doctype="Purchase Order")
