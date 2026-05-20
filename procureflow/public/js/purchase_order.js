
// // Get Details from supplier quotation 



// Get Details from supplier quotation 





// maping perent 

// frappe.ui.form.on('Purchase Order', {

//     onload: function (frm) {

//         console.log("PO Loaded");

//         // Existing SQ route logic
//         let prev = frappe.route_history.slice(-2)[0];

//         if (prev && prev[1] === "Supplier Quotation") {
//             let sq_name = prev[2];
//             console.log("SQ Found:", sq_name);
//             set_sq_data(frm, sq_name);
//         }

//         // MR → Create → PO mapping
//         setTimeout(() => {
//             set_mr_data(frm);
//         }, 800);
//     },

//     refresh: function (frm) {

//         console.log("PO Refresh");

//         // Existing SQ item logic
//         if (frm.doc.items && frm.doc.items.length > 0) {

//             let sq_name = frm.doc.items[0].supplier_quotation;

//             if (sq_name) {
//                 set_sq_data(frm, sq_name);
//             }
//         }

//         // MR → PO mapping
//         set_mr_data(frm);

//         apply_category_filter(frm);
//         map_specification(frm);
//     }
// });


// frappe.ui.form.on('Purchase Order', {

//     onload: function (frm) {

//         console.log("PO Loaded");

//         let prev = frappe.route_history.slice(-2)[0];

//         // 🔥 CASE 1: SQ → Create → PO
//         if (prev && prev[1] === "Supplier Quotation") {

//             let sq_name = prev[2];

//             console.log("SQ Found:", sq_name);

//             set_sq_data(frm, sq_name);
//         }
//     },

//     refresh: function (frm) {

//         console.log("PO Refresh");

//         // 🔥 CASE 2: Get Items From → SQ
//         if (frm.doc.items && frm.doc.items.length > 0) {

//             let sq_name = frm.doc.items[0].supplier_quotation;

//             console.log("SQ from Item:", sq_name);

//             if (sq_name) {
//                 set_sq_data(frm, sq_name);
//             }
//         }

//         // 🔥 Category Filter apply
//         apply_category_filter(frm);

//         // 🔥 Child specification mapping
//         map_specification(frm);
//     }
// });


// // Parent Data Function


// function set_sq_data(frm, sq_name) {

//     frappe.db.get_doc("Supplier Quotation", sq_name)
//         .then(sq => {

//             console.log("SQ Data:", sq);

//             // 🔥 Project
//             frm.set_value("custom_project_name", sq.custom_project_name);

//             // 🔥 Remark
//             frm.set_value("custom_remark", sq.custom_remark);

//             // 🔥 Category
//             frm.set_value("custom_category", sq.custom_category);

//             // WAREHOUSE
//             frm.set_value("set_warehouse", sq.custom_store_name)
//         });
// }


// function set_mr_data(frm) {

//     if (!frm.doc.items || frm.doc.items.length === 0) {
//         return;
//     }

//     // In Purchase Order Item, source Material Request is usually stored here
//     let mr_name = frm.doc.items[0].material_request;

//     if (!mr_name) {
//         console.log("No Material Request found in PO items");
//         return;
//     }

//     console.log("MR Found:", mr_name);

//     frappe.db.get_doc("Material Request", mr_name)
//         .then(mr => {

//             console.log("MR Data:", mr);

//             // Map:
//             // Material Request.custom_project_name
//             // OR fallback to Material Request.custom_select_project_
//             // → Purchase Order.custom_project_name

//             frm.set_value(
//                 "custom_project_name",
//                 mr.custom_project_name || mr.custom_select_project_ || ""
//             );

//             // Optional: map these also if needed
//             frm.set_value("custom_category", mr.custom_category || "");
//             frm.set_value("set_warehouse", mr.set_warehouse || "");

//             if (mr.schedule_date && !frm.doc.schedule_date) {
//                 frm.set_value("schedule_date", mr.schedule_date);
//             }
//         });
// }



// // . Child Specification Mapping


// function map_specification(frm) {

//     if (frm.doc.items && frm.doc.items.length > 0) {

//         frm.doc.items.forEach(function (item) {

//             if (item.supplier_quotation && item.supplier_quotation_item) {

//                 frappe.db.get_doc("Supplier Quotation", item.supplier_quotation)
//                     .then(sq => {

//                         if (sq && sq.items) {

//                             let sq_item = sq.items.find(i => i.name === item.supplier_quotation_item);

//                             if (sq_item) {

//                                 console.log("SQ Item Found:", sq_item);

//                                 frappe.model.set_value(
//                                     item.doctype,
//                                     item.name,
//                                     "custom_specification",
//                                     sq_item.custom_specification || ""
//                                 );
//                             }
//                         }
//                     });
//             }
//         });
//     }
// }


// // Category Filter (Same like SQ)


// function apply_category_filter(frm) {

//     frm.set_query("item_code", "items", function () {

//         if (frm.doc.custom_category) {

//             return {
//                 query: "erpnext.controllers.queries.item_query",
//                 filters: {
//                     "custom_category": frm.doc.custom_category
//                 }
//             };

//         } else {
//             return {};
//         }
//     });
// }


// // child table filter function 


// frappe.ui.form.on('Purchase Order', {

//     refresh: function (frm) {

//         console.log("SQ Category Filter Applied");

//         frm.set_query("item_code", "items", function (doc, cdt, cdn) {

//             if (frm.doc.custom_category) {

//                 return {
//                     query: "erpnext.controllers.queries.item_query",
//                     filters: {
//                         "custom_category": frm.doc.custom_category
//                     }
//                 };

//             } else {

//                 return {};
//             }
//         });
//     }
// });




// // add user name and date 
// // =====================================================
// // Purchase Order: Dynamic Required By Label
// // Shows:
// // Required By ( Requested By: {owner} | 📅 Date: {schedule_date} )
// //
// // Works for:
// // 1. Material Request → Purchase Order
// // 2. Material Request → Supplier Quotation → Purchase Order
// // =====================================================

// frappe.ui.form.on('Purchase Order', {

//     onload: function (frm) {
//         setTimeout(() => {
//             update_required_by_label_from_mr(frm);
//         }, 800);
//     },

//     refresh: function (frm) {
//         setTimeout(() => {
//             update_required_by_label_from_mr(frm);
//         }, 800);
//     },

//     validate: function (frm) {
//         update_required_by_label_from_mr(frm);
//     }
// });


// frappe.ui.form.on('Purchase Order Item', {

//     item_code: function (frm, cdt, cdn) {
//         setTimeout(() => {
//             update_required_by_label_from_mr(frm);
//         }, 300);
//     },

//     material_request: function (frm, cdt, cdn) {
//         setTimeout(() => {
//             update_required_by_label_from_mr(frm);
//         }, 300);
//     },

//     material_request_item: function (frm, cdt, cdn) {
//         setTimeout(() => {
//             update_required_by_label_from_mr(frm);
//         }, 300);
//     },

//     supplier_quotation: function (frm, cdt, cdn) {
//         setTimeout(() => {
//             update_required_by_label_from_mr(frm);
//         }, 300);
//     },

//     supplier_quotation_item: function (frm, cdt, cdn) {
//         setTimeout(() => {
//             update_required_by_label_from_mr(frm);
//         }, 300);
//     }
// });


// // =====================================================
// // Main Function
// // =====================================================

// async function update_required_by_label_from_mr(frm) {

//     try {
//         // Prevent old async calls from overwriting latest label
//         frm.__mr_label_call_id = (frm.__mr_label_call_id || 0) + 1;
//         let call_id = frm.__mr_label_call_id;

//         let mr_name = await get_linked_material_request_from_po(frm);

//         if (call_id !== frm.__mr_label_call_id) {
//             return;
//         }

//         if (!mr_name) {
//             reset_required_by_label(frm);
//             console.log("No linked Material Request found for this Purchase Order");
//             return;
//         }

//         console.log("Linked MR Found:", mr_name);

//         let mr = await frappe.db.get_doc("Material Request", mr_name);

//         if (call_id !== frm.__mr_label_call_id) {
//             return;
//         }

//         let owner = mr.owner || "-";

//         // Parent MR schedule_date first.
//         // Fallback to first child item schedule_date.
//         let schedule_date =
//             mr.schedule_date ||
//             ((mr.items || []).find(row => row.schedule_date) || {}).schedule_date ||
//             "";

//         let display_date = schedule_date
//             ? frappe.datetime.str_to_user(schedule_date)
//             : "-";

//         // let new_label =
//         //     "Required By ( Requested By: " +
//         //     owner +
//         //     " | 📅 Date: " +
//         //     display_date +
//         //     " )";

//         let new_label =
//             "Required By ( " +
//             owner +
//             " Requested on " +
//             display_date +
//             ")";
//         frm.set_df_property("schedule_date", "label", new_label);

//         // Extra immediate UI refresh for label
//         if (frm.fields_dict.schedule_date) {
//             frm.fields_dict.schedule_date.set_label(new_label);
//         }

//     } catch (e) {
//         console.error("Error updating Required By label from MR:", e);
//         reset_required_by_label(frm);
//     }
// }



// =====================================================
// Purchase Order Custom Script
// Handles:
// 1. Supplier Quotation → Purchase Order mapping
// 2. Material Request → Purchase Order mapping
// 3. Project Link field mapping
// 4. Category based Item filter
// 5. Child item specification mapping
// 6. Dynamic Required By label from Material Request
// =====================================================


frappe.ui.form.on("Purchase Order", {

    onload: function (frm) {
        console.log("PO Loaded");

        // CASE 1: Supplier Quotation → Create → Purchase Order
        let prev = frappe.route_history.slice(-2)[0];

        if (prev && prev[1] === "Supplier Quotation") {
            let sq_name = prev[2];
            console.log("SQ Found from route:", sq_name);
            set_sq_data(frm, sq_name);
        }

        // Material Request mapping after document loads
        setTimeout(() => {
            set_mr_data(frm);
            update_required_by_label_from_mr(frm);
        }, 800);
    },

    refresh: function (frm) {
        console.log("PO Refresh");

        // CASE 2: Get Items From → Supplier Quotation
        let sq_name = get_supplier_quotation_from_po(frm);

        if (sq_name) {
            console.log("SQ Found from PO Item:", sq_name);
            set_sq_data(frm, sq_name);
        }

        // Material Request → PO mapping
        set_mr_data(frm);

        // Apply item category filter
        apply_category_filter(frm);

        // Map child specification from SQ Item
        map_specification(frm);

        // Update Required By label
        setTimeout(() => {
            update_required_by_label_from_mr(frm);
        }, 800);
    },

    validate: function (frm) {
        update_required_by_label_from_mr(frm);
    },

    custom_category: function (frm) {
        apply_category_filter(frm);
    }
});


frappe.ui.form.on("Purchase Order Item", {

    item_code: function (frm, cdt, cdn) {
        setTimeout(() => {
            update_required_by_label_from_mr(frm);
        }, 300);
    },

    material_request: function (frm, cdt, cdn) {
        setTimeout(() => {
            set_mr_data(frm);
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
            let row = locals[cdt][cdn];

            if (row.supplier_quotation) {
                set_sq_data(frm, row.supplier_quotation);
            }

            update_required_by_label_from_mr(frm);
        }, 300);
    },

    supplier_quotation_item: function (frm, cdt, cdn) {
        setTimeout(() => {
            map_specification(frm);
            update_required_by_label_from_mr(frm);
        }, 300);
    } 

    
});


// =====================================================
// Supplier Quotation → Purchase Order Parent Mapping
// =====================================================

async function set_sq_data(frm, sq_name) {
    if (!sq_name) {
        return;
    }

    try {
        let sq = await frappe.db.get_doc("Supplier Quotation", sq_name);

        console.log("SQ Data:", sq);

        // Project Link field
        // IMPORTANT:
        // sq.custom_project_name must contain valid Project document name/id.
        if (sq.custom_project_name) {
            frm.set_value("custom_project_name", sq.custom_project_name);
        }

        // Remark
        if (sq.custom_remark) {
            frm.set_value("custom_remark", sq.custom_remark);
        }

        // Category
        if (sq.custom_category) {
            frm.set_value("custom_category", sq.custom_category);
        }

        // Warehouse
        if (sq.custom_store_name) {
            frm.set_value("set_warehouse", sq.custom_store_name);
        }

    } catch (e) {
        console.error("Error while fetching Supplier Quotation:", e);
    }
}


// =====================================================
// Material Request → Purchase Order Parent Mapping
// =====================================================

async function set_mr_data(frm) {
    if (!frm.doc.items || frm.doc.items.length === 0) {
        return;
    }

    try {
        let mr_name = await get_linked_material_request_from_po(frm);

        if (!mr_name) {
            console.log("No Material Request found in PO items");
            return;
        }

        console.log("MR Found:", mr_name);

        let mr = await frappe.db.get_doc("Material Request", mr_name);

        console.log("MR Data:", mr);

        let project_name =
            mr.custom_project_name ||
            mr.custom_select_project_ ||
            mr.project ||
            "";

        if (project_name) {
            await frm.set_value("custom_project_name", project_name);
            frm.refresh_field("custom_project_name");

            // IMPORTANT: Project set hone ke baad warehouse lao
            await set_store_from_project_master(frm);
        }

        if (mr.custom_category) {
            await frm.set_value("custom_category", mr.custom_category);
        }

        // Direct MR warehouse fallback
        let mr_warehouse =
            mr.set_warehouse ||
            mr.custom_set_warehouse ||
            mr.custom_store_name ||
            mr.custom_warehouse ||
            "";

        // Sirf tab set karo jab Project Master se warehouse nahi aaya
        if (!frm.doc.set_warehouse && mr_warehouse) {
            await frm.set_value("set_warehouse", mr_warehouse);
            frm.refresh_field("set_warehouse");
        }

        if (mr.schedule_date && !frm.doc.schedule_date) {
            await frm.set_value("schedule_date", mr.schedule_date);
        }

    } catch (e) {
        console.error("Error while fetching Material Request:", e);
    }
}

// =====================================================
// Get Supplier Quotation from Purchase Order Item
// =====================================================

function get_supplier_quotation_from_po(frm) {
    if (!frm.doc.items || frm.doc.items.length === 0) {
        return null;
    }

    let sq_row = frm.doc.items.find(row => row.supplier_quotation);

    if (sq_row) {
        return sq_row.supplier_quotation;
    }

    return null;
}


// =====================================================
// Get linked Material Request from Purchase Order
// Works for:
// 1. MR → PO
// 2. MR → SQ → PO
// =====================================================

async function get_linked_material_request_from_po(frm) {
    if (!frm.doc.items || frm.doc.items.length === 0) {
        return null;
    }

    // Direct MR → PO
    let direct_mr_row = frm.doc.items.find(row => row.material_request);

    if (direct_mr_row && direct_mr_row.material_request) {
        return direct_mr_row.material_request;
    }

    // MR → SQ → PO
    let sq_row = frm.doc.items.find(row => row.supplier_quotation);

    if (sq_row && sq_row.supplier_quotation) {
        try {
            let sq = await frappe.db.get_doc("Supplier Quotation", sq_row.supplier_quotation);

            if (sq.items && sq.items.length > 0) {
                let mr_row = sq.items.find(row => row.material_request);

                if (mr_row && mr_row.material_request) {
                    return mr_row.material_request;
                }
            }

        } catch (e) {
            console.error("Error while finding MR from SQ:", e);
        }
    }

    return null;
}


// =====================================================
// Child Specification Mapping
// Supplier Quotation Item.custom_specification
// → Purchase Order Item.custom_specification
// =====================================================

function map_specification(frm) {
    if (!frm.doc.items || frm.doc.items.length === 0) {
        return;
    }

    frm.doc.items.forEach(function (item) {
        if (!item.supplier_quotation || !item.supplier_quotation_item) {
            return;
        }

        frappe.db.get_doc("Supplier Quotation", item.supplier_quotation)
            .then(sq => {
                if (!sq || !sq.items) {
                    return;
                }

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
            })
            .catch(e => {
                console.error("Error while mapping specification:", e);
            });
    });
}


// =====================================================
// Category Filter for Purchase Order Item
// Filters Item by frm.doc.custom_category
// =====================================================

function apply_category_filter(frm) {
    frm.set_query("item_code", "items", function (doc, cdt, cdn) {
        if (frm.doc.custom_category) {
            return {
                query: "erpnext.controllers.queries.item_query",
                filters: {
                    custom_category: frm.doc.custom_category
                }
            };
        }

        return {};
    });

    console.log("PO Item Category Filter Applied");
}


// =====================================================
// Dynamic Required By Label
// Shows:
// Required By ( owner Requested on date )
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

        let new_label =
            "Required By ( " +
            owner +
            " Requested on " +
            display_date +
            " )";

        frm.set_df_property("schedule_date", "label", new_label);

        if (frm.fields_dict.schedule_date) {
            frm.fields_dict.schedule_date.set_label(new_label);
        }

    } catch (e) {
        console.error("Error updating Required By label from MR:", e);
        reset_required_by_label(frm);
    }
}


// =====================================================
// Reset Required By Label
// =====================================================

function reset_required_by_label(frm) {
    let default_label = "Required By";

    frm.set_df_property("schedule_date", "label", default_label);

    if (frm.fields_dict.schedule_date) {
        frm.fields_dict.schedule_date.set_label(default_label);
    }
}





// Project Master → set_warehouse
frappe.ui.form.on("Purchase Order", {
    custom_project_name: function (frm) {
        set_store_from_project_master(frm);
    }
});

async function set_store_from_project_master(frm) {
    if (!frm.doc.custom_project_name) {
        frm.set_value("set_warehouse", "");
        return;
    }

    try {
        let project = await frappe.db.get_doc("Project Master", frm.doc.custom_project_name);

        console.log("===== PROJECT MASTER DATA =====");
        console.log(project);

        let warehouse =
            project.set_warehouse ||
            project.custom_set_warehouse ||
            project.warehouse ||
            project.custom_warehouse ||
            project.store ||
            project.custom_store ||
            project.store_name ||
            project.custom_store_name ||
            project.default_warehouse ||
            project.custom_default_warehouse ||
            "";

        console.log("Warehouse Found:", warehouse);

        if (warehouse) {
            await frm.set_value("set_warehouse", warehouse);
            frm.refresh_field("set_warehouse");
        } else {
            frm.set_value("set_warehouse", "");
            frappe.msgprint("Project Master me warehouse field nahi mila. Console me PROJECT MASTER DATA check karo.");
        }

    } catch (e) {
        console.error("Project Master fetch error:", e);
        frappe.msgprint("Project Master fetch nahi hua. DocType name ya field value check karo.");
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









// =====================================================
// Category Change Validation
// 1. Category change hone par items table clear karega
// 2. Category ke bina item select nahi hoga
// 3. Item list selected category ke hisab se filter hogi
// =====================================================

function handle_category_change(frm) {
    apply_category_filter(frm);

    // Agar category system se set ho rahi hai, jaise MR/SQ mapping se,
    // tab items clear mat karo.
    if (frm.__setting_category_from_source) {
        return;
    }

    // Manual category change par child table reset
    if (frm.doc.items && frm.doc.items.length > 0) {
        frappe.confirm(
            "Category change karne par existing Items remove ho jayenge. Continue?",
            function () {
                clear_purchase_order_items(frm);
            },
            function () {
                // User cancel kare to category blank kar do
                frm.set_value("custom_category", "");
            }
        );
    }
}


function clear_purchase_order_items(frm) {
    frm.clear_table("items");
    frm.refresh_field("items");

    // Totals recalculate
    if (frm.trigger) {
        frm.trigger("calculate_taxes_and_totals");
    }

    frappe.show_alert({
        message: "Category change hone ki wajah se Items reset kar diye gaye.",
        indicator: "orange"
    });
}


// =====================================================
// Category based Item Filter
// Category ke bina item list empty rahegi
// =====================================================

function apply_category_filter(frm) {
    frm.set_query("item_code", "items", function (doc, cdt, cdn) {
        if (!frm.doc.custom_category) {
            return {
                filters: {
                    name: ["in", []]
                }
            };
        }

        return {
            query: "erpnext.controllers.queries.item_query",
            filters: {
                custom_category: frm.doc.custom_category
            }
        };
    });

    console.log("PO Item Category Filter Applied");
}





frappe.ui.form.on("Purchase Order", {
    custom_category: function (frm) {
        reset_items_on_category_change(frm);
    }
});

function reset_items_on_category_change(frm) {
    // Jab Material Request / Supplier Quotation / Get Items se items aaye ho,
    // to category auto set hone par table clear mat karo
    let has_source_items = (frm.doc.items || []).some(row =>
        row.material_request ||
        row.material_request_item ||
        row.supplier_quotation ||
        row.supplier_quotation_item
    );

    if (has_source_items) {
        console.log("Category changed from source document, items not cleared.");
        return;
    }

    // Sirf manual items hon aur category change ho tab reset karo
    if (frm.doc.items && frm.doc.items.length > 0) {
        frm.clear_table("items");
        frm.refresh_field("items");

        // frappe.show_alert({
        //     message: "",
        //     indicator: "orange"
        // });
    }
}




frappe.ui.form.on("Purchase Order", {
    onload: function (frm) {
        hide_purchase_order_buttons(frm);
    },

    refresh: function (frm) {
        hide_purchase_order_buttons(frm);

        // Frappe kabhi-kabhi buttons late render karta hai
        setTimeout(() => hide_purchase_order_buttons(frm), 500);
        setTimeout(() => hide_purchase_order_buttons(frm), 1000);
    }
});

function hide_purchase_order_buttons(frm) {
    setTimeout(() => {
        // Get Items From dropdown ke andar Product Bundle option hide
        $('.dropdown-menu a:contains("Product Bundle")').hide();
        $('.dropdown-menu button:contains("Product Bundle")').hide();
        $('.dropdown-item:contains("Product Bundle")').hide();

        // Child table Download / Upload buttons hide
        $('[data-fieldname="items"] .grid-download').hide();
        $('[data-fieldname="items"] .grid-upload').hide();

        // Fallback by button text inside items table
        $('[data-fieldname="items"] button:contains("Download")').hide();
        $('[data-fieldname="items"] button:contains("Upload")').hide();

        // Extra fallback for visible Download / Upload buttons
        $('button:contains("Download")').hide();
        $('button:contains("Upload")').hide();

    }, 300);
}




// =====================================================
// Item Validation
// Category ke bina item allow nahi karega
// Wrong category item select hua to clear karega
// =====================================================

// async function validate_item_category(frm, cdt, cdn) {
//     let row = locals[cdt][cdn];

//     if (!row.item_code) {
//         return;
//     }

//     if (!frm.doc.custom_category) {
//         frappe.msgprint("Pehle Category select karo, uske baad Item select karo.");

//         await frappe.model.set_value(cdt, cdn, "item_code", "");
//         await frappe.model.set_value(cdt, cdn, "item_name", "");
//         await frappe.model.set_value(cdt, cdn, "description", "");
//         await frappe.model.set_value(cdt, cdn, "uom", "");
//         await frappe.model.set_value(cdt, cdn, "qty", 0);

//         return;
//     }

//     try {
//         let r = await frappe.db.get_value("Item", row.item_code, "custom_category");

//         let item_category = r.message ? r.message.custom_category : "";

//         if (item_category && item_category !== frm.doc.custom_category) {
//             frappe.msgprint(
//                 "Selected Item ki category current Purchase Order category se match nahi karti."
//             );

//             await frappe.model.set_value(cdt, cdn, "item_code", "");
//             await frappe.model.set_value(cdt, cdn, "item_name", "");
//             await frappe.model.set_value(cdt, cdn, "description", "");
//             await frappe.model.set_value(cdt, cdn, "uom", "");
//             await frappe.model.set_value(cdt, cdn, "qty", 0);
//         }

//     } catch (e) {
//         console.error("Item category validation error:", e);
//     }
// }


// frappe.ui.form.on("Purchase Order", {
//     custom_category: function (frm) {
//         reset_items_on_category_change(frm);
//     }
// });

// function reset_items_on_category_change(frm) {
//     if (frm.doc.items && frm.doc.items.length > 0) {
//         frm.clear_table("items");
//         frm.refresh_field("items");

//         frappe.show_alert({
//             message: "Category change hone par item table reset ho gayi.",
//             indicator: "orange"
//         });
//     }
// }




























// old working code 



// // maping perent 

// frappe.ui.form.on('Purchase Order', {

//     onload: function (frm) {

//         console.log("PO Loaded");

//         // Existing SQ route logic
//         let prev = frappe.route_history.slice(-2)[0];

//         if (prev && prev[1] === "Supplier Quotation") {
//             let sq_name = prev[2];
//             console.log("SQ Found:", sq_name);
//             set_sq_data(frm, sq_name);
//         }

//         // MR → Create → PO mapping
//         setTimeout(() => {
//             set_mr_data(frm);
//         }, 800);
//     },

//     refresh: function (frm) {

//         console.log("PO Refresh");

//         // Existing SQ item logic
//         if (frm.doc.items && frm.doc.items.length > 0) {

//             let sq_name = frm.doc.items[0].supplier_quotation;

//             if (sq_name) {
//                 set_sq_data(frm, sq_name);
//             }
//         }

//         // MR → PO mapping
//         set_mr_data(frm);

//         apply_category_filter(frm);
//         map_specification(frm);
//     }
// });


// frappe.ui.form.on('Purchase Order', {

//     onload: function (frm) {

//         console.log("PO Loaded");

//         let prev = frappe.route_history.slice(-2)[0];

//         // 🔥 CASE 1: SQ → Create → PO
//         if (prev && prev[1] === "Supplier Quotation") {

//             let sq_name = prev[2];

//             console.log("SQ Found:", sq_name);

//             set_sq_data(frm, sq_name);
//         }
//     },

//     refresh: function (frm) {

//         console.log("PO Refresh");

//         // 🔥 CASE 2: Get Items From → SQ
//         if (frm.doc.items && frm.doc.items.length > 0) {

//             let sq_name = frm.doc.items[0].supplier_quotation;

//             console.log("SQ from Item:", sq_name);

//             if (sq_name) {
//                 set_sq_data(frm, sq_name);
//             }
//         }

//         // 🔥 Category Filter apply
//         apply_category_filter(frm);

//         // 🔥 Child specification mapping
//         map_specification(frm);
//     }
// });


// // Parent Data Function


// function set_sq_data(frm, sq_name) {

//     frappe.db.get_doc("Supplier Quotation", sq_name)
//         .then(sq => {

//             console.log("SQ Data:", sq);

//             // 🔥 Project
//             frm.set_value("custom_project_name", sq.custom_project_name);

//             // 🔥 Remark
//             frm.set_value("custom_remark", sq.custom_remark);

//             // 🔥 Category
//             frm.set_value("custom_category", sq.custom_category);

//             // WAREHOUSE
//             frm.set_value("set_warehouse", sq.custom_store_name)
//         });
// }


// function set_mr_data(frm) {

//     if (!frm.doc.items || frm.doc.items.length === 0) {
//         return;
//     }

//     // In Purchase Order Item, source Material Request is usually stored here
//     let mr_name = frm.doc.items[0].material_request;

//     if (!mr_name) {
//         console.log("No Material Request found in PO items");
//         return;
//     }

//     console.log("MR Found:", mr_name);

//     frappe.db.get_doc("Material Request", mr_name)
//         .then(mr => {

//             console.log("MR Data:", mr);

//             // Map:
//             // Material Request.custom_project_name
//             // OR fallback to Material Request.custom_select_project_
//             // → Purchase Order.custom_project_name

//             frm.set_value(
//                 "custom_project_name",
//                 mr.custom_project_name || mr.custom_select_project_ || ""
//             );

//             // Optional: map these also if needed
//             frm.set_value("custom_category", mr.custom_category || "");
//             frm.set_value("set_warehouse", mr.set_warehouse || "");

//             if (mr.schedule_date && !frm.doc.schedule_date) {
//                 frm.set_value("schedule_date", mr.schedule_date);
//             }
//         });
// }



// // . Child Specification Mapping


// function map_specification(frm) {

//     if (frm.doc.items && frm.doc.items.length > 0) {

//         frm.doc.items.forEach(function (item) {

//             if (item.supplier_quotation && item.supplier_quotation_item) {

//                 frappe.db.get_doc("Supplier Quotation", item.supplier_quotation)
//                     .then(sq => {

//                         if (sq && sq.items) {

//                             let sq_item = sq.items.find(i => i.name === item.supplier_quotation_item);

//                             if (sq_item) {

//                                 console.log("SQ Item Found:", sq_item);

//                                 frappe.model.set_value(
//                                     item.doctype,
//                                     item.name,
//                                     "custom_specification",
//                                     sq_item.custom_specification || ""
//                                 );
//                             }
//                         }
//                     });
//             }
//         });
//     }
// }


// // Category Filter (Same like SQ)


// function apply_category_filter(frm) {

//     frm.set_query("item_code", "items", function () {

//         if (frm.doc.custom_category) {

//             return {
//                 query: "erpnext.controllers.queries.item_query",
//                 filters: {
//                     "custom_category": frm.doc.custom_category
//                 }
//             };

//         } else {
//             return {};
//         }
//     });
// }


// // child table filter function 


// frappe.ui.form.on('Purchase Order', {

//     refresh: function (frm) {

//         console.log("SQ Category Filter Applied");

//         frm.set_query("item_code", "items", function (doc, cdt, cdn) {

//             if (frm.doc.custom_category) {

//                 return {
//                     query: "erpnext.controllers.queries.item_query",
//                     filters: {
//                         "custom_category": frm.doc.custom_category
//                     }
//                 };

//             } else {

//                 return {};
//             }
//         });
//     }
// });








// // add user name and date 
// // =====================================================
// // Purchase Order: Dynamic Required By Label
// // Shows:
// // Required By ( Requested By: {owner} | 📅 Date: {schedule_date} )
// //
// // Works for:
// // 1. Material Request → Purchase Order
// // 2. Material Request → Supplier Quotation → Purchase Order
// // =====================================================

// frappe.ui.form.on('Purchase Order', {

//     onload: function (frm) {
//         setTimeout(() => {
//             update_required_by_label_from_mr(frm);
//         }, 800);
//     },

//     refresh: function (frm) {
//         setTimeout(() => {
//             update_required_by_label_from_mr(frm);
//         }, 800);
//     },

//     validate: function (frm) {
//         update_required_by_label_from_mr(frm);
//     }
// });


// frappe.ui.form.on('Purchase Order Item', {

//     item_code: function (frm, cdt, cdn) {
//         setTimeout(() => {
//             update_required_by_label_from_mr(frm);
//         }, 300);
//     },

//     material_request: function (frm, cdt, cdn) {
//         setTimeout(() => {
//             update_required_by_label_from_mr(frm);
//         }, 300);
//     },

//     material_request_item: function (frm, cdt, cdn) {
//         setTimeout(() => {
//             update_required_by_label_from_mr(frm);
//         }, 300);
//     },

//     supplier_quotation: function (frm, cdt, cdn) {
//         setTimeout(() => {
//             update_required_by_label_from_mr(frm);
//         }, 300);
//     },

//     supplier_quotation_item: function (frm, cdt, cdn) {
//         setTimeout(() => {
//             update_required_by_label_from_mr(frm);
//         }, 300);
//     }
// });


// // =====================================================
// // Main Function
// // =====================================================

// async function update_required_by_label_from_mr(frm) {

//     try {
//         // Prevent old async calls from overwriting latest label
//         frm.__mr_label_call_id = (frm.__mr_label_call_id || 0) + 1;
//         let call_id = frm.__mr_label_call_id;

//         let mr_name = await get_linked_material_request_from_po(frm);

//         if (call_id !== frm.__mr_label_call_id) {
//             return;
//         }

//         if (!mr_name) {
//             reset_required_by_label(frm);
//             console.log("No linked Material Request found for this Purchase Order");
//             return;
//         }

//         console.log("Linked MR Found:", mr_name);

//         let mr = await frappe.db.get_doc("Material Request", mr_name);

//         if (call_id !== frm.__mr_label_call_id) {
//             return;
//         }

//         let owner = mr.owner || "-";

//         // Parent MR schedule_date first.
//         // Fallback to first child item schedule_date.
//         let schedule_date =
//             mr.schedule_date ||
//             ((mr.items || []).find(row => row.schedule_date) || {}).schedule_date ||
//             "";

//         let display_date = schedule_date
//             ? frappe.datetime.str_to_user(schedule_date)
//             : "-";

//         // let new_label =
//         //     "Required By ( Requested By: " +
//         //     owner +
//         //     " | 📅 Date: " +
//         //     display_date +
//         //     " )";

//         let new_label =
//             "Required By ( " +
//             owner +
//             " Requested on " +
//             display_date +
//             ")";
//         frm.set_df_property("schedule_date", "label", new_label);

//         // Extra immediate UI refresh for label
//         if (frm.fields_dict.schedule_date) {
//             frm.fields_dict.schedule_date.set_label(new_label);
//         }

//     } catch (e) {
//         console.error("Error updating Required By label from MR:", e);
//         reset_required_by_label(frm);
//     }
// }


// // =====================================================
// // Find Material Request linked with PO
// // Priority:
// // 1. PO Item.material_request
// // 2. PO Item.material_request_item → parent Material Request
// // 3. PO Item.supplier_quotation → Supplier Quotation Item.material_request
// // 4. SQ Item.material_request_item → parent Material Request
// // =====================================================

// async function get_linked_material_request_from_po(frm) {

//     let items = frm.doc.items || [];

//     if (!items.length) {
//         return null;
//     }

//     // CASE 1: Direct MR → PO
//     let row_with_mr = items.find(row => row.material_request);

//     if (row_with_mr && row_with_mr.material_request) {
//         return row_with_mr.material_request;
//     }

//     // CASE 2: PO row has MR Item but not MR parent
//     let row_with_mr_item = items.find(row => row.material_request_item);

//     if (row_with_mr_item && row_with_mr_item.material_request_item) {
//         let mr_from_item = await get_parent_mr_from_mr_item(
//             row_with_mr_item.material_request_item
//         );

//         if (mr_from_item) {
//             return mr_from_item;
//         }
//     }

//     // CASE 3: MR → SQ → PO
//     let row_with_sq = items.find(row => row.supplier_quotation);

//     if (row_with_sq && row_with_sq.supplier_quotation) {

//         let sq = await frappe.db.get_doc(
//             "Supplier Quotation",
//             row_with_sq.supplier_quotation
//         );

//         let sq_items = sq.items || [];

//         // Try exact Supplier Quotation Item first
//         if (row_with_sq.supplier_quotation_item) {

//             let exact_sq_item = sq_items.find(
//                 sq_row => sq_row.name === row_with_sq.supplier_quotation_item
//             );

//             if (exact_sq_item) {

//                 if (exact_sq_item.material_request) {
//                     return exact_sq_item.material_request;
//                 }

//                 if (exact_sq_item.material_request_item) {
//                     let mr_from_sq_item = await get_parent_mr_from_mr_item(
//                         exact_sq_item.material_request_item
//                     );

//                     if (mr_from_sq_item) {
//                         return mr_from_sq_item;
//                     }
//                 }
//             }
//         }

//         // Fallback: first SQ item with Material Request
//         let sq_row_with_mr = sq_items.find(sq_row => sq_row.material_request);

//         if (sq_row_with_mr && sq_row_with_mr.material_request) {
//             return sq_row_with_mr.material_request;
//         }

//         // Fallback: first SQ item with Material Request Item
//         let sq_row_with_mr_item = sq_items.find(
//             sq_row => sq_row.material_request_item
//         );

//         if (sq_row_with_mr_item && sq_row_with_mr_item.material_request_item) {
//             let mr_from_sq_mr_item = await get_parent_mr_from_mr_item(
//                 sq_row_with_mr_item.material_request_item
//             );

//             if (mr_from_sq_mr_item) {
//                 return mr_from_sq_mr_item;
//             }
//         }
//     }

//     return null;
// }


// // =====================================================
// // Get parent Material Request from Material Request Item
// // =====================================================

// async function get_parent_mr_from_mr_item(material_request_item_name) {

//     try {
//         let r = await frappe.db.get_value(
//             "Material Request Item",
//             material_request_item_name,
//             "parent"
//         );

//         if (r.message && r.message.parent) {
//             return r.message.parent;
//         }

//     } catch (e) {
//         console.warn(
//             "Could not fetch parent MR from Material Request Item:",
//             material_request_item_name,
//             e
//         );
//     }

//     return null;
// }


// // =====================================================
// // Reset label if no MR found
// // =====================================================

// function reset_required_by_label(frm) {

//     let default_label = "Required By";

//     frm.set_df_property("schedule_date", "label", default_label);

//     if (frm.fields_dict.schedule_date) {
//         frm.fields_dict.schedule_date.set_label(default_label);
//     }
// }




