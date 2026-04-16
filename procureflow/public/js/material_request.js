


// blank child table first row 

frappe.ui.form.on('Material Request', {
    onload: function (frm) {

        // 🔥 remove default blank row
        if (frm.doc.items && frm.doc.items.length === 1) {
            let row = frm.doc.items[0];

            if (!row.item_code) {
                frm.clear_table('items');
                frm.refresh_field('items');
            }
        }
    }
});

// ============================================================
// ==============================================================
// Set Warehouse According Projects

frappe.ui.form.on('Material Request', {
    custom_select_project_: function (frm) {

        frm.set_value('set_warehouse', '');

        if (frm.doc.custom_select_project_) {

            frappe.db.get_value(
                'Project Master',
                frm.doc.custom_select_project_,
                'store_name'
            ).then(r => {

                if (r.message && r.message.store_name) {
                    frm.set_value('set_warehouse', r.message.store_name);
                }

            });
        }
    }
});

// ========================================================================
// ========================================================================
// add popup

frappe.ui.form.on('Material Request', {
    refresh: function (frm) {

        if (frm.fields_dict.items && frm.fields_dict.items.grid) {

            let grid = frm.fields_dict.items.grid;

            // ❌ Hide ONLY label "Items"
            frm.fields_dict.items.$wrapper
                .find('.control-label')
                .hide();

            // ❌ Hide default Add Row
            grid.wrapper.find('.grid-add-row').hide();

            // 🔥 Avoid duplicate button
            if (!grid.custom_button_added) {

                let btn = $(`
                    <div style="margin-bottom:10px;">
                        <button class="btn btn-sm"
                            style="
                                background-color:#000;
                                color:#fff;
                                border-radius:4px;
                                padding:5px 12px;
                            ">
                            Add Item
                        </button>
                    </div>
                `);

                btn.find('button').on('click', function () {
                    open_item_popup(frm);
                });

                // 👇 Add above grid
                $(grid.wrapper).prepend(btn);

                grid.custom_button_added = true;
            }
        }
    }
});


function open_item_popup(frm) {

    let d = new frappe.ui.Dialog({
        title: 'Add Item',
        fields: [

            {
                label: 'Item',
                fieldname: 'item_code',
                fieldtype: 'Link',
                options: 'Item',
                reqd: 1,

                get_query: function () {
                    return {
                        filters: {
                            custom_category: frm.doc.custom_category
                        }
                    };
                },

                // 🔥 FIX: use onchange here
                onchange: function () {
                    let item = d.get_value('item_code');

                    if (item) {
                        frappe.db.get_value('Item', item, 'stock_uom')
                            .then(r => {
                                if (r.message && r.message.stock_uom) {
                                    d.set_value('uom', r.message.stock_uom);
                                }
                            });
                    }
                }
            },

            {
                label: 'Required Date',
                fieldname: 'schedule_date',
                fieldtype: 'Date',
                default: frm.doc.schedule_date,  // 🔥 parent se auto
                reqd: 1
            },

            {
                label: 'Quantity',
                fieldname: 'qty',
                fieldtype: 'Float',
                reqd: 1
            },

            {
                label: 'Specification',
                fieldname: 'custom_specification',
                fieldtype: 'Data'
            },



            {
                label: 'UOM',
                fieldname: 'uom',
                fieldtype: 'Link',
                options: 'UOM',
                read_only: 0
            }

        ],

        primary_action_label: 'Add',

        primary_action(values) {

            let child = frm.add_child('items');

            child.item_code = values.item_code;
            child.schedule_date = values.schedule_date;
            child.qty = values.qty;
            child.uom = values.uom;
            child.custom_specification = values.custom_specification;

            frm.refresh_field('items');

            d.hide();
        }
    });

    d.show();
}

// ====================================================================
// ====================================================================

// added field on supplier quotation for project and store

frappe.ui.form.on('Material Request', {
    refresh: function(frm) {

        console.log("MR JS Loaded");

        frm.page.inner_toolbar.find('button:contains("Supplier Quotation")').on('click', function() {

            console.log("SQ Button Clicked");

        });

    }
});



// remove add row button and reset child table if category change 

frappe.ui.form.on('Material Request', {

    refresh: function(frm) {

        console.log("Category Filter Applied");

        frm.set_query("item_code", "items", function(doc, cdt, cdn) {

            if (frm.doc.custom_category) {

                return {
                    query: "erpnext.controllers.queries.item_query",
                    filters: {
                        "custom_category": frm.doc.custom_category
                    }
                };

            } else {

                frappe.msgprint("⚠️ Please select Category first");
                return {
                    filters: {
                        "name": ""
                    }
                };
            }
        });
    },

    custom_category: function(frm) {

        console.log("Category Changed → Reset Items");

        frm.clear_table("items");
        frm.refresh_field("items");
    }
});



// hide add row button 


frappe.ui.form.on('Material Request', {
    refresh: function(frm) {

        setTimeout(() => {

            let grid = frm.get_field('items').grid;

            // Hide buttons
            $(grid.wrapper).find('.grid-add-row').hide();
            $(grid.wrapper).find('.grid-add-multiple-rows').hide();

            // Disable adding rows completely
            grid.cannot_add_rows = true;

        }, 500); // delay important hai
    }
});

// hide Request For Quoataion 

frappe.ui.form.on('Material Request', {
    refresh: function(frm) {

        // Remove Request for Quotation from Create menu
        frm.page.remove_inner_button('Request for Quotation', 'Create');
    }
});
