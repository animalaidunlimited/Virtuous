/**********************************************************************************************************************
* Author: Jim Mackenzie
* Date: 20/Mar/2022
* Description: This script is intended to get the Virtuous Contact Id for a list of Legacy Contact IDs
* 
* Please be aware that the Virtuous API has alimit of 1000 calls per hour.
*
* PARAMETERS TO SET
*
* username: This is the Virtuous username you want to hit the API with. It is suggested you create a new user and
* allow minimal privileges for this account.
*
* password: The password for the above account. DO NOT SHARE YOUR PASSWORD
*
* legacyContactId: This is the column in your spreadsheet where the legacy contact ID of your users lives.
*
* resultColumn: This is where you want the amount retrieved from Virtuous to be stored.
*
/***********************************************************************************************************************/

function myFunction() {

  //Set the username and password for the user you're logging into Virtuous as. We'll use this to get an access token.
  const username = 'username@email.com';
  const password = 'yourVeryStrongPasswordShouldGoHere$$3';

  //Set the column that has the email address in it
  const legacyContactId = 'A';

  //Set the column that you want the results to land in
  const resultColumn = 'F'
  
  //Get the width of the range, we'll use this the skip rows that already have a value
  const arraySize = resultColumn.charCodeAt(0) - legacyContactId.charCodeAt(0);

  //Get all of the rows we're interested in
  const rows = SpreadsheetApp.getActiveSheet().getRange(`${legacyContactId}2:${resultColumn}`).getValues();

  //Get ourselves an authentication token from the server
  const token = getToken(username, password);

  //Set the endpoint fromn the API we want to hit
  let baseURL = 'https://api.virtuoussoftware.com/api/Contact/Query?skip=0&take=10';

  //Set the headers of the request. Here we need to set the Authorization header with the token we retrieved before
  let headers = {'Authorization': `bearer ${token}`, 'Content-Type': 'application/json'};





    //For each email in our list make a call to the enppoint we selected above
    for([index, row] of rows.entries()){

    //This row either has an empty email field or already has a value, so let's skip it
    if(row[0].length == 0 || row[arraySize].toString().length != 0 ){
      continue;
    }       

          const formData = {
                    "groups": [
                        {
                            "conditions": [
                                {
                                    "parameter": "Legacy Contact Id",
                                    "operator": "Is",
                                    "value": row[0]
                                }
                            ]
                        }
                    ]
                };

          let options = {
                          'method' : 'post',
                          'headers' : headers,
                          'payload' : JSON.stringify(formData)
                          }

        let response = {};
        
        //Get the results from the API and catch any errors
        try{
          response = JSON.parse(UrlFetchApp.fetch(baseURL, options));
        }
        catch(error){
          console.log();
        }

        //Get the contact Id
        let contactId = response.list.length >0 ? response.list[0].id : -1;
        
        //Save the value to the result column
        SpreadsheetApp.getActiveSheet().getRange(resultColumn + (index + 2)).setValue(contactId);

        //Every 10 calls let's write the results to the spreadsheet
        if(index % 10 == 0){
          SpreadsheetApp.flush();
        }

      }

}

function getToken(username, password) {

  const baseURL = 'https://api.virtuoussoftware.com/Token'

  const formData = {'grant_type' : 'password', 'username' : username, 'password' : password};

  var options = {
    'method' : 'post',
    'payload' : formData
  };

  let response = JSON.parse(UrlFetchApp.fetch(baseURL, options));

  return response.access_token;

}
