class Config {

    constructor(){

        //These are the username and password for the Virtuous account that you want to use.
        //Be aware that if this account lives in more than one Virtuous instance, you might end up hitting
        //the API of the wrong instance. This user should only exist in one Virtuous instance.
        this.virtuousUsername = process.env.virtuousUsername;
        this.virtuousPassword = process.env.virtuousPassword;

        //You can get this by scripting a Postman request for the Virtuous API /Token endpoint.
        //Read more about that here: https://docs.virtuoussoftware.com/#899b354a-86a1-41e9-ac40-303cfd0ccda5
        this.virtuousCookie = process.env.virtuousCookie;

        //You can get this by scripting a Postman request for a PayPal Token.
        //You can read more about that here: https://developer.paypal.com/api/rest/
        this.paypalAuthorization = process.env.paypalAuthorization;
        this.paypalCookie = process.env.paypalCookie;

        //These are both available at their respective sites.
	    this.paypalAPIURL = process.env.paypalAPIURL;
		this.virtuousAPIURL = process.env.virtuousAPIURL;

    }

}


module.exports = Config;



