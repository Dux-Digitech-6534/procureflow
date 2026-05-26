frappe.ui.form.on("Purchase Receipt", {
    onload: function (frm) {
        hide_purchase_receipt_buttons(frm);
        set_project_company_from_purchase_order(frm);
    },

    refresh: function (frm) {
        hide_purchase_receipt_buttons(frm);
        set_project_company_from_purchase_order(frm);
        show_procureflow_payment_status(frm);
        setup_purchase_receipt_create_menu(frm);

        // Buttons/dropdown late render hote hain, isliye repeat
        setTimeout(() => hide_purchase_receipt_buttons(frm), 500);
        setTimeout(() => hide_purchase_receipt_buttons(frm), 1000);
        setTimeout(() => set_project_company_from_purchase_order(frm), 500);
        setTimeout(() => set_project_company_from_purchase_order(frm), 1000);
        setTimeout(() => show_procureflow_payment_status(frm), 500);
        setTimeout(() => setup_purchase_receipt_create_menu(frm), 500);
        setTimeout(() => setup_purchase_receipt_create_menu(frm), 1000);
    },

    custom_project_name: function (frm) {
        set_company_from_project_master(frm);
    }
});

frappe.ui.form.on("Purchase Receipt Item", {
    purchase_order: function (frm) {
        set_project_company_from_purchase_order(frm);
    }
});

function show_procureflow_payment_status(frm) {
    if (frm.doc.custom_payment_status) {
        let color = frm.doc.custom_payment_status === "Fully Paid" ? "green" : "orange";
        frm.page.set_indicator(__(frm.doc.custom_payment_status), color);
    }
}

function set_company_from_project_master(frm) {
    if (!frm.doc.custom_project_name) {
        frm.set_value("custom_test_company_", "");
        return;
    }

    frappe.db.get_value(
        "Project Master",
        frm.doc.custom_project_name,
        "company_name"
    ).then(function (r) {
        if (r.message && r.message.company_name) {
            frm.set_value("custom_test_company_", r.message.company_name);
        } else {
            frm.set_value("custom_test_company_", "");
        }
    });
}

function set_project_company_from_purchase_order(frm) {
    if (frm.doc.custom_project_name && frm.doc.custom_test_company_) {
        return;
    }

    let purchase_order = get_linked_purchase_order(frm);

    if (!purchase_order) {
        return;
    }

    frappe.db.get_value(
        "Purchase Order",
        purchase_order,
        ["custom_project_name", "custom_test_company_"]
    ).then(function (r) {
        if (!r.message) {
            return;
        }

        if (r.message.custom_project_name && !frm.doc.custom_project_name) {
            frm.set_value("custom_project_name", r.message.custom_project_name);
        }

        if (r.message.custom_test_company_ && !frm.doc.custom_test_company_) {
            frm.set_value("custom_test_company_", r.message.custom_test_company_);
        }
    });
}

function get_linked_purchase_order(frm) {
    if (frm.doc.custom_purchase_order) {
        return frm.doc.custom_purchase_order;
    }

    let row = (frm.doc.items || []).find(item => item.purchase_order);
    return row ? row.purchase_order : null;
}

function setup_purchase_receipt_create_menu(frm) {
    remove_default_purchase_receipt_create_options(frm);

    if (frm.doc.docstatus !== 1) {
        return;
    }

    frm.remove_custom_button(__("Create Payment Entry"), __("Create"));
    frm.add_custom_button(__("Create Payment Entry"), function () {
        frappe.call({
            method: "procureflow.api.make_procureflow_payment_entry",
            args: {
                source_name: frm.doc.name
            },
            callback: function (r) {
                if (!r.exc) {
                    frappe.new_doc("Procureflow Payment Entry", r.message || {});
                }
            }
        });
    }, __("Create"));
}

function remove_default_purchase_receipt_create_options(frm) {
    [
        "Landed Cost Voucher",
        "Purchase Return",
        "Make Stock Entry",
        "Retention Stock Entry",
        "Purchase Invoice"
    ].forEach(function (label) {
        frm.remove_custom_button(__(label), __("Create"));
    });

    hide_default_purchase_receipt_create_options();
}

function hide_default_purchase_receipt_create_options() {
    [
        "Landed Cost Voucher",
        "Purchase Return",
        "Make Stock Entry",
        "Retention Stock Entry",
        "Purchase Invoice"
    ].forEach(function (label) {
        $('.dropdown-menu a:contains("' + label + '")').hide();
        $('.dropdown-menu button:contains("' + label + '")').hide();
        $('.dropdown-item:contains("' + label + '")').hide();
    });
}

function hide_purchase_receipt_buttons(frm) {
    setTimeout(() => {
        // Get Items From dropdown ke andar Purchase Invoice option hide
        $('.dropdown-menu a:contains("Purchase Invoice")').hide();
        $('.dropdown-menu button:contains("Purchase Invoice")').hide();
        $('.dropdown-item:contains("Purchase Invoice")').hide();

        // Child table Download / Upload buttons hide
        $('[data-fieldname="items"] .grid-download').hide();
        $('[data-fieldname="items"] .grid-upload').hide();

        // Fallback by button text inside items table
        $('[data-fieldname="items"] button:contains("Download")').hide();
        $('[data-fieldname="items"] button:contains("Upload")').hide();

        // Extra fallback for visible Download / Upload buttons
        $('button:contains("Download")').hide();
        $('button:contains("Upload")').hide();
        hide_default_purchase_receipt_create_options();

    }, 300);
}

// Dropdown open karne ke baad bhi Purchase Invoice hide rahe
$(document).on("click", 'button:contains("Get Items From")', function () {
    setTimeout(() => {
        $('.dropdown-menu a:contains("Purchase Invoice")').hide();
        $('.dropdown-menu button:contains("Purchase Invoice")').hide();
        $('.dropdown-item:contains("Purchase Invoice")').hide();
    }, 100);
});



// add date and time to hidden field 


frappe.ui.form.on('Purchase Receipt', {
    custom_add_material: function (frm) {
        if (frm.doc.custom_add_material) {
            frm.set_value(
                'custom_material_receipt_datetime',
                frappe.datetime.now_datetime()
            );
        } else {
            frm.set_value('custom_material_receipt_datetime', '');
        }
    },

    custom_add_invoice: function (frm) {
        if (frm.doc.custom_add_invoice) {
            frm.set_value(
                'custom_material_invoice_datetime',
                frappe.datetime.now_datetime()
            );
        } else {
            frm.set_value('custom_material_invoice_datetime', '');
        }
    }
});
