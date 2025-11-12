// --- DOM Elements ---
// We're renaming 'bpDropdown' to 'quoteTemplateDropdown' to reflect the field's purpose.
const form = document.getElementById("record-form");
const quoteTemplateDropdown = document.getElementById('business-partner'); // Still using the same ID for simplicity
const submitButton = document.getElementById('submit_button_id');
const buttonText = document.getElementById('button-text');
const loadingSpinner = document.getElementById('loading-spinner');

// --- Validation Configuration ---
const fieldsConfig = [
    // This configuration marks the field as required.
    { id: "business-partner", label: "Quote Templates", type: 'text', errorId: "error-business-partner" },
];

// --- Utility Functions ---

/**
 * Shows the custom notification modal.
 * @param {string} title - The modal title.
 * @param {string} message - The modal message.
 * @param {boolean} isSuccess - Determines styling (green for success, red for error).
 */
function showModal(title, message, isSuccess = false) {
    const modal = document.getElementById('notification-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');

    modalTitle.textContent = title;
    modalMessage.textContent = message;

    if (isSuccess) {
        modalTitle.classList.add('text-green-600');
        modalTitle.classList.remove('text-red-600');
    } else {
        modalTitle.classList.add('text-red-600');
        modalTitle.classList.remove('text-green-600');
    }

    modal.classList.remove('hidden', 'opacity-0');
    modal.classList.add('flex');
    // Trigger transition
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
    }, 10);
}

/** Hides the custom notification modal. */
function hideModal() {
    const modal = document.getElementById('notification-modal');
    modal.classList.add('opacity-0');
    modal.querySelector('div').classList.add('scale-95');
    setTimeout(() => {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }, 300); // Wait for transition
}

// Attach listener to modal close button
document.getElementById('modal-close-btn').addEventListener('click', hideModal);

/** Sets an error message and highlights the input field. */
const setError = (field, message) => {
    const errorElement = document.getElementById(`error-${field.id}`);
    if (errorElement) {
        errorElement.textContent = message;
    }
    if (message) {
        field.classList.add('border-red-500');
        field.classList.remove('border-gray-300');
    } else {
        field.classList.remove('border-red-500');
        field.classList.add('border-gray-300');
    }
};

/** Clears the form and resets error indicators. */
function clearForm() {
    form.reset();
    document.querySelectorAll(".error-message").forEach((el) => (el.textContent = ""));
    document.querySelectorAll(".border-red-500").forEach((el) => {
        el.classList.remove('border-red-500');
        el.classList.add('border-gray-300');
    });
}

// --- Close Widget ---
async function closeWidget() {
    // This function attempts to close the Zoho widget window.
    await ZOHO.CRM.UI.Popup.closeReload().catch(err => console.error("Error closing widget:", err));
}

/**
* Loads Quote Template data from Zoho CRM.
*/
async function loadDropdownData() {
    // Clear existing options
    while (quoteTemplateDropdown.options.length > 1) { quoteTemplateDropdown.remove(1); }

    // NOTE: Assuming "Quotes_Templates" is the module name in Zoho CRM. Adjust if needed.
    try {
        const templateResponse = await ZOHO.CRM.API.getAllRecords({ Entity: "Quotes_Templates", sort_order: "asc" });

        if (templateResponse.data && templateResponse.data.length > 0) {
            const activeTemplates = templateResponse.data.filter(template => template.Name); // Simple check for name existence
            activeTemplates.forEach(template => {
                const option = document.createElement('option');
                // Store the Record ID in the value
                option.value = template.id;
                option.textContent = template.Name;
                quoteTemplateDropdown.appendChild(option);
            });
            console.log(`Loaded ${activeTemplates.length} Quote Templates.`);
            // Update initial loading message
            quoteTemplateDropdown.options[0].textContent = 'Select a Quote Template';
            // CRITICAL: Ensure the placeholder value is explicitly empty string for validation
            quoteTemplateDropdown.options[0].value = ''; 
        } else {
            quoteTemplateDropdown.options[0].textContent = 'No Quote Templates Found';
            quoteTemplateDropdown.options[0].value = ''; // Ensure the value remains empty for validation
        }
    } catch (error) {
        console.error("Error fetching Quote Templates via Zoho API:", error);
        quoteTemplateDropdown.options[0].textContent = 'Error Loading Templates';
        quoteTemplateDropdown.options[0].value = ''; // Ensure the value remains empty for validation
    }
}

/**
 * Executes a function in Zoho CRM to create a Quote based on the selected template.
 */
async function createQuoteInZoho() {
    submitButton.disabled = true;
    buttonText.textContent = 'Creating...';
    loadingSpinner.classList.remove('hidden');

    console.log('Preparing to create Quote in Zoho CRM...');

    // NOTE: Assuming "ta_create_quote_from_template" is the new Zoho function name.
    const func_name = "ta_create_quote_from_template";
    
    // We only need to pass the selected template ID (which is currently stored in the 'business-partner' field)
    const req_data = {
        "arguments": JSON.stringify({
            "template_id": quoteTemplateDropdown.value, 
        })
    };

    try {
        const quote_res = await ZOHO.CRM.FUNCTIONS.execute(func_name, req_data);
        console.log("Quote Creation Function Response:", quote_res);

        // Assuming the function returns a simple user message indicating success
        const creation_status = quote_res.details.userMessage;

        if (creation_status && creation_status.includes('true')) {
            console.log('Quote record created successfully.');
            showModal('Success', 'Quote created successfully using the selected template.', true);
            clearForm();
            setTimeout(closeWidget, 2000); // Close widget after success
        } else {
            // Log the full response for debugging if it's not a clear 'true'
            console.error("Zoho function did not return success:", creation_status);
            const errorMsg = 'Failed to create Quote. The Zoho function reported an issue.';
            showModal('Submission Error', errorMsg, false);
        }

    } catch (error) {
        console.error("Critical error during Zoho submission:", error);
        showModal('API Error', 'A critical error occurred while communicating with Zoho CRM. Please check the console for details.', false);
    } finally {
        // Re-enable button if widget closing failed or on error
        if (submitButton.disabled) {
            submitButton.disabled = false;
            buttonText.textContent = 'Create Quote';
            loadingSpinner.classList.add('hidden');
        }
    }
}


// --- Initialization and Main Event Listener ---
document.addEventListener("DOMContentLoaded", function () {

    // 1. Form Submission Listener
    form.addEventListener("submit", function (event) {
        event.preventDefault();
        
        const config = fieldsConfig[0]; // Quote Templates field
        const selectedValue = quoteTemplateDropdown.value.trim();
        // The most robust check: if the selected index is the first option (0)
        const isPlaceholderSelected = quoteTemplateDropdown.selectedIndex === 0;

        // Reset error state for the field
        setError(quoteTemplateDropdown, "");
        quoteTemplateDropdown.classList.remove('border-red-500');
        quoteTemplateDropdown.classList.add('border-gray-300');


        // *** CRITICAL MANDATORY VALIDATION CHECK ***
        if (!selectedValue || isPlaceholderSelected) {
            
            // Set error message and style
            setError(quoteTemplateDropdown, `${config.label} selection is mandatory.`);

            // Display a clear, non-blocking modal notification
            showModal('Action Required', `Please select a **${config.label}** from the dropdown list before clicking 'Create Quote'.`, false);
            
            // Block form submission
            return;
        }

        // If validation passes, proceed to create the quote
        createQuoteInZoho();
    });

    // 2. Initialize the Zoho SDK and load data upon ready state
    ZOHO.embeddedApp.on("PageLoad", entity => {
    // This is the information about the current record, if applicable.
    let entity_id = entity.EntityId[0];
    console.log("Entity ID: " + entity_id);
    //Get Record
    ZOHO.CRM.API.getRecord({
    Entity: "Deals", approved: "both", RecordID:entity_id
    })
   .then(function(data){
        const quote_data = data.data
        console.log(quote_data)
        quote_data.map( (data)=> {
            const prospect_owner_name = data.Owner.name
            const prospect_owner_id = data.Owner.id
            const prospect_owner_email = data.email
            console.log("Prospect Owner Name: " + prospect_owner_name);
            console.log("Prospect Owner ID: " + prospect_owner_id);
            console.log("Prospect Owner Email: " + prospect_owner_email);
        });   
      });
});
    // Start the SDK initialization process
    ZOHO.embeddedApp.init();

});