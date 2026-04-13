
// Get Details from supplier quotation 


// maping perent 

frappe.ui.form.on('Purchase Order', {

    onload: function(frm) {

        console.log("PO Loaded");

        let prev = frappe.route_history.slice(-2)[0];

        // 🔥 CASE 1: SQ → Create → PO
        if (prev && prev[1] === "Supplier Quotation") {

            let sq_name = prev[2];

            console.log("SQ Found:", sq_name);

            set_sq_data(frm, sq_name);
        }
    },

    refresh: function(frm) {

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
            frm.set_value("set_warehouse" , sq.custom_store_name)
        });
}


// . Child Specification Mapping


function map_specification(frm) {

    if (frm.doc.items && frm.doc.items.length > 0) {

        frm.doc.items.forEach(function(item) {

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

    frm.set_query("item_code", "items", function() {

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