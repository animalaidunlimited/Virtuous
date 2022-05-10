const Authenticators = require('./Authenticators');
const PayPalProcessor = require('./PayPalProcessor');
const VirtuousProcessor = require('./VirtuousProcessor');
const EmailGenerator = require('./EmailGenerator');

const functions = require('@google-cloud/functions-framework');
const escapeHtml = require('escape-html');

// HTTP Cloud Function.
    functions.http('importPayPalDonationsToVirtuous', (req, res) => {

        //Start a timer to measure the time it takes to run the function
        const startTime = new Date();

        //Set the start and end date from the URL query parameters
        const startDate = escapeHtml(req.query.startDate);
        const endDate = escapeHtml(req.query.endDate);

        //Push the PayPal gifts to Virtuous
        let processingResults = await pushPayPalGiftsToVirtuous(startDate, endDate);

        //Set the start and end time for use in the email.
        processingResults.startTime = startTime;
        processingResults.endTime = new Date();

        const emailGenerator = new EmailGenerator();

        //Now let's generate the results email
        let resultsObject = emailGenerator.generateEmail(processingResults);

        //Send the email
        emailGenerator.sendOutcomeEmail(resultsObject.email, resultsObject.attachmentContent, req, res).then(() => {

            console.log('Email sent successfully');

            res.status(200).send({
                data: {
                code: 200,
                message: "Mail sent"
                }
            });
            })
            .catch(e => {

            console.log('Error: ' + e.toString());

            res.status(500).send({
                error: {
                code: 500,
                message: e.toString()
                }
            });
        });

    });

    async function pushPayPalGiftsToVirtuous(startDate, endDate){

        //Authenticators is a singleton, so get the instance
        const authenticators = Authenticators.getInstance();

        const paypalProcessor = new PayPalProcessor(startDate, endDate);

        //Authenticate with PayPal and Virtuous
        await authenticators.authenticatePayPal();
        await authenticators.authenticateVirtuous();


        //Get the tranasctions from PayPal for the day in question
        const transactionList = await paypalProcessor.fetchTransactionsFromPayPal();

        //Authenticate with Virtuous
        await authenticators.authenticateVirtuous();

        //Create a new Virtuous processor, passing in the transaction list from PayPal
        const virtuousProcessor = new VirtuousProcessor(transactionList);

        //Push the transactions to Virtuous. The response is an object that contains the results for each transaction
        //and an email body of overall results including the list of failures.
        return await virtuousProcessor.processTransactions();


    }





