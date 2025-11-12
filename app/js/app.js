// --- GLOBAL STATE ---
let currentRecordId = null;
let currentModule = null;

// --- DOM Element References ---
const submitButton = document.getElementById('submit_button_id');
const loadingSpinner = document.getElementById('loading-spinner');
const buttonText = document.getElementById('button-text');
const templateSelect = document.getElementById('template-select');
const form = document.getElementById('record-form');

// --- Validation Configuration ---
const fieldsConfig = [
    { id: "template-select", label: "Existing Quote", type: 'text', errorId: "error-template-select" },
];

// --- Utility Functions ---

/**
 * Displays a custom modal notification.
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
        modal.querySelector('div').classList.add('scale-100');
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
    const errorElementId = `error-${field.id}`; 
    const errorElement = document.getElementById(errorElementId);
    
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

/** Attempts to close the Zoho widget window and reload the parent CRM page. */
async function closeWidget() {
    // Uses the Zoho UI SDK method to close the widget and trigger a parent page reload
    await ZOHO.CRM.UI.Popup.closeReload().catch(err => console.error("Error closing widget:", err));
}

/**
* Loads all Quote data from Zoho CRM without client-side filtering.
*/
async function loadDropdownData() {
    // Clear existing options, keeping only the disabled placeholder
    while (templateSelect.options.length > 1) { templateSelect.remove(1); }
    templateSelect.disabled = true; // Disable while loading

    try {
        // Fetch all Quote records using the Zoho CRM API
        const quoteResponse = await ZOHO.CRM.API.getAllRecords({ 
            Entity: "Quotes", 
            sort_order: "desc", 
            perPage: 200 // Max records to fetch per API call
        });

        if (quoteResponse.data && quoteResponse.data.length > 0) {
            
            const allQuotes = quoteResponse.data;
            
            allQuotes.forEach(quote => {
                // Ensure the quote has a Subject before adding
                if (quote.Subject && quote.id) {
                    const option = document.createElement('option');
                    option.value = quote.id;
                    option.textContent = quote.Subject;
                    templateSelect.appendChild(option);
                }
            });
            
            console.log(`Loaded ${allQuotes.length} Quotes (No client-side filtering applied).`);
            
            templateSelect.options[0].textContent = 'Select an Existing Quote';
            templateSelect.options[0].value = ''; // CRITICAL: Ensure the placeholder value is empty
            templateSelect.disabled = false;
        } else {
            templateSelect.options[0].textContent = 'No Quote Records Found';
            templateSelect.options[0].value = ''; 
        }
    } catch (error) {
        console.error("Error fetching Quote Records via Zoho API:", error);
        templateSelect.options[0].textContent = 'Error Loading Quotes';
        templateSelect.options[0].value = ''; 
    }
}

/**
 * Executes a function in Zoho CRM to create a Quote based on the selected existing quote record.
 */
async function createQuoteInZoho() {
    submitButton.disabled = true;
    buttonText.textContent = 'Creating...';
    loadingSpinner.classList.remove('hidden');

    console.log('Preparing to clone Quote in Zoho CRM...');

    // The name of the Zoho Custom Function (must exist in Zoho CRM)
    const func_name = "ta_create_quote_from_template";
    
    // Pass the selected Quote ID and the ID of the parent record (e.g., Deal)
    const req_data = {
        "arguments": JSON.stringify({
            "template_id": templateSelect.value, 
            "parent_record_id": currentRecordId 
        })
    };

    try {
        const quote_res = await ZOHO.CRM.FUNCTIONS.execute(func_name, req_data);
        console.log("Quote Creation Function Response:", quote_res);

        const userMessage = quote_res?.details?.userMessage;

        // Check for successful execution and a 'true' message from the custom function
        if (quote_res.code === 'SUCCESS' && userMessage && userMessage.includes('true')) {
            console.log('New Quote record successfully initiated via Zoho Function.');
            showModal('Success', 'New Quote record successfully created based on the selected existing Quote.', true);
            clearForm();
            setTimeout(closeWidget, 2000); 
        } else {
            console.error("Zoho function did not return clear success:", quote_res);
            const errorMsg = 'Failed to create Quote. The Zoho function reported an issue or returned an unexpected response.';
            showModal('Submission Error', errorMsg, false);
        }

    } catch (error) {
        console.error("Critical error during Zoho submission:", error);
        showModal('API Error', 'A critical error occurred while communicating with Zoho CRM. Please check the console for details.', false);
    } finally {
        // Reset button state only if it was disabled by this function
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
        
        const config = fieldsConfig.find(c => c.id === 'template-select');
        const selectedValue = templateSelect.value.trim();
        const isPlaceholderSelected = templateSelect.selectedIndex === 0 || !selectedValue;

        setError(templateSelect, "");

        // Mandatory validation check
        if (isPlaceholderSelected) {
            setError(templateSelect, `${config.label} selection is mandatory.`);
            showModal('Action Required', `Please select an **${config.label}** from the dropdown list before clicking 'Create Quote'.`, false);
            return;
        }

        createQuoteInZoho();
    });

    // 2. Initialize the Zoho SDK and load data upon ready state
    ZOHO.embeddedApp.on("PageLoad", async (entity) => {
        try {
            // Get context information (Module and ID)
            currentRecordId = entity.EntityId ? entity.EntityId[0] : null;
            currentModule = entity.Entity; // e.g., 'Deals' or 'Quotes'
            
            console.log(`Widget loaded on module: ${currentModule}, Record ID: ${currentRecordId}`);

            // 1. Fetch data for the dropdown
            await loadDropdownData(); 

            // 2. Enable UI elements if data was loaded
            if (templateSelect.options.length > 1 && currentRecordId) {
                submitButton.disabled = false;
            }

            // 3. (Optional) Fetch the current Deal/Quote record details for context
            if (currentRecordId && currentModule === "Deals") {
                const recordResponse = await ZOHO.CRM.API.getRecord({
                    Entity: currentModule, approved: "both", RecordID: currentRecordId
                });

                if (recordResponse.data && recordResponse.data.length > 0) {
                    console.log("Parent Record Data fetched successfully.");
                }
            }
        } catch (error) {
            console.error("Initialization error:", error);
            showModal('Initialization Failed', 'Could not load required data from Zoho CRM. See console for details.', false);
            templateSelect.options[0].textContent = "Failed to load Quotes";
        }
    });

    // Start the SDK initialization process
    ZOHO.embeddedApp.init();
});