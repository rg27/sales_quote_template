// GLOBAL VARIABLE(S) :)
let currentRecordId, created_quote_id, account_id, prospect_id, contact_id, dbc, prospect_type, proc = null;

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

// get the last working or business day of the month huehueheu
function lastBusinessDayOfMonthFormatted(year, month) {
    var date = new Date();
    
    if (typeof year === 'undefined' || year === null) {
        year = date.getFullYear();
    }
    
    if (typeof month === 'undefined' || month === null) {
        month = date.getMonth();
    }

    // Get last day of the month
    var result = new Date(year, month + 1, 0);

    // Move back if weekend
    while (result.getDay() === 0 || result.getDay() === 6) {
        result.setDate(result.getDate() - 1);
    }

    // Format YYYY-MM-DD
    var yyyy = result.getFullYear();
    var mm = String(result.getMonth() + 1).padStart(2, '0'); // Month is 0-based
    var dd = String(result.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
}


function collectFormData() {
    formData = {
        jurisdiction: document.getElementById("crm-jurisdiction").value || "",
        licensePackage: document.getElementById("license-package").value || "",
    };
    return formData;
}


async function loadDropdownData() {
    while (templateSelect.options.length > 1) { templateSelect.remove(1); }
    templateSelect.disabled = true;

    try {
        const func_name = "filter_quote_records";
        const response = await ZOHO.CRM.FUNCTIONS.execute(func_name, formData);
        let raw = response.details.output;

        raw = "[" + raw.replace(/}\s*{/g, "},{") + "]";
        let quoteRespo = JSON.parse(raw);

        if (!Array.isArray(quoteRespo)) {
            quoteRespo = [quoteRespo];
        }

        // --- UPDATED SORTING LOGIC vcjbhdkbhlsldb
        const extractYearNumber = (name) => {
            const match = name.match(/(\d+) (Years?|Year)/i);
            return match ? parseInt(match[1], 10) : 0; 
        };

        const extractVisaSolutionNumber = (name) => {
            const match = name.match(/(\d+) Visa Solution/i);
            return match ? parseInt(match[1], 10) : 0; 
        };

        quoteRespo.sort((a, b) => {
            const nameA = a.Template_Name_Sales || "";
            const nameB = b.Template_Name_Sales || "";

            const yearA = extractYearNumber(nameA);
            const yearB = extractYearNumber(nameB);

            if (yearA !== yearB) {
                return yearA - yearB;
            }

            const visaA = extractVisaSolutionNumber(nameA);
            const visaB = extractVisaSolutionNumber(nameB);
            
            return visaA - visaB;
        });

        templateSelect.innerHTML = '<option value="" disabled selected>Select Quote Template</option>';
        quoteRespo.forEach(q => {
            const option = document.createElement("option");
            option.value = q.id;
            option.textContent = q.Template_Name_Sales;
            option.dataset.quoteNumber = q.Quote_Number;
            option.dataset.quoteStage = q.Quote_Stage;
            option.dataset.currency = q.Currency;
            option.dataset.grandTotal = q.Grand_Total;
            option.dataset.accountName = q.Account_Name?.id || "";
            option.dataset.dealName = q.Deal_Name?.id || "";
            option.dataset.templateName = q.Template_Name_Sales || "";
            option.dataset.subject = q.Subject || "";
            option.dataset.crmLicenseProduct = q.CRM_License_Product || "";
            option.dataset.crmLicenseDescription = q.CRM_License_Description || "";
            option.dataset.balance = q.Balance || "";
            option.dataset.crmJurisdiction = q.CRM_Jurisdiction || "";
            option.dataset.termnsAndConditions = q.Terms_and_Conditions || "";
            option.dataset.commissionAmount = q.Commission_Amount || "";
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

// GET ALL CURRENT PROSPECT'S RELATED QUOTES RECORD lxcvksofedhglsmb
async function fetchRelatedQuotes(currentRecordId) {
    try {
        const function_name = "related_prospect_and_quote_records";
        const req_data = {
            "arguments": JSON.stringify({
                "prospect_id": currentRecordId
            })
        };

        const response = await ZOHO.CRM.FUNCTIONS.execute(function_name, req_data);

        let raw = response.details.output;
        raw = "[" + raw.replace(/}\s*{/g, "},{") + "]";
        let parsed = JSON.parse(raw);

        if (!Array.isArray(parsed)) {
            console.error("Function output is not an array:", parsed);
            return [];
        }

        const relatedQuotes = parsed;
        const allIds = relatedQuotes.map(q => q.id);

        console.log("Linked Quote IDs:", allIds);
        return allIds;

    } catch (err) {
        console.error("Error fetching related quotes:", err);
        return [];
    }
}


document.getElementById("record-form").addEventListener("submit", createQuoteInZoho);

// CREATE QUOTE RECORDS
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

    if(prospect_type !== "New Trade License") {
        showModal(
            "Invalid Prospect Type", 
            "Please make sure that Prospect Type is 'New Trade License'.", 
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
        Product_Details: productDetails,
        Finance_Clearance: false,
        Process_Clearance: false,
        Processed_by_SE: false,
        Quote_Stage: "Draft",
        Account_Name: account_id,
        Deal_Name: prospect_id,
        CRM_License_Product: selectedOption.crmLicenseProduct,
        CRM_License_Description: selectedOption.crmLicenseDescription,
        Balance: selectedOption.balance,
        CRM_Jurisdiction: selectedOption.crmJurisdiction,
        Terms_and_Conditions: selectedOption.termnsAndConditions,
        Commission_Amount: selectedOption.commissionAmount,
        Valid_Till: lastBusinessDayOfMonthFormatted()
    };
    
    const dbcBool = dbc === true || dbc === "true";
    const procBool = proc === true || proc === "true";

    if (dbcBool || procBool) {
        const errorMsg = 'The quote cannot be created as the prospect is already cleared by Finance Dept';
        showModal('Submission Error', errorMsg, false);
        submitButton.disabled = false;
        buttonText.textContent = 'Create Quote';
        spinner.classList.add('hidden');
        console.log("Quote creation blocked → dbc or proc is TRUE");
        return;
    }

    const response = await ZOHO.CRM.API.insertRecord({
        Entity: "Quotes",
        APIData: selectedTemplateData
    });

    console.log("CREATE QUOTE: ", response);

    const result = response.data[0];
    if (result.code === "SUCCESS") {
        created_quote_id = result.details.id;

        // UPDATE DEAL IF ANY CLEARANCE IS FALSE //
        if ((dbc === false || dbc === "false") && (proc === false || proc === "false")) {
            const updated = await update_record();
            if (!updated) {
                submitButton.disabled = false;
                buttonText.textContent = 'Create Quote';
                spinner.classList.add('hidden');
                return;
            }
            showModal('Success', 'New Quote record successfully created based on the selected existing Quote.', true);
            console.log("Updating Deal → One or both clearance fields are FALSE");

            window.open(`https://crm.zoho.com/crm/org682300086/tab/Quotes/${created_quote_id}`, "_blank").focus();

        } else {
            const errorMsg = 'The quote cannot be created as the prospect is already cleared by Finance Dept';
            showModal('Submission Error', errorMsg, false);
            submitButton.disabled = false;
            buttonText.textContent = 'Create Quote';
            spinner.classList.add('hidden');
            console.log("Both clearance fields TRUE → NOT updating Deal");
        }

    }
}


// UPDATE PROSPECT RECORD
async function update_record() {
    try {
        const update_prospect_function = "sales_quote_template_update_prospect";
        const prospect_data = {
            "arguments": JSON.stringify({
                "currentRecordId": currentRecordId,
                "quote_assigned": created_quote_id
            })
        }

        const prospect_response = await ZOHO.CRM.FUNCTIONS.execute(update_prospect_function, prospect_data);
        const prospectResult = prospect_response;
        console.log(prospectResult);

        if (prospectResult.code !== "success") {
            console.error("Prospect update failed:", prospect_response);
            showModal(
                'Submission Error',
                'Failed to update the Prospect. Zoho returned an unexpected response.',
                false
            );
            return false;
        }


        // UPDATE QUOTES Quote_Linked_to_Prospect
        const allQuoteIds = await fetchRelatedQuotes(currentRecordId);
        console.log("Related Quote IDs:", allQuoteIds);

        for (const quoteId of allQuoteIds) {

            const isNewQuote = (quoteId === created_quote_id);

            const update_quote_function = "sales_quote_template_update_quote";
            const quote_data = {
                "arguments": JSON.stringify({
                    "id": quoteId,
                    "quote_linked_to_prospect": isNewQuote,
                    "contact_id": contact_id
                })
            }

            const quote_response = await ZOHO.CRM.FUNCTIONS.execute(update_quote_function, quote_data);
            const quote_result = quote_response;
            
            if (quote_result.code !== "success") {
                console.error(`Failed updating Quote ${quoteId}:`, quoteUpdate);
                showModal(
                    'Submission Error',
                    `Failed to update Quote ID ${quoteId}. Zoho returned an unexpected response.`,
                    false
                );
                return false;
            }
        }
        return true;

    } catch (error) {
        console.error("Error inside update_record():", error);
        showModal(
            'Submission Error',
            'Failed to update Prospect and related Quotes due to an internal error.',
            false
        );
        return false;
    }
}


document.addEventListener("DOMContentLoaded", () => {
    const crmSelect = document.getElementById("crm-jurisdiction");
    const licenseSelect = document.getElementById("license-package");

    const clearJurisdictionBtn = document.getElementById("clear-crm-jurisdiction");
    const clearLicenseBtn = document.getElementById("clear-license-package");

    const updateClearButtonVisibility = () => {
        // Hide if value is empty/null, show otherwise :))
        if (crmSelect.value) {
            clearJurisdictionBtn.classList.remove("hidden");
        } else {
            clearJurisdictionBtn.classList.add("hidden");
        }

        if (licenseSelect.value) {
            clearLicenseBtn.classList.remove("hidden");
        } else {
            clearLicenseBtn.classList.add("hidden");
        }
    };

    // CLEAR JURISDICTION
    clearJurisdictionBtn.addEventListener("click", () => {
        crmSelect.value = "";
        clearJurisdictionBtn.classList.add("hidden");
        const updatedFormData = collectFormData();
        loadDropdownData(updatedFormData);
    });

    // CLEAR LICENSE PACKAGE 
    clearLicenseBtn.addEventListener("click", () => {
        licenseSelect.value = "";
        clearLicenseBtn.classList.add("hidden");
        const updatedFormData = collectFormData();
        loadDropdownData(updatedFormData);
    });

    [crmSelect, licenseSelect].forEach(select => {
        select.addEventListener("change", () => {
            const updatedFormData = collectFormData();
            console.log("Updated formData:", updatedFormData);

            // SHOW OR HIDE ✕ BUTTONS
            if (select === crmSelect) {
                if (crmSelect.value) clearJurisdictionBtn.classList.remove("hidden");
                else clearJurisdictionBtn.classList.add("hidden");
            }
            if (select === licenseSelect) {
                if (licenseSelect.value) clearLicenseBtn.classList.remove("hidden");
                else clearLicenseBtn.classList.add("hidden");
            }

            updateClearButtonVisibility();

            loadDropdownData(updatedFormData);
        });
    });

    const modal = document.getElementById("notification-modal");
    const modalBox = modal.querySelector("div");
    const modalCloseBtn = document.getElementById("modal-close-btn");
    const modalTitle = document.getElementById('modal-title');

    modalCloseBtn.addEventListener("click", async () => {
        modalBox.classList.remove("scale-100");
        modalBox.classList.add("scale-95");
        modal.classList.add("opacity-0");

        const isSuccess = modalTitle.classList.contains('text-green-600'); 

        setTimeout(async () => {
            modal.classList.add("hidden");

            if (isSuccess) {
                await closeWidget();
            }
        }, 150);
    });


    ZOHO.embeddedApp.on("PageLoad", async (entity) => {
        try {
            ZOHO.CRM.UI.Resize({ height: "60%"}).then(function(data) {
                console.log("Resize result:", data);
            });

            formData = { jurisdiction: "", licensePackage: "" };
            loadDropdownData(formData);


            currentRecordId = entity.EntityId ? entity.EntityId[0] : null;
            currentModule = entity.Entity;

            await fetchRelatedQuotes(currentRecordId);

            const getProspect = await ZOHO.CRM.API.getRecord({
                Entity: "Deals",
                approved: "both",
                RecordID: currentRecordId,
            });
            const loadProspect = getProspect.data[0];

            account_id = loadProspect.Account_Name.id;
            contact_id = loadProspect.Contact_Name.id;
            prospect_id = currentRecordId;

            prospect_type = loadProspect.Type;

            console.log(prospect_type);

            dbc = loadProspect.Clearance_for_Dashboard_Commission;
            proc = loadProspect.Clearance_for_Processing;

            if (templateSelect.options.length > 1 && currentRecordId) {
                submitButton.disabled = false;
            }
        } catch (error) {
            console.error("Error during PageLoad:", error);
        }
    });
    
    updateClearButtonVisibility();

    ZOHO.embeddedApp.init();
});