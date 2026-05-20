frappe.ui.form.on("Purchase Receipt", {
    onload: function (frm) {
        hide_purchase_receipt_buttons(frm);
    },

    refresh: function (frm) {
        hide_purchase_receipt_buttons(frm);

        // Buttons/dropdown late render hote hain, isliye repeat
        setTimeout(() => hide_purchase_receipt_buttons(frm), 500);
        setTimeout(() => hide_purchase_receipt_buttons(frm), 1000);
    }
});

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