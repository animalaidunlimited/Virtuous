const nodeMailer = require("nodemailer");

const Helpers = require('./Helpers');

class EmailGenerator {

    constructor() {

        this.helpers = new Helpers();
        this.includedEventCodes = this.helpers.getincludedEventCodes();
    }


       /**
       * This function creates the body of the result email. It includes the total amount in the batch, with this value broken down into
       * its constituent parts, like monthly donations or one time.
       * This function also tracks new projects created and any failures encountered along the way, and adds them to the email too.
       *
       * @param  {} processingResults
       */
           generateOutcomeEmail(processingResults) {

            const transactionsToProcess = processingResults.transactionsToProcess;
            const failures = processingResults.failures;
            const projectsAdded = processingResults.projectsAdded;
            const giftAndContactResults = processingResults.giftAndContactResults;
            const startTime = processingResults.startTime;
            const endTime = processingResults.endTime;
            const timeToRun = secondsToHMS(hmsToSeconds(endTime) - hmsToSeconds(startTime));


            const tranasctionCount = `There are a total of ${transactionsToProcess.length} transactions in this run.`;

            //Let's get the amounts by transaction type for the summary email
            const eventAmounts = transactionsToProcess.reduce((accumulator, currentValue) => {

                const currentAmount = Number(currentValue.transaction_info.transaction_amount.value);

                const foundEvent = accumulator.find(element => element.eventCode === currentValue.transaction_info.transaction_event_code);

                accumulator[0].amount += currentAmount;

                if(foundEvent){

                  foundEvent.amount += currentAmount;

                }
                else {

                    let event = this.includedEventCodes.find(element => element.eventCode === currentValue.transaction_info.transaction_event_code);

                    accumulator.push({eventCode : currentValue.transaction_info.transaction_event_code, Description: event.description, amount : currentAmount});

                }

                return accumulator;


              },[{eventcode: "Total Amount", Description: "Total amount", amount: 0}]);

              let emailBody = `Hi,

          The latest PayPal import into Virtuous has completed, it took ${timeToRun} to run.

          ${tranasctionCount}

          `;

              eventAmounts.forEach(lineItem => {

                emailBody = emailBody + `${lineItem.Description}: $${Number(lineItem.amount).toFixed(2)}\n`

              });

              //We've added at least one new project, so we need to add a new line to the email
              if(projectsAdded?.length > 0) {

                emailBody = emailBody + `\n\nThe following projects have been added to Virtuous:\n`;

                projectsAdded.forEach(project => {

                  emailBody = emailBody + `${project}\n`;

                });

              }

              //Some of the transactions have failed. So let's add them to the body of the email
              if(failures?.length > 0){

                emailBody = emailBody + `\n\nThe following transactions had failures:\n`;

                failures.forEach(failure => {

                  emailBody = emailBody + `${failure.transaction}: ${failure.error}\n`;

                })

              }

              emailBody = emailBody + `\nThis message was sent by AAU's Virtuous PayPal import bot.\n`;

              return {
                  email: emailBody,
                  attachmentContent: giftAndContactResults
              };

          }



          sendOutcomeEmail(emailBody, attachmentContent, req, res){

            const transactionAttachment = this.helpers.convertTransactionResultsToCSV(attachmentContent);

            const transporter = nodeMailer.createTransport({
                host: "smtp.gmail.com",
                port: 465,
                secure: true,
                auth: {
                  type: "OAuth2",
                  user: process.env.GMAIL_ADDRESS,
                  serviceClient: process.env.CLIENT_ID,
                  privateKey: process.env.PRIVATE_KEY.replace(/\\n/g, "\n")
                }
              });

              const mailOptions = {
                from: process.env.MAIL_FROM,
                to: process.env.MAIL_TO,
                subject: "Virtuous PayPal Import Complete",
                text: emailBody,
                attachments: [
                    {
                      filename: "ProcessingResults.csv",
                      content: transactionAttachment,
                    },
                  ]
              };

              transporter
                    .sendMail(mailOptions)
                    .then(() => {
                    res.status(200).send({
                        data: {
                        code: 200,
                        message: "Mail sent"
                        }
                    });
                    })
                    .catch(e => {
                    res.status(500).send({
                        error: {
                        code: 500,
                        message: e.toString()
                        }
                    });
                    });



          }



          hmsToSeconds(t) {
            const [hours, minutes, seconds] = t.split(':');
            return Number(hours) * 60 * 60 + Number(minutes) * 60 + Number(seconds);
          }

        secondsToHMS(secs) {
            return new Date(secs * 1000).toISOString().substr(11, 8)
          }


}

module.exports = EmailGenerator;

