const fetch = require('cross-fetch');
const Helpers = require('./Helpers');
const Authenticators = require('./Authenticators');
const Config = require('./Config');


class VirtuousProcessor {

    constructor(transactionList) {

        this.config = new Config();

        this.authenticators = Authenticators.getInstance();

        this.helpers = new Helpers();

        this.transactionList = transactionList;

        this.failures = [];
        this.giftAndContactResults = [];
        this.projectsAdded = [];

    };


    async processTransactions(){

        //Check we have transactions to process and send an email if we don't.
    if(this.transactionList.length === 0){
        console.log("No transactions found");
        //TODO: Send an email
        return;
    }


    //We need to filter the list down to just the payment transactions and process these. Then we need the full list that has the currency conversions in it too.
    let transactionsToProcess = this.helpers.filterTransactionsAndConvertAmounts(this.transactionList);

    let contactPromises = [];

    //Getting and creating (if needed) contacts is the thing that takes the longest time, so let's make that asynchronous
    for(let transaction of transactionsToProcess){

        const isShopify = transaction.transaction_info.custom_field === "Shopify";

        contactPromises.push(

            //Find the contact
            this.findContact(transaction, isShopify).then(contact => {

                //If the contact exists then add their Id. Otherwise, leave Virtuous to do the matching based upon other
                //criteria. Here we don't want to miss someone who has a different email address but the same name/address.
                if(contact?.id){
                    transaction.virtuousContactId = contact.id;
                }

            })

        );



    };

    //Let's wait until they all finish
    await Promise.all(contactPromises);

    let giftPromises = [];


    //Now let's loop through the transactions and process them. We'll also make this asynchronous too
    for(let transaction of transactionsToProcess){

        const isShopify = transaction.transaction_info.custom_field === "Shopify";

        //We'll see some Shopify purchases so handle them separately
        if(isShopify) {
            giftPromises.push(this.postContactNote(transaction));
        }
        else{
            giftPromises.push(this.processGift(transaction));
        }

    };

    //Again, let's wait until they're all finished. We need to do this to get the final results to return to the GiftProcessor
    await Promise.all(giftPromises);


    //We've finished, so let's create a results object and send it back.
    return {
        transactionsToProcess: transactionsToProcess,
        failures: this.failures,
        projects: this.projectsAdded,
        giftAndContactResults: this.giftAndContactResults
    }

    }





    async findContact(transaction, isShopify)
    {

    var contactRequestOptions = this.authenticators.getOptions('GET', 'Virtuous');

    //We need to check if the contact exists, if not, we need to create it.
    let contactResponse = await fetch(this.config.virtuousAPIURL + "/Contact/Find?email=" + transaction.payer_info.email_address + "&referenceSource=\"\"&referenceId=\"\"", contactRequestOptions)
    .catch(error => this.failures.push({transaction: transaction.transaction_info.transaction_id, error: "Error finding a contact: " + error.toString()}));

    let contact = {};

    //This is a timeout so let's try again.
    if(contactResponse === 1){

        contactResponse = await fetch(this.config.virtuousAPIURL + "/Contact/Find?email=" + transaction.payer_info.email_address + "&referenceSource=\"\"&referenceId=\"\"", contactRequestOptions)
            .catch(error => this.failures.push({transaction: transaction.transaction_info.transaction_id, error: "Error finding a contact (timeout retry): " + error.toString()}));
    }

    //If we didn't find a contact based upon an email search, we only want to create one if we're processing a Shopify transaction.
    //This is because we need to post a contact note, so the contact must exist. Otherwise, for non-Shopify donations, we don't
    //need a contact as Virtuous will find one for us.
    if(contactResponse?.status === 404 && isShopify){

        //The contact doesn't exist, so let's create one.
        contact = await this.createContact(transaction)
                        .catch(error => this.failures.push({transaction: transaction.transaction_info.transaction_id, error: "Error creating a contact for Shopify transaction: " + error.toString()}));
    }
    else if (contactResponse?.status !== 404){


        let contactObject = {};

        try{
            contactObject = await contactResponse.json();
        }
        catch(e){
            console.log(e);
        }

        //The contact does exist
        contact = contactObject;
    }

    return contact;


    }




    async createContact(transaction){

        let contactRequestOptions = this.authenticators.getOptions('POST', 'Virtuous');

        contactRequestOptions.body = this.helpers.extractContactFromTransaction(transaction);

        //We already know the contact doesn't exist, so let's create a new one.
        let newContactResponse = await fetch(this.config.virtuousAPIURL + "/Contact", contactRequestOptions)
                                        .catch(_ => this.failures.push({transaction: transaction.transaction_info.transaction_id, error: "Error creating a contact"}));

        return newContactResponse.status === 200 ? newContactResponse.json() : {error: "Error creating contact"};

    }


    async postContactNote(transaction){

    //We need to check to see if there are any tips.
    const tipItem = transaction.cart_info.item_details.find(item => item.item_name === "Tip");

    var tipText = "";

    //If there is a tip, we need to add it as a donation
    if(tipItem){

        transaction.transaction_info.transaction_subject = "Shopify Tip";

        tipText = " made a donation of $" + tipItem.item_amount.value + " and";

        // Reset the transaction amount because we're just adding the tip as a donation.
        transaction.transaction_info.transaction_amount.value = tipItem.item_amount.value;

        await this.processGift(transaction);

    }

    //If we have a tip, then take it out of the contact note and add it as a donation
    var productsPurchased = transaction.cart_info.item_details
                                            .filter(item => item.item_name !== "Tip")
                                            .map(item => item.item_name + " ($" + item.item_amount.value + ")");

    const purchasedItemCount = productsPurchased.length;

    productsPurchased = productsPurchased.join("\r\n");

    const itemPlural = (purchasedItemCount > 1 ? "s" : "")

    var note = {
        "contactId": transaction.virtuousContactId,
        "type": "General",
        "note": `${this.helpers.toTitleCase(transaction.payer_info.payer_name.alternate_full_name)}${tipText} purchased ${purchasedItemCount} item${itemPlural} from the shop:\r\n\r\n${productsPurchased}`,
        "noteDateTime": transaction.transaction_info.transaction_initiation_date,
        "important": false,
        "private": false,
        "timeSpent": 0
    }

    //We need to check if the contact exists, if not, we need to create it.
    let contactNoteRequestOptions = this.authenticators.getOptions('POST', 'Virtuous');

    contactNoteRequestOptions.body = JSON.stringify(note);

    let contactNoteResponse = await fetch(this.config.virtuousAPIURL + "/ContactNote", contactNoteRequestOptions)
                                        .catch(_ => this.failures.push({transaction: transaction.transaction_info.transaction_id, error: "Error creating a contact note"}));

    let resultValue = contactNoteResponse.status === 200 ? "Contact note added successfully" : "Failed to add contact note";

    this.giftAndContactResults.push({transactionId: transaction.transaction_info.transaction_id, result: resultValue});

    }




    async processGift(transaction){

    console.log(`Processing transactionId: ${transaction.transaction_info.transaction_id}`);

    let project = await this.getProject(transaction);

    project.amountDesignated = transaction.transaction_info.transaction_amount.value;

    transaction.designations = [project];

    transaction.transaction_info?.paypal_reference_id ?
        await this.checkRecurringGift(transaction)
        :
        await this.postGift(transaction);
    }



    async checkRecurringGift(transaction) {

        //Find the contact or add if they don't exist
        const recurringGifts = await this.existingRecurringGifts(transaction, false);

        let foundRecurringGift = recurringGifts.list.find(gift => gift.transactionId === transaction.transaction_info.paypal_reference_id);

        transaction.recurringGiftTransactionId = transaction.transaction_info.paypal_reference_id;

        await this.postGift(transaction, !foundRecurringGift);

    }




    async existingRecurringGifts(transaction, retry){

    let recurringGiftRequestOptions = this.authenticators.getOptions('GET', 'Virtuous');

    let recurringGiftResponse;

    try{

        recurringGiftResponse = await fetch(this.config.virtuousAPIURL + `/RecurringGift/ByContact/${transaction.virtuousContactId}?sortBy=RecurringGiftDate&descending=false&skip=0&take=50`,
        recurringGiftRequestOptions);

    }
    catch (e){
        if(e.code === "ETIMEOUT" && !retry){

            await this.existingRecurringGifts(transaction, true);

        }
        else{

            this.failures.push({transaction: transaction.transaction_info.transaction_id, error: "Error fetching recurring gifts, please check if this transaction matches to a recurring gift."});
        }
    }

    return recurringGiftResponse?.status === 200 ? recurringGiftResponse.json() : {list: []};

    }



    async postGift(transaction, createRecurringGift){

    let gift = this.helpers.extractGiftFromTransaction(transaction, createRecurringGift);

    var giftRequestOptions = this.authenticators.getOptions('POST', 'Virtuous');

    giftRequestOptions.body = gift;

    let postGiftResponse = await fetch(this.config.virtuousAPIURL + "/v2/Gift/Transaction", giftRequestOptions)
                                    .catch(_ => this.failures.push({transaction: transaction.transaction_info.transaction_id, error: "Error posting gift to Virtuous"}));

    let resultValue = postGiftResponse?.status === 200 ? "Gift added successfully" : "Failed to add gift";

    this.giftAndContactResults.push({transactionId: transaction.transaction_info.transaction_id, result: resultValue});

    }

     /**
       * This function returns the project that a transaction is assoiated with.
       * If the project does not exist, it creates a new project.
       *
       * @param  {} transaction
       */
      async getProject(transaction){

        const transaction_subject = transaction.transaction_info?.transaction_subject || "Default"

        //Here we can have a mix of projects coming in, we need to split them out. We know we only have Sponsorships and Memorialize
        //alongside general donations. For the non-default projects we need to find the project Id which requires a call to Virtuous, but for default gifts we can just
        //Fire the gift off.
        let projectText = transaction_subject.replace(" - Yearly","").replace(" - Monthly","");

        let projectName = "Default";


        if(projectText.includes("Sponsorship Monthly - ")){
          projectName = projectText.substr(22,projectText.length - 22);
        }
        else if(projectText.includes("Memorialize")){
          projectName = "Memorialize";
        }
        else if(projectText.includes("Shopify Tip")){ //Shopify refers to them as 'tips' but they are actually donations. We've changed the text on the Shopify site to reflect this.
          projectName = "shopifydonations"
        }

        if(projectName === "Default"){

            return  {
                  "id": 1,
                  "name": "Default Project",
                  "code": "Default"
              };
        }
        else{
          return await this.getProjectDetailsFromVirtuous(projectName, transaction);
        }

      }


      /**
       * This function takes a project name and a transaction and checks Virtuous for it. If it doesn't exist it creates it.
       * @param  {} projectName
       * @param  {} transaction
       */
      async getProjectDetailsFromVirtuous(projectName, transaction){

        var projectRequestOptions = this.authenticators.getOptions('GET', 'Virtuous');

        const url = this.config.virtuousAPIURL + "/Project/Code/" + projectName;

        //Let's see if the project exists in Virtuous
        let projectResponse = await fetch(url, projectRequestOptions)
                                .catch(_ => failures.push({transaction: transaction.transaction_info.transaction_id,
                                error: "Error finding project. Please check this transaction is added to the correct project"}) );

        let project = {};

        if (projectResponse?.status !== 200) {

            //TODO Send an email about this.
            const createdProject = await this.createProject(projectName, transaction);

            const addedProjectForEmail = createdProject?.id === 1 ? `Error adding project ${projectName} - reverting to default for transactionId: ${transaction.transaction_info.transaction_id}` :
            `Added project ${projectName} for transactionId: ${transaction.transaction_info.transaction_id}`;

            this.projectsAdded.push(addedProjectForEmail);

            project = createdProject;

        }
        else {

            project = projectResponse.json();


        }

        return {
            id: project?.id || "",
            name: project.name || "Default Project",
            code: project.projectCode || "Default",
        };



      }


      /**
       * This project creates a new project in Virtuous and then returns it to the calling function
       *
       * @param  {} projectName
       */
      async createProject(projectName){

        var projectRequestOptions = this.authenticators.getOptions('POST', 'Virtuous');

        projectRequestOptions.body = this.helpers.getProjectBody(projectName)

        const url = this.config.virtuousAPIURL + "/Project?disableWebhookUpdates=false";

        let projectResponse = await fetch(url, projectRequestOptions)
                                      .catch(error => failures.push({transaction: transaction.transaction_info.transaction_id, error: "Error creating a project: " + error.toString()}));

        let defaultProject = {
          "id": 1,
          "name": "Default Project",
          "code": "Default"
        }

        return projectResponse?.status === 200 ? projectResponse.json() : defaultProject;

      }

}

module.exports = VirtuousProcessor;