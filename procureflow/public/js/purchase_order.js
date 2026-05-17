
// Get Details from supplier quotation 





// maping perent 

frappe.ui.form.on('Purchase Order', {

    onload: function (frm) {

        console.log("PO Loaded");

        // Existing SQ route logic
        let prev = frappe.route_history.slice(-2)[0];

        if (prev && prev[1] === "Supplier Quotation") {
            let sq_name = prev[2];
            console.log("SQ Found:", sq_name);
            set_sq_data(frm, sq_name);
        }

        // MR → Create → PO mapping
        setTimeout(() => {
            set_mr_data(frm);
        }, 800);
    },

    refresh: function (frm) {

        console.log("PO Refresh");

        // Existing SQ item logic
        if (frm.doc.items && frm.doc.items.length > 0) {

            let sq_name = frm.doc.items[0].supplier_quotation;

            if (sq_name) {
                set_sq_data(frm, sq_name);
            }
        }

        // MR → PO mapping
        set_mr_data(frm);

        apply_category_filter(frm);
        map_specification(frm);
    }
});


frappe.ui.form.on('Purchase Order', {

    onload: function (frm) {

        console.log("PO Loaded");

        let prev = frappe.route_history.slice(-2)[0];

        // 🔥 CASE 1: SQ → Create → PO
        if (prev && prev[1] === "Supplier Quotation") {

            let sq_name = prev[2];

            console.log("SQ Found:", sq_name);

            set_sq_data(frm, sq_name);
        }
    },

    refresh: function (frm) {

        console.log("PO Refresh");

        // 🔥 CASE 2: Get Items From → SQ
        if (frm.doc.items && frm.doc.items.length > 0) {

            let sq_name = frm.doc.items[0].supplier_quotation;

            console.log("SQ from Item:", sq_name);

            if (sq_name) {
                set_sq_data(frm, sq_name);
            }
        }

        // 🔥 Category Filter apply
        apply_category_filter(frm);

        // 🔥 Child specification mapping
        map_specification(frm);
    }
});


// Parent Data Function


function set_sq_data(frm, sq_name) {

    frappe.db.get_doc("Supplier Quotation", sq_name)
        .then(sq => {

            console.log("SQ Data:", sq);

            // 🔥 Project
            frm.set_value("custom_project_name", sq.custom_project_name);

            // 🔥 Remark
            frm.set_value("custom_remark", sq.custom_remark);

            // 🔥 Category
            frm.set_value("custom_category", sq.custom_category);

            // WAREHOUSE
            frm.set_value("set_warehouse", sq.custom_store_name)
        });
}


function set_mr_data(frm) {

    if (!frm.doc.items || frm.doc.items.length === 0) {
        return;
    }

    // In Purchase Order Item, source Material Request is usually stored here
    let mr_name = frm.doc.items[0].material_request;

    if (!mr_name) {
        console.log("No Material Request found in PO items");
        return;
    }

    console.log("MR Found:", mr_name);

    frappe.db.get_doc("Material Request", mr_name)
        .then(mr => {

            console.log("MR Data:", mr);

            // Map:
            // Material Request.custom_project_name
            // OR fallback to Material Request.custom_select_project_
            // → Purchase Order.custom_project_name

            frm.set_value(
                "custom_project_name",
                mr.custom_project_name || mr.custom_select_project_ || ""
            );

            // Optional: map these also if needed
            frm.set_value("custom_category", mr.custom_category || "");
            frm.set_value("set_warehouse", mr.set_warehouse || "");

            if (mr.schedule_date && !frm.doc.schedule_date) {
                frm.set_value("schedule_date", mr.schedule_date);
            }
        });
}



// . Child Specification Mapping


function map_specification(frm) {

    if (frm.doc.items && frm.doc.items.length > 0) {

        frm.doc.items.forEach(function (item) {

            if (item.supplier_quotation && item.supplier_quotation_item) {

                frappe.db.get_doc("Supplier Quotation", item.supplier_quotation)
                    .then(sq => {

                        if (sq && sq.items) {

                            let sq_item = sq.items.find(i => i.name === item.supplier_quotation_item);

                            if (sq_item) {

                                console.log("SQ Item Found:", sq_item);

                                frappe.model.set_value(
                                    item.doctype,
                                    item.name,
                                    "custom_specification",
                                    sq_item.custom_specification || ""
                                );
                            }
                        }
                    });
            }
        });
    }
}


// Category Filter (Same like SQ)


function apply_category_filter(frm) {

    frm.set_query("item_code", "items", function () {

        if (frm.doc.custom_category) {

            return {
                query: "erpnext.controllers.queries.item_query",
                filters: {
                    "custom_category": frm.doc.custom_category
                }
            };

        } else {
            return {};
        }
    });
}


// child table filter function 


frappe.ui.form.on('Purchase Order', {

    refresh: function (frm) {

        console.log("SQ Category Filter Applied");

        frm.set_query("item_code", "items", function (doc, cdt, cdn) {

            if (frm.doc.custom_category) {

                return {
                    query: "erpnext.controllers.queries.item_query",
                    filters: {
                        "custom_category": frm.doc.custom_category
                    }
                };

            } else {

                return {};
            }
        });
    }
});




// add user name and date 
// =====================================================
// Purchase Order: Dynamic Required By Label
// Shows:
// Required By ( Requested By: {owner} | 📅 Date: {schedule_date} )
//
// Works for:
// 1. Material Request → Purchase Order
// 2. Material Request → Supplier Quotation → Purchase Order
// =====================================================

frappe.ui.form.on('Purchase Order', {

    onload: function (frm) {
        setTimeout(() => {
            update_required_by_label_from_mr(frm);
        }, 800);
    },

    refresh: function (frm) {
        setTimeout(() => {
            update_required_by_label_from_mr(frm);
        }, 800);
    },

    validate: function (frm) {
        update_required_by_label_from_mr(frm);
    }
});


frappe.ui.form.on('Purchase Order Item', {

    item_code: function (frm, cdt, cdn) {
        setTimeout(() => {
            update_required_by_label_from_mr(frm);
        }, 300);
    },

    material_request: function (frm, cdt, cdn) {
        setTimeout(() => {
            update_required_by_label_from_mr(frm);
        }, 300);
    },

    material_request_item: function (frm, cdt, cdn) {
        setTimeout(() => {
            update_required_by_label_from_mr(frm);
        }, 300);
    },

    supplier_quotation: function (frm, cdt, cdn) {
        setTimeout(() => {
            update_required_by_label_from_mr(frm);
        }, 300);
    },

    supplier_quotation_item: function (frm, cdt, cdn) {
        setTimeout(() => {
            update_required_by_label_from_mr(frm);
        }, 300);
    }
});


// =====================================================
// Main Function
// =====================================================

async function update_required_by_label_from_mr(frm) {

    try {
        // Prevent old async calls from overwriting latest label
        frm.__mr_label_call_id = (frm.__mr_label_call_id || 0) + 1;
        let call_id = frm.__mr_label_call_id;

        let mr_name = await get_linked_material_request_from_po(frm);

        if (call_id !== frm.__mr_label_call_id) {
            return;
        }

        if (!mr_name) {
            reset_required_by_label(frm);
            console.log("No linked Material Request found for this Purchase Order");
            return;
        }

        console.log("Linked MR Found:", mr_name);

        let mr = await frappe.db.get_doc("Material Request", mr_name);

        if (call_id !== frm.__mr_label_call_id) {
            return;
        }

        let owner = mr.owner || "-";

        // Parent MR schedule_date first.
        // Fallback to first child item schedule_date.
        let schedule_date =
            mr.schedule_date ||
            ((mr.items || []).find(row => row.schedule_date) || {}).schedule_date ||
            "";

        let display_date = schedule_date
            ? frappe.datetime.str_to_user(schedule_date)
            : "-";

        // let new_label =
        //     "Required By ( Requested By: " +
        //     owner +
        //     " | 📅 Date: " +
        //     display_date +
        //     " )";

        let new_label =
            "Required By ( " +
            owner +
            " Requested on " +
            display_date +
            ")";
        frm.set_df_property("schedule_date", "label", new_label);

        // Extra immediate UI refresh for label
        if (frm.fields_dict.schedule_date) {
            frm.fields_dict.schedule_date.set_label(new_label);
        }

    } catch (e) {
        console.error("Error updating Required By label from MR:", e);
        reset_required_by_label(frm);
    }
}


// =====================================================
// Find Material Request linked with PO
// Priority:
// 1. PO Item.material_request
// 2. PO Item.material_request_item → parent Material Request
// 3. PO Item.supplier_quotation → Supplier Quotation Item.material_request
// 4. SQ Item.material_request_item → parent Material Request
// =====================================================

async function get_linked_material_request_from_po(frm) {

    let items = frm.doc.items || [];

    if (!items.length) {
        return null;
    }

    // CASE 1: Direct MR → PO
    let row_with_mr = items.find(row => row.material_request);

    if (row_with_mr && row_with_mr.material_request) {
        return row_with_mr.material_request;
    }

    // CASE 2: PO row has MR Item but not MR parent
    let row_with_mr_item = items.find(row => row.material_request_item);

    if (row_with_mr_item && row_with_mr_item.material_request_item) {
        let mr_from_item = await get_parent_mr_from_mr_item(
            row_with_mr_item.material_request_item
        );

        if (mr_from_item) {
            return mr_from_item;
        }
    }

    // CASE 3: MR → SQ → PO
    let row_with_sq = items.find(row => row.supplier_quotation);

    if (row_with_sq && row_with_sq.supplier_quotation) {

        let sq = await frappe.db.get_doc(
            "Supplier Quotation",
            row_with_sq.supplier_quotation
        );

        let sq_items = sq.items || [];

        // Try exact Supplier Quotation Item first
        if (row_with_sq.supplier_quotation_item) {

            let exact_sq_item = sq_items.find(
                sq_row => sq_row.name === row_with_sq.supplier_quotation_item
            );

            if (exact_sq_item) {

                if (exact_sq_item.material_request) {
                    return exact_sq_item.material_request;
                }

                if (exact_sq_item.material_request_item) {
                    let mr_from_sq_item = await get_parent_mr_from_mr_item(
                        exact_sq_item.material_request_item
                    );

                    if (mr_from_sq_item) {
                        return mr_from_sq_item;
                    }
                }
            }
        }

        // Fallback: first SQ item with Material Request
        let sq_row_with_mr = sq_items.find(sq_row => sq_row.material_request);

        if (sq_row_with_mr && sq_row_with_mr.material_request) {
            return sq_row_with_mr.material_request;
        }

        // Fallback: first SQ item with Material Request Item
        let sq_row_with_mr_item = sq_items.find(
            sq_row => sq_row.material_request_item
        );

        if (sq_row_with_mr_item && sq_row_with_mr_item.material_request_item) {
            let mr_from_sq_mr_item = await get_parent_mr_from_mr_item(
                sq_row_with_mr_item.material_request_item
            );

            if (mr_from_sq_mr_item) {
                return mr_from_sq_mr_item;
            }
        }
    }

    return null;
}


// =====================================================
// Get parent Material Request from Material Request Item
// =====================================================

async function get_parent_mr_from_mr_item(material_request_item_name) {

    try {
        let r = await frappe.db.get_value(
            "Material Request Item",
            material_request_item_name,
            "parent"
        );

        if (r.message && r.message.parent) {
            return r.message.parent;
        }

    } catch (e) {
        console.warn(
            "Could not fetch parent MR from Material Request Item:",
            material_request_item_name,
            e
        );
    }

    return null;
}


// =====================================================
// Reset label if no MR found
// =====================================================

function reset_required_by_label(frm) {

    let default_label = "Required By";

    frm.set_df_property("schedule_date", "label", default_label);

    if (frm.fields_dict.schedule_date) {
        frm.fields_dict.schedule_date.set_label(default_label);
    }
}











// frappe.ui.form.on('Purchase Order', {

//     onload: function(frm) {

//         console.log("PO Loaded");

//         let prev = frappe.route_history.slice(-2)[0];

//         if (prev && prev[1] === "Material Request") {

//             let mr_name = prev[2];

//             set_data(frm, mr_name);
//         }
//     },

//     refresh: function(frm) {

//         if (frm.doc.items && frm.doc.items.length > 0) {

//             let mr_name = frm.doc.items[0].material_request;

//             if (mr_name) {
//                 set_data(frm, mr_name);
//             }
//         }
//     }
// });

// function set_data(frm, mr_name) {

//     frappe.db.get_doc("Material Request", mr_name)
//         .then(mr => {

//             console.log("MR Data:", mr);

//             // 🔥 IMPORTANT: correct field name
//             frm.set_value("custom_project_name", mr.custom_select_project_);

//             // 🔥 Remark bhi set karo
//             frm.set_value("custom_remark", mr.custom_remark);
//         });
// }