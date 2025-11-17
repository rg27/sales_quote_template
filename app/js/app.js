// GLOBAL VARIABLE(S) :)
let currentRecordId, created_quote_id, account_id, prospect_id, contact_id = null;

const templateSelect = document.getElementById("template-select");
const loadingOverlay = document.getElementById("loadingOverlay");
const errorTemplate = document.getElementById("error-template-select");
const submitButton = document.getElementById("submit_button_id");
const spinner = document.getElementById("loading-spinner");
const buttonText = document.getElementById('button-text');

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

    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
        modal.querySelector('div').classList.add('scale-100');
    }, 10);
}

async function closeWidget() {
    await ZOHO.CRM.UI.Popup.closeReload().catch(err => console.error("Error closing widget:", err));
}

async function loadDropdownData() {
    while (templateSelect.options.length > 1) { templateSelect.remove(1); }
    templateSelect.disabled = true;

    try {
        const func_name = "filter_quote_records";
        const response = await ZOHO.CRM.FUNCTIONS.execute(func_name, {});
        let raw = response.details.output;

        raw = "[" + raw.replace(/}\s*{/g, "},{") + "]";

        let quoteRespo = JSON.parse(raw);

        if (!Array.isArray(quoteRespo)) {
            quoteRespo = [quoteRespo];
        }

        templateSelect.innerHTML = '<option value="" disabled selected>Select Quote Template</option>';
        quoteRespo.forEach(q => {
            const option = document.createElement("option");
            option.value = q.id;
            option.textContent = q.Subject;
            option.dataset.quoteNumber = q.Quote_Number;
            option.dataset.quoteStage = q.Quote_Stage;
            option.dataset.currency = q.Currency;
            option.dataset.grandTotal = q.Grand_Total;
            option.dataset.accountName = q.Account_Name?.id || "";
            option.dataset.dealName = q.Deal_Name?.id || "";
            option.dataset.templateName = q.Template_Name_Sales || "";
            option.dataset.validTill = q.Valid_Till || "";
            option.dataset.productDetails = JSON.stringify(q.Product_Details);
            templateSelect.appendChild(option);
        });

        templateSelect.disabled = false;
        submitButton.disabled = false;

        console.log("Subjects loaded:", quoteRespo.map(q => q.Subject));

    } catch (err) {
        console.error("Error loading dropdown data:", err);
        errorTemplate.textContent = "Failed to load quote templates.";
        templateSelect.options[0].textContent = 'Error Loading Quotes';
        templateSelect.options[0].value = ''; 
        templateSelect.disabled = true;
    }
}

document.getElementById("record-form").addEventListener("submit", createQuoteInZoho);

async function createQuoteInZoho(event) {
    event.preventDefault();

        const selectedValue = templateSelect.value;
    if (!selectedValue || selectedValue === "") {
        showModal(
            "Missing Required Field",
            "Please select a Quote Template from the dropdown list before clicking 'Create Quote'.",
            false
        );

        submitButton.disabled = false;
        buttonText.textContent = 'Create Quote';
        spinner.classList.add('hidden');

        return;
    }

    submitButton.disabled = true;
    buttonText.textContent = 'Creating...';
    spinner.classList.remove('hidden');

    const selectedOption = templateSelect.options[templateSelect.selectedIndex];
    const productDetails = JSON.parse(selectedOption.dataset.productDetails || "[]");

    const selectedTemplateData = {
        template_id: selectedOption.value,
        parent_record_id: currentRecordId,
        Subject: selectedOption.textContent,
        Quote_Number: selectedOption.dataset.quoteNumber,
        Currency: selectedOption.dataset.currency,
        Grand_Total: selectedOption.dataset.grandTotal,
        Template_Name_Sales: selectedOption.dataset.templateName,
        Valid_Till: selectedOption.dataset.validTill,
        Product_Details: productDetails,
        Finance_Clearance: false,
        Process_Clearance: false,
        Processed_by_SE: false,
        Quote_Stage: "Draft",
        Quote_Linked_to_Prospect: true,
        Account_Name: account_id,
        Deal_Name: prospect_id,
        Contact_Name: contact_id
    };
    

    const response = await ZOHO.CRM.API.insertRecord({
        Entity: "Quotes",
        APIData: selectedTemplateData
    });

    console.log("CREATE QUOTE: ", response);

    const result = response.data[0];
    if (result.code === "SUCCESS") {
        created_quote_id = result.details.id;

        const prospectResponse = await ZOHO.CRM.API.getRecord({
            Entity: "Deals",
            approved: "both",
            RecordID: currentRecordId,
        });
        const currentProspect = prospectResponse.data[0];

        const dbc = currentProspect.Clearance_for_Dashboard_Commission;
        const proc = currentProspect.Clearance_for_Processing;

        // UPDATE DEAL IF ANY CLEARANCE IS FALSE //
        if (dbc === false || dbc === "false" || proc === false || proc === "false") {
            const updated = await update_record();
            if (!updated) {
                submitButton.disabled = false;
                buttonText.textContent = 'Create Quote';
                spinner.classList.add('hidden');
                return;
            }
            showModal('Success', 'New Quote record successfully created based on the selected existing Quote.', true);
            console.log("Updating Deal → One or both clearance fields are FALSE");
            setTimeout(closeWidget, 2000);

            window.open(`https://crm.zoho.com/crm/org682300086/tab/Quotes/${created_quote_id}`, "_blank").focus();
        } else {
            const errorMsg = 'The quote cannot be created as the prospect is already cleared by Finance Dept';
            showModal('Submission Error', errorMsg, false);
            console.log("Both clearance fields TRUE → NOT updating Deal");
        }

    }
}

async function update_record() {
    const prospectData = {
        id: currentRecordId,
        Quote_Assigned: created_quote_id
    };

    try {
        const updateProspect = await ZOHO.CRM.API.updateRecord({
            Entity: "Deals",
            APIData: prospectData
        });

        const updateResult = updateProspect.data[0];
        if (updateResult.code !== "SUCCESS") {
            console.error("Zoho update did not return clear success:", updateProspect);
            showModal('Submission Error','Failed to update the Prospect. The Zoho update function returned an unexpected response.',false);
            return false;
        }

        return true;

    } catch (error) {
        console.error("Error updating Deal:", error);
        showModal('Submission Error','Failed to update the Prospect. Zoho returned an internal error.',false);
        return false;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    
    const modal = document.getElementById("notification-modal");
    const modalBox = modal.querySelector("div");
    const modalCloseBtn = document.getElementById("modal-close-btn");

    modalCloseBtn.addEventListener("click", () => {
        modalBox.classList.remove("scale-100");
        modalBox.classList.add("scale-95");
        modal.classList.add("opacity-0");

        setTimeout(() => {
            modal.classList.add("hidden");
        }, 150);
    });


    ZOHO.embeddedApp.on("PageLoad", async (entity) => {
        try {
            currentRecordId = entity.EntityId ? entity.EntityId[0] : null;
            currentModule = entity.Entity;


            const getProspect = await ZOHO.CRM.API.getRecord({
                Entity: "Deals",
                approved: "both",
                RecordID: currentRecordId,
            });
            const loadProspect = getProspect.data[0];

            account_id = loadProspect.Account_Name.id;
            contact_id = loadProspect.Contact_Name.id;
            prospect_id = currentRecordId;

            console.log("ACCOUNT_ID: " , account_id);
            console.log("CONTACT_ID: " , contact_id);
            console.log("PROSPECT_ID: " , prospect_id);

            await loadDropdownData();

            if (templateSelect.options.length > 1 && currentRecordId) {
                submitButton.disabled = false;
            }
        } catch (error) {
            console.error("Error during PageLoad:", error);
        }
    });

    ZOHO.embeddedApp.init();
});