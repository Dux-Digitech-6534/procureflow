frappe.ui.form.on("Procureflow Payment Entry", {
    onload: function (frm) {
        if (frm.doc.purchase_receipt) {
            set_payment_entry_values_from_purchase_receipt(frm);
        }
    },

    project: function (frm) {
        set_company_from_project(frm);
    },

    purchase_receipt: function (frm) {
        set_payment_entry_values_from_purchase_receipt(frm);
    }
});

function set_company_from_project(frm) {
    if (!frm.doc.project) {
        frm.set_value("company", "");
        return;
    }

    frappe.db.get_value("Project Master", frm.doc.project, "company_name").then(function (r) {
        if (r.message && r.message.company_name) {
            frm.set_value("company", r.message.company_name);
        } else {
            frm.set_value("company", "");
        }
    });
}

function set_payment_entry_values_from_purchase_receipt(frm) {
    if (frm.doc.docstatus !== 0 || !frm.doc.purchase_receipt) {
        return;
    }

    frappe.call({
        method: "procureflow.api.get_procureflow_payment_entry_defaults",
        args: {
            purchase_receipt: frm.doc.purchase_receipt,
            payment_entry: frm.doc.name
        },
        callback: function (r) {
            if (r.exc || !r.message) {
                return;
            }

            let values = r.message;

            frm.set_value("supplier", values.supplier || "");
            frm.set_value("project", values.project || "");
            frm.set_value("company", values.company || "");
            frm.set_value("previous_paid_amount", values.previous_paid_amount || 0);
            frm.set_value("outstanding_amount", values.outstanding_amount || 0);

            if (!frm.doc.amount || frm.is_new()) {
                frm.set_value("amount", values.amount || values.outstanding_amount || 0);
            }

            if (!frm.doc.payment_date) {
                frm.set_value("payment_date", values.payment_date);
            }
        }
    });
}
