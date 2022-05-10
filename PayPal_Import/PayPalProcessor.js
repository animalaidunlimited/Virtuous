const fetch = require('cross-fetch');
const Authenticators = require('./Authenticators');
const Config = require('./Config');

class PayPalProcessor{

  constructor(startDate, endDate){

    this.config = new Config();

    this.startDateParam = startDate;
    this.endDateParam = endDate;

    this.transactionList = [];

    this.authenticators = Authenticators.getInstance();

  }

  async fetchTransactionsFromPayPal(){

    await this.populateTransactionList(-1);

    return this.transactionList

  }

  async populateTransactionList(currentPage) {

    var transactionRequestOptions = this.authenticators.getOptions('GET', 'PayPal');

    let startDate = this.startDateParam ? new Date(this.startDateParam) : new Date();

    startDate.setUTCHours(0,0,0,0);
    startDate.setDate(startDate.getDate() - (this.startDateParam ? 0 : 1));
    const strStartDate = startDate.toISOString().substring(0,19) + "-0000";

    let endDate = this.endDateParam ? new Date(this.endDateParam) : new Date();

    endDate.setUTCHours(23,59,59,999);
    endDate.setDate(endDate.getDate() - (this.endDateParam ? 0 : 1));
    const strEndDate = endDate.toISOString().substring(0,19) + "-0000";

  const transactionURL = "/reporting/transactions?start_date=" + strStartDate + "&end_date=" + strEndDate + "&fields=transaction_info,payer_info,shipping_info,cart_info" + (currentPage > 0 ? "&page=" + currentPage : "");

  let rawResult = await fetch(this.config.paypalAPIURL + transactionURL, transactionRequestOptions);

    if(rawResult?.status == 200){

      rawResult = await rawResult.text();

      let transactionResult = JSON.parse(rawResult);

      //We should always have a result set, so let's process it.
      this.appendTransactions(transactionResult);

      //We're on the first page, so we need to get the rest of the pages
      if(currentPage === -1 && transactionResult.total_pages > 1){
        await this.fetchAndProcessAllPages(transactionResult.total_pages)
      }

      //We've retrieved all of the pages and added them together, so it's time to process all of the records.
      //if(currentPage === transactionResult.total_pages || transactionResult.total_pages === 1)
      //else {
      //  transactionList
      //}

    }


  }

  appendTransactions(pageOfTransactions){

    //Let's include only successful transactions
    let filterSuccessfull = pageOfTransactions.transaction_details.filter(transaction =>
                                                transaction.transaction_info.transaction_status === "S"
                                              ||
                                                transaction.transaction_info.transaction_status === "V")


    this.transactionList = this.transactionList.concat(filterSuccessfull);

  }

  async fetchAndProcessAllPages(pages){

          //We must be on page 2, so let's start there.
          for(let page = 2; page <= pages; page++){

            await this.populateTransactionList(page);

          }
  }



}

module.exports = PayPalProcessor;