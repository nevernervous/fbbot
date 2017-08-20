
const request = require('request');
const parseDomain = require('parse-domain');
const NlpProcess = require('./nlpProcess');


function converse(storage, bot, message){

  storage.users.get(message.user,function(err, user) {
    console.log("--------------------start chatting------------");

    if (!user) {
      user = {
        id: message.user,
        team: message.team
      };
      storage.users.save(user, function(err, id) {
        console.log(id);
      });
    }

    let prevCompany = user.previous_company || null;

    console.log(user);
    
    // Process Chat
    
		NlpProcess.chat(prevCompany, message.text, (err, company, response) => {
      console.log("-------------------------get callback----------------------")
      console.log(company);
      console.log(response);
			if( !company ){
        if (response.attachment) {
          bot.reply(message, {attachment: response.attachment});
          bot.reply(message, response.text);
        } else {
          bot.reply(message, response);
        }
				return bot.reply(message, response);
			}

	    user.previous_company = company.domain || prevCompany || null;
	    storage.users.save(user,function(err, id) {
        if (response.attachment) {

          bot.reply(message, {attachment: response.attachment});
          bot.reply(message, response.text);
        } else {
          bot.reply(message, response);
        }
	    });
    });
  });
}

module.exports = {
	converse
};