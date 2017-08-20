const databyteApiKey = process.env.databyteApiKey;
const parseDomain = require('parse-domain');
const request = require('request');
const _ = require('lodash');

const fieldMap = {
	'linkedin': 'social.linkedin',
	'facebook': 'social.facebook',
	'angellist': 'social.angellist',
	'twitter': 'social.twitter',
	'crunchbase': 'social.crunchbase',
	'categories': 'categories',
	'model': 'business_models',
	'models': 'business_models',
	'business_models': 'business_models',
	'revenue': 'finance.revenue',
	'stage': 'finance.stage',
	'employees': 'employees',
	'competitors': 'relatedCompanies',
	'website': 'links.site',
	'site': 'links.site',
	'blog': 'links.blog',
	'address': 'geo',
	'geo': 'geo',
	'where': 'geo',
	'timezone': 'geo.timezone',
	'city': 'city',
	'state': 'state',
	'zip': 'zip',
	'country': 'country',
};

const prevPronouns = [
	'they',
	'their'
];

const ignored = [
	'please',
	'what',
	'is',
	'of',
	'the',
	'are',
	'can',
	'you',
	'for',
	'tell',
	'me',
	'many',
	'how',
	'who',
	'do',
	'have'
];

function chat(prevCompany, input, cb){
	// console.log("----------------------nlp chat---------------");

	let companyWasFound = false;
	let possibleCompanies = [];
	let possibleFields = [];

	let possibleKeywords = Object.keys(fieldMap);

	let parsedInput = input.toLowerCase();
	let parsedWords = parsedInput.split(' ');

	//Slack autoformats messages...
	// let slackDomains = input.match(/<http:\/\/(.*)+\|(.*)+>$/);
	// console.log("-------------slack domains--------------------");
	// console.log(slackDomains);
	// if( slackDomains && slackDomains.length > 2 && slackDomains[1] == slackDomains[2] ){
	// 	possibleCompanies.push(slackDomains[1]);
	// 	companyWasFound = true;
	// }

	// Should we use previous company? (They said "THEY/THEIR")
	if( prevCompany ){
		for (var i = parsedWords.length - 1; i >= 0; i--) {
			let cleanWord = parsedWords[i].replace(/\W+/g, '');
			if(prevPronouns.indexOf(cleanWord) !== -1 ){
				possibleCompanies.push(prevCompany);
				companyWasFound = true;
			}
		}
	}

	// Main parsing loop
	for (var i = parsedWords.length - 1; i >= 0; i--) {
		let currentWord = parsedWords[i];
		let cleanWord = currentWord.replace(/\W+/g, '');
		if(ignored.indexOf(cleanWord) !== -1 ){
			// do nothing, ignored word
		}else if(possibleKeywords.indexOf(cleanWord) !== -1 ){
			possibleFields.push(fieldMap[cleanWord]);
		}else if( !companyWasFound ){
			possibleCompanies.push(currentWord.replace(/[^a-zA-Z0-9-_.]/g, ''));
		}
	}

	// no possible companies, but we have a previous
	if( possibleCompanies.length === 0 && prevCompany ){
		possibleCompanies.push(prevCompany);
	}

	// Nothing to try
	if( possibleCompanies.length === 0 ){
		return respondUnknownCompany(input, possibleCompanies, cb);
	}

	// We have something to try!
	lookupByCompanyNames(possibleCompanies, (error, companies) => {
		if( companies && companies.length === 1 ){
			return respondCompany(companies[0], possibleFields, cb);
		}else if( companies && companies.length > 1 ){
			return respondMultipleCompanies(companies, cb);
		}else{
			return respondUnknownCompany(input, possibleCompanies, cb);
		}
	});
}

function respondCompany(company, fields, cb){

	let response = `Heres what I was able to find for ${company.name}:\n`;
	if (fields.length == 0) {
		response = formatCompany(company);
		return cb(null, company, response);
	}
		
	for (var i = fields.length - 1; i >= 0; i--) {
		let field = fields[i];

		if( field === 'geo' ){
			let geo = company.geo;
			if( !geo.address && !geo.city && !geo.state && !geo.zip ){
				response += ` Location Is unknown`;
			}
			let geoResp = '';
			if( geo.address ){
				geoResp += `    ${geo.address}`;
			}
			if( geo.city || geo.state || geo.zip ){
				geoResp += `    ${geo.city ? geo.city + ',' : ''} ${geo.state} ${geo.zip}`;
			}
			response += ` Located at\n${geoResp}`;

		}else if( field === 'employees' ){
			let employees = company.company.employees;
			if( employees){
				response += ` ${field}: ${ employees.toLocaleString() }\n`;
			}else if(company.company.employeesMin && company.company.employeesMax){
				response += ` ${field}: Between ${ company.company.employeesMin.toLocaleString() }-${ company.company.employeesMax.toLocaleString() }\n`;
			}
		}else if( field === 'revenue' ){
			let revenue = company.finance.revenue;
			if( revenue){
				response += ` ${field}: ${ '$' + revenue.toLocaleString() }\n`;
			}else if(company.finance.revenueMin && company.finance.revenueMax){
				response += ` ${field}: Between ${ '$' + company.finance.revenueMin.toLocaleString() }-${ '$' + company.finance.revenueMax.toLocaleString() }\n`;
			}
		}else{
			let value = _.get(company, fieldMap[field]);
			response += ` ${field}: ${ value ? value : 'unknown' }\n`;
		}
	}
	return cb(null, company, response);
}

function respondMultipleCompanies(companies, cb){
	let response = 'Which Company did you want:\n';
	response += '```\n';
	for (var i = companies.length - 1; i >= 0; i--) {
		response += `${companies[i].domain}: ${companies[i].name}\n`;
	}
	response += '```';
	return cb(null, null, response);
}

function respondUnknownCompany(input, companies, cb){
	let response = 'Could not find from these possible guesses we thought you wanted \n';
	response += companies.join();
	return cb(null, null, response);
}


function callDatabyte(domain, cb){
	let url = `https://api.databyte.io/v1/enrich/company?apikey=${databyteApiKey}&domain=${domain}`;
  request({url:url, json:true}, function (error, response, body) {
    if(error){
      console.log(error);
    }
    if (!error && response.statusCode == 200) {
			//fake an array response (from search)
			// console.log("-----------body.data-----------:", body.data);
    	if( body.data.name ){
    		return cb(null, [body.data]);
    	}
			console.log(body);
    	return cb(null, null);
    }
		console.log(response.statusCode);
    return cb(error, null);
  })
}

function lookupByCompanyNames(names, cb){
	return callDatabyte(names[0], cb);
	// let companies = [
	// 	{
	// 		name: 'stripe',
	// 		revenue: 10000000,
	// 		employees: 12,
	// 		stage: 'late',
	// 		categories: [
	// 			'saas',
	// 			'payment processing'
	// 		],
	// 		business_model: ['b2b']
	// 	},
	// 	// {
	// 	// 	name: 'prospectify',
	// 	// 	revenue: 10000000,
	// 	// 	employees: 12,
	// 	// 	stage: 'late',
	// 	// 	categories: [
	// 	// 		'saas',
	// 	// 		'payment processing'
	// 	// 	],
	// 	// 	business_model: ['b2b']
	// 	// }
	// ];
	// return cb(null, companies);
}

function formatCompany(company){
  let text = '';
  text += `Description: ${company.description} \n`;
  if( company.phone ){
    text += `Phone: ${company.phone} \n`;
  }
  if( company.company &&  company.company.foundedDate ){
    text += `Founded: ${company.company.foundedDate} \n`;
  }
  if( company.geo &&  company.geo.city ){
    text += `Location: ${company.geo.city}, ${company.geo.state} \n`;
  }
  if( company.company &&  company.company.employeesMin ){
    text += `Employees: ${company.company.employeesMin}-${company.company.employeesMax} \n`;
  }
  if( company.business_models ){
    text += `Models: ${company.business_models.join()} \n`;
  }
  
  let response = {
  	"text":text,
    "attachment": {
    	"type": "template",
    	"payload": {
    		"template_type": "generic",
    		"elements": [
    			{
		       	"title": `Company: ${company.name}`,
		        "subtitle": text,
		        "image_url": company.logo,
    			}
    		]
      }
    }
  };
  return response;
}

module.exports = {
	chat
};