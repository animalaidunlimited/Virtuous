const fetch = require('cross-fetch');
const { Headers } = fetch;
const Config = require('./Config');

class Authenticators {

    constructor(){

      this.config = new Config();

      //These will be replcaed by Cloud Functions secrets
      this.virtuousUsername = this.config.virtuousUsername;
      this.virtuousPassword = this.config.virtuousPassword;

      this.paypalToken = "";
      this.virtuousToken = "";

      //This class is a singleton, so we only need one instance.
      Authenticators.instance = this;

    };

    //Don't instantiate a new instance, call getInstance to get the one instance of this class.
    static getInstance() {
      if (!Authenticators.instance) {
        Authenticators.instance=new Authenticators();
      }
      return Authenticators.instance;
    }

    getVirtuousAPIURL() {
        return this.virtuousAPIURL;
    }


    /*
    * This function calls the PaYPal and gets a new authentication token. The tokens have a very limited lifespan (3hrs at time of writing), so we need a new one each time.
    */
    async authenticatePayPal() {

        var authenticateHeaders = new Headers();
            authenticateHeaders.append("Accept", "application/json");
            authenticateHeaders.append("Accept-Language", "en_US");
            authenticateHeaders.append("Authorization", this.config.paypalAuthorization);
            authenticateHeaders.append("Content-Type", "application/x-www-form-urlencoded");
            authenticateHeaders.append("Cookie", this.config.paypalCookie);

            var authenticationURL = new URLSearchParams();
            authenticationURL.append("grant_type", "client_credentials");

            var requestOptions = {
            method: 'POST',
            headers: authenticateHeaders,
            body: authenticationURL,
            redirect: 'follow'
            };

        let response = await fetch(this.config.paypalAPIURL + "/oauth2/token", requestOptions)
                                .then(response => response.text())
                                .catch(error => console.log('error', error));

        const tokenResponse = JSON.parse(response);
        console.log('Auth successful');

        this.paypalToken = tokenResponse.token_type + " " + tokenResponse.access_token;

    }


    /**
     * This function returns the authentication token from Virtuous. They are valid for 15 days, but let's get a new new one each time.
     */
    async authenticateVirtuous() {

        //Setup variables for the Virtuous toekn call
        var authenticationHeaders = new Headers();
        authenticationHeaders.append("Content-Type", "application/x-www-form-urlencoded");
        authenticationHeaders.append("Cookie", this.config.virtuousCookie);

        var urlencoded = new URLSearchParams();
        urlencoded.append("grant_type", "password");
        urlencoded.append("username", this.config.virtuousUsername);
        urlencoded.append("password", this.config.virtuousPassword);

        var requestOptions = {
          method: 'POST',
          headers: authenticationHeaders,
          body: urlencoded,
          redirect: 'follow'
        };

        let tokenResponse = await fetch("https://api.virtuoussoftware.com/Token", requestOptions)
          .then(response => response.json())
          .catch(error => console.log('error', error));

          this.virtuousToken = tokenResponse.token_type + " " + tokenResponse.access_token;
    }


    /*
    *
    *   HELPER FUNCTIONS
    *
    */

    getPayPalHeaders(){

        let headers = new Headers();
        headers.append("Authorization", this.paypalToken);
        headers.append("Cookie", this.config.paypalCookie);

        return headers;

    }

    getVirtuousHeaders(){

        let headers = new Headers();
        headers.append("Authorization", this.virtuousToken);
        headers.append("Cookie", this.config.virtuousCookie);
        headers.append("Content-Type", "application/json");

        return headers;

    }

    getOptions(httpVerb, source) {

        let headers = {};

        if(source === "PayPal"){

          headers = this.getPayPalHeaders();

        }
        else if (source = "Virtuous"){

          headers = this.getVirtuousHeaders();

        }

        return {
          method: httpVerb,
          headers: headers,
          redirect: 'follow'
        };

      }

}


module.exports = Authenticators;
