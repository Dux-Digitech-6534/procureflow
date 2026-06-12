// =====================================================
// Item Custom Script
// Sub Category dropdown shows only sub categories of
// the selected Category; reset on Category change
// =====================================================

frappe.ui.form.on('Item', {

    setup: function (frm) {

        frm.set_query('custom_sub_category', function () {
            return {
                filters: {
                    material_category: frm.doc.custom_category || ''
                }
            };
        });
    },

    custom_category: function (frm) {

        // Category change par purani sub category hata do
        if (frm.doc.custom_sub_category) {
            frm.set_value('custom_sub_category', '');
        }
    }
});
