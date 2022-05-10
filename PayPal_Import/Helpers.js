const Authenticators = require('./Authenticators');

class Helpers {

    constructor() {

      this.authenticators = Authenticators.getInstance();

              //Let's get rid of any event codes that we don't need
        //See here for reference: https://developer.paypal.com/docs/transaction-search/transaction-event-codes/
        this.includedEventCodes = [
          {eventCode: "T0000", description: "General"},
          {eventCode: "T0001", description: "MassPay payment"},
          {eventCode: "T0002", description: "Subscription payment"},
          {eventCode: "T0003", description: "Pre-approved payment (BillUser API)"},
          {eventCode: "T0004", description: "eBay auction payment"},
          {eventCode: "T0005", description: "Direct payment API"},
          {eventCode: "T0006", description: "PayPal Checkout APIs"},
          {eventCode: "T0007", description: "Website payments standard payment"},
          {eventCode: "T0008", description: "Postage payment to carrier"},
          {eventCode: "T0009", description: "Gift certificate payment"},
          {eventCode: "T0010", description: "Third-party auction payment"},
          {eventCode: "T0011", description: "Mobile payment"},
          {eventCode: "T0012", description: "Virtual terminal payment"},
          {eventCode: "T0013", description: "Donation payment"},
          {eventCode: "T0014", description: "Rebate payments"},
          {eventCode: "T0015", description: "Third-party payout"},
          {eventCode: "T0016", description: "Third-party recoupment"},
          {eventCode: "T0017", description: "Store-to-store transfers"},
          {eventCode: "T0018", description: "PayPal Here payment"},
          {eventCode: "T0019", description: "Generic instrument-funded payment"}, //T00nn PayPal account-to-PayPal account payment
          {eventCode: "T0200", description: "General currency conversion"}, //T02nn Currency conversion
          {eventCode: "T1102", description: "Reversal of debit card transaction."}, //T11nn Reversals
          {eventCode: "T1104", description: "Reversal of ACH deposit."},
          {eventCode: "T1106", description: "Payment reversal, initiated by PayPal."},
          {eventCode: "T1107", description: "Payment refund, initiated by merchant."},
          {eventCode: "T1115", description: "MassPay refund transaction."},
      ];

    }

    getincludedEventCodes(){

      return this.includedEventCodes;

    }


    /**
     * This function converts local currency to USD. The transaction contains the amount in local currency as well as another object
     * that has the amount converted to our PayPal account's base currency, currently this is USD
     *
     * @param  {} transaction
     * @return {}
     */
    convertGiftAmount(transactionList, transaction){

        //Let's find the matching currency conversion transaction and get the converted amount
        const foundTransaction = transactionList.find(searchTransaction =>

          searchTransaction.transaction_info.paypal_reference_id === transaction.transaction_info.transaction_id
          &&
          searchTransaction.transaction_info.transaction_amount.currency_code === "USD"
          &&
          searchTransaction.transaction_info.paypal_reference_id_type === "TXN"
          &&
          searchTransaction.transaction_info.transaction_event_code === "T0200"
          );

          //If we can't find a matching transaction it's because no conversion is needed
          transaction.transaction_info.transaction_amount.value = foundTransaction?.transaction_info?.transaction_amount?.value || transaction.transaction_info.transaction_amount.value;

          return transaction;

      }



      /**
       * This function takes a string and converts it to title case. So billy bob becomes Billy Bob.
       * @param  {} str
       */
      toTitleCase(str) {

        if(!str){
          return "";
        }

        return str.replace(/\p{L}+('\p{L}+)?/gu, function(txt) {
          return txt.charAt(0).toUpperCase() + txt.slice(1)
        })
      }


      /**
       * This function takes a project name and returns the body required by the Virtuous create project API
       *
       * @param  {} projectName
       */
      getProjectBody(projectName){

        let projectBody = {
          name: projectName,
          revenueAccountingCode: projectName,
          inventoryStatus: "Unspecified",
          type: "Default",
          onlineDisplayName: "projectName",
          description: "Project auto created by PayPal import",
          durationType: "Ongoing",
          financialNeedAmount: 0.00,
          financialNeedType: 2,
          financialNeedFrequency: "Annually",
          location: "US",
          isPublic: true,
          isActive: true,
          isAvailableOnline: true,
          isLimitedToFinancialNeed: false,
          isTaxDeductible: true,
          treatAsAccountsPayable: false,
          isRestrictedToGiftSpecifications: false,
          enableSync: false
        }

        return JSON.stringify(projectBody);

      }



      /**
       * This function takes a transaction and returns the body required by the Virtuous create transaction API.
       * Some elements are only needed if we need to create a new recurring gift
       *
       *
       * @param  {} transaction
       * @param  {} createRecurringGift boolean
       */
      extractGiftFromTransaction(transaction, createRecurringGift){

        const gift = {
            "transactionSource": "PayPal",
            "transactionId": transaction.transaction_info.transaction_id,
            "contact": {
              "referenceId": transaction.transaction_info.paypal_account_id,
              "id": transaction.virtuousContactId,
              "name": this.toTitleCase(transaction.payer_info.payer_name.alternate_full_name),
              "type": "Household",
              "firstname": this.toTitleCase(transaction.payer_info.payer_name.given_name),
              "lastname": this.toTitleCase(transaction.payer_info.payer_name.surname),
              "emailType": "Home Email",
              "email": transaction.payer_info.email_address,
              "phoneType": "Home Phone",
              "phone": "",
              "address": {
                "address1": transaction.shipping_info.address?.line1 || "",
                "address2": transaction.shipping_info.address?.line2 || "",
                "city": transaction.shipping_info.address?.city || "",
                "state": transaction.shipping_info.address?.state || "",
                "postal": transaction.shipping_info.address?.postal_code || "",
                "country": transaction.shipping_info.address?.country_code || ""
              },
              "tags": "PayPal",
              "emailLists": []
            },
            "giftDate": transaction.transaction_info.transaction_initiation_date,
            "giftType": "EFT",
            "amount": transaction.transaction_info.transaction_amount.value,
            "frequency" : createRecurringGift ? "Monthly" : "",
            "recurringGiftTransactionId" : transaction.recurringGiftTransactionId ? transaction.recurringGiftTransactionId : "",
            "notes": transaction.transaction_info?.transaction_note || "",
            "designations": transaction.designations,
            "customFields": {
              "ReferenceTransactionId": transaction.transaction_info?.paypal_reference_id || "",
            }
          }

          return JSON.stringify(gift);


      }



      /**
       * This function extracts the contact details from a transaction and returns a new contact object
       * @param  {} transaction
       */
      extractContactFromTransaction(transaction){

        let contact = {
              "contactType": "Household",
              "referenceSource": "Shopify",
              "name": this.toTitleCase(transaction.payer_info.payer_name.alternate_full_name),
              "isPrivate": false,
              "isArchived": false,
              "contactAddresses": [
                  {
                      "address1": transaction.shipping_info.address?.line1 || "",
                      "address2": transaction.shipping_info.address?.line2 || "",
                      "city": transaction.shipping_info.address?.city || "",
                      "postal": transaction.shipping_info.address?.postal_code || "",
                      "countryCode": transaction.shipping_info.address?.country_code || "",
                      "isPrimary": true
                  }
              ],
              "contactIndividuals": [
                  {
                      "firstName": this.toTitleCase(transaction.payer_info.payer_name.given_name) || this.toTitleCase(transaction.payer_info.payer_name.alternate_full_name),
                      "lastName": this.toTitleCase(transaction.payer_info.payer_name.surname) || "Unknown",
                      "isPrimary": true,
                      "isSecondary": false,
                      "isDeceased": false,
                      "contactMethods": [
                          {
                              "type": "Home Email",
                              "value": transaction.payer_info.email_address,
                              "isOptedIn": false,
                              "isPrimary": true
                          }
                      ]
                  }
              ]
          };

          return JSON.stringify(contact);

      }


      /**
       * This function takes and array of transactions and filters out the ones we don't need. For instance, we don't want to include payments that
       * have come out of the PayPal account.
       * This function also converts the local currency amounts to USD.
       *
       * @param  {} transactionList array of transactions
       */
      filterTransactionsAndConvertAmounts(transactionList) {

        return transactionList.filter(transaction => this.includedEventCodes
                                                            .map(event => event.eventCode)
                                                            .includes(transaction.transaction_info.transaction_event_code))
                              .filter(transaction => transaction.transaction_info.transaction_event_code !== "T0200")
                              .map(transaction =>  this.convertGiftAmount(transactionList, transaction));

      }

      /**
       * This function takes and array of transaction resuls and generates a string for use as an attachment in the result email.
       *
       * @param  {} attachmentContent array of transaction results containing the transaction Id and whether it was successfully pushed to Virtuous or not
       */
      convertTransactionResultsToCSV(attachmentContent){

        let attachmentCSV = "transactionId,result\n";

        attachmentContent.forEach(transaction => {

          attachmentCSV += `${transaction.transactionId},${transaction.result}\n`;

        });

        return attachmentCSV;

      }

}

module.exports = Helpers;