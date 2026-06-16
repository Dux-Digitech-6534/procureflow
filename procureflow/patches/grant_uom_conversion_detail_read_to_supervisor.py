import frappe


def execute():
    role = "Supervisor"
    doctype = "UOM Conversion Detail"

    if not frappe.db.exists("Role", role):
        return

    if not frappe.db.exists("DocType", doctype):
        return

    existing = frappe.db.exists(
        "Custom DocPerm",
        {
            "parent": doctype,
            "role": role,
            "permlevel": 0,
        },
    )

    if existing:
        permission = frappe.get_doc("Custom DocPerm", existing)
        changed = False

        for fieldname in ("read", "select"):
            if not permission.get(fieldname):
                permission.set(fieldname, 1)
                changed = True

        if changed:
            permission.save(ignore_permissions=True)
    else:
        permission = frappe.get_doc(
            {
                "doctype": "Custom DocPerm",
                "parent": doctype,
                "parenttype": "DocType",
                "parentfield": "permissions",
                "role": role,
                "permlevel": 0,
                "read": 1,
                "select": 1,
            }
        )
        permission.insert(ignore_permissions=True)

    frappe.clear_cache(doctype=doctype)
