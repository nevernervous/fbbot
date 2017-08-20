
var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.page_token) {
    console.log('Error: Specify a Facebook page_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify a Facebook verify_token in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.facebookbot({
    // debug: true,
    receive_via_postback: true,
    verify_token: process.env.verify_token,
    access_token: process.env.page_token,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Facebook to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Set up Facebook "thread settings" such as get started button, persistent menu
require(__dirname + '/components/thread_settings.js')(controller);


// Send an onboarding message when a user activates the bot
require(__dirname + '/components/onboarding.js')(controller);

// Enable Dashbot.io plugin
require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
require("fs").readdirSync(normalizedPath).forEach(function(file) {
  require("./skills/" + file)(controller);
});


// This captures and evaluates any message sent to the bot as a DM
// or sent to the bot in the form "@bot message" and passes it to
// Botkit Studio to evaluate for trigger words and patterns.
// If a trigger is matched, the conversation will automatically fire!
// You can tie into the execution of the script using the functions
// controller.studio.before, controller.studio.after and controller.studio.validate
if (process.env.studio_token) {
    controller.on('message_received', function(bot, message) {
        if (message.text) {
            controller.studio.runTrigger(bot, message.text, message.user, message.channel).then(function(convo) {
                if (!convo) {
                    // no trigger was matched
                    // If you want your bot to respond to every message,
                    // define a 'fallback' script in Botkit Studio
                    // and uncomment the line below.
                    controller.studio.run(bot, 'fallback', message.user, message.channel);
                } else {
                    // set variables here that are needed for EVERY script
                    // use controller.studio.before('script') to set variables specific to a script
                    convo.setVar('current_time', new Date());
                }
            }).catch(function(err) {
                if (err) {
                    bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err);
                    debug('Botkit Studio: ', err);
                }
            });
        }
    });
} else {
    console.log('~~~~~~~~~~');
    console.log('NOTE: Botkit Studio functionality has not been enabled');
    console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
}

function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('page_token=<MY PAGE TOKEN> verify_token=<MY VERIFY TOKEN> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Facebook token here: https://developers.facebook.com/docs/messenger-platform/implementation')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}

var request = require('request');
var debug = require('debug')('botkit:get_app_id');

module.exports = function(controller) {

    debug('Getting Facebook App ID...');
    request.get('https://graph.facebook.com/app/?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not get Facebook App ID! Check your page token.');
                throw new Error(err);
            } else {
              var json = null;
              try {
                  json = JSON.parse(body);
              } catch(err) {
                  debug('Error parsing JSON response from Facebook');
                  throw new Error(err);                
              }
              if (json.error) {
                throw new Error(json.error.message);
              } else {
                controller.config.app = json; 


                debug('Getting Facebook Page ID...');
                request.get('https://graph.facebook.com/me?access_token=' + controller.config.access_token,
                    function(err, res, body) {
                        if (err) {
                            debug('Could not get Facebook Page ID! Check your page token.');
                            throw new Error(err);
                        } else {
                          var json = null;
                          try {
                              json = JSON.parse(body);
                          } catch(err) {
                              debug('Error parsing JSON response from Facebook');
                              throw new Error(err);                
                          }
                          if (json.error) {
                            throw new Error(json.error.message);
                          } else {
                            controller.config.page = json; 
                          }
                        }
                    });
              
              
              }
            }
        });
};


module.exports = function(controller) {

    debug('Subscribing to Facebook events...');
    request.post('https://graph.facebook.com/me/subscribed_apps?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not subscribe to page messages!');
                throw new Error(err);
            } else {
                debug('Successfully subscribed to Facebook events:', body);
                controller.startTicking();
            }
        });

};

module.exports = function(controller) {

    debug('Configuring Facebook thread settings...');
    controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!');
    controller.api.thread_settings.get_started('sample_get_started_payload');
    controller.api.thread_settings.menu([
        {
            "type":"postback",
            "title":"Hello",
            "payload":"hello"
        },
        {
            "type":"postback",
            "title":"Help",
            "payload":"help"
        },
        {
          "type":"web_url",
          "title":"Botkit Docs",
          "url":"https://github.com/howdyai/botkit/blob/master/readme-facebook.md"
        },
    ]);

}

module.exports = function(controller, bot) {


    var webserver = express();
    webserver.use(bodyParser.json());
    webserver.use(bodyParser.urlencoded({ extended: true }));

    // import express middlewares that are present in /components/express_middleware
    var normalizedPath = require("path").join(__dirname, "express_middleware");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
        require("./express_middleware/" + file)(webserver, controller);
    });

    webserver.use(express.static('public'));


    webserver.listen(process.env.PORT || 3000, null, function() {

        debug('Express webserver configured and listening at http://localhost:' + process.env.PORT || 3000);

    });

    // import all the pre-defined routes that are present in /components/routes
    var normalizedPath = require("path").join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
      require("./routes/" + file)(webserver, controller);
    });

    controller.webserver = webserver;

    return webserver;

}

var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.page_token) {
    console.log('Error: Specify a Facebook page_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify a Facebook verify_token in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.facebookbot({
    // debug: true,
    receive_via_postback: true,
    verify_token: process.env.verify_token,
    access_token: process.env.page_token,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Facebook to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Set up Facebook "thread settings" such as get started button, persistent menu
require(__dirname + '/components/thread_settings.js')(controller);


// Send an onboarding message when a user activates the bot
require(__dirname + '/components/onboarding.js')(controller);

// Enable Dashbot.io plugin
require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
require("fs").readdirSync(normalizedPath).forEach(function(file) {
  require("./skills/" + file)(controller);
});


// This captures and evaluates any message sent to the bot as a DM
// or sent to the bot in the form "@bot message" and passes it to
// Botkit Studio to evaluate for trigger words and patterns.
// If a trigger is matched, the conversation will automatically fire!
// You can tie into the execution of the script using the functions
// controller.studio.before, controller.studio.after and controller.studio.validate
if (process.env.studio_token) {
    controller.on('message_received', function(bot, message) {
        if (message.text) {
            controller.studio.runTrigger(bot, message.text, message.user, message.channel).then(function(convo) {
                if (!convo) {
                    // no trigger was matched
                    // If you want your bot to respond to every message,
                    // define a 'fallback' script in Botkit Studio
                    // and uncomment the line below.
                    controller.studio.run(bot, 'fallback', message.user, message.channel);
                } else {
                    // set variables here that are needed for EVERY script
                    // use controller.studio.before('script') to set variables specific to a script
                    convo.setVar('current_time', new Date());
                }
            }).catch(function(err) {
                if (err) {
                    bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err);
                    debug('Botkit Studio: ', err);
                }
            });
        }
    });
} else {
    console.log('~~~~~~~~~~');
    console.log('NOTE: Botkit Studio functionality has not been enabled');
    console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
}

function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('page_token=<MY PAGE TOKEN> verify_token=<MY VERIFY TOKEN> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Facebook token here: https://developers.facebook.com/docs/messenger-platform/implementation')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}

var request = require('request');
var debug = require('debug')('botkit:get_app_id');

module.exports = function(controller) {

    debug('Getting Facebook App ID...');
    request.get('https://graph.facebook.com/app/?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not get Facebook App ID! Check your page token.');
                throw new Error(err);
            } else {
              var json = null;
              try {
                  json = JSON.parse(body);
              } catch(err) {
                  debug('Error parsing JSON response from Facebook');
                  throw new Error(err);                
              }
              if (json.error) {
                throw new Error(json.error.message);
              } else {
                controller.config.app = json; 


                debug('Getting Facebook Page ID...');
                request.get('https://graph.facebook.com/me?access_token=' + controller.config.access_token,
                    function(err, res, body) {
                        if (err) {
                            debug('Could not get Facebook Page ID! Check your page token.');
                            throw new Error(err);
                        } else {
                          var json = null;
                          try {
                              json = JSON.parse(body);
                          } catch(err) {
                              debug('Error parsing JSON response from Facebook');
                              throw new Error(err);                
                          }
                          if (json.error) {
                            throw new Error(json.error.message);
                          } else {
                            controller.config.page = json; 
                          }
                        }
                    });
              
              
              }
            }
        });
};


module.exports = function(controller) {

    debug('Subscribing to Facebook events...');
    request.post('https://graph.facebook.com/me/subscribed_apps?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not subscribe to page messages!');
                throw new Error(err);
            } else {
                debug('Successfully subscribed to Facebook events:', body);
                controller.startTicking();
            }
        });

};

module.exports = function(controller) {

    debug('Configuring Facebook thread settings...');
    controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!');
    controller.api.thread_settings.get_started('sample_get_started_payload');
    controller.api.thread_settings.menu([
        {
            "type":"postback",
            "title":"Hello",
            "payload":"hello"
        },
        {
            "type":"postback",
            "title":"Help",
            "payload":"help"
        },
        {
          "type":"web_url",
          "title":"Botkit Docs",
          "url":"https://github.com/howdyai/botkit/blob/master/readme-facebook.md"
        },
    ]);

}

module.exports = function(controller, bot) {


    var webserver = express();
    webserver.use(bodyParser.json());
    webserver.use(bodyParser.urlencoded({ extended: true }));

    // import express middlewares that are present in /components/express_middleware
    var normalizedPath = require("path").join(__dirname, "express_middleware");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
        require("./express_middleware/" + file)(webserver, controller);
    });

    webserver.use(express.static('public'));


    webserver.listen(process.env.PORT || 3000, null, function() {

        debug('Express webserver configured and listening at http://localhost:' + process.env.PORT || 3000);

    });

    // import all the pre-defined routes that are present in /components/routes
    var normalizedPath = require("path").join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
      require("./routes/" + file)(webserver, controller);
    });

    controller.webserver = webserver;

    return webserver;

}

var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.page_token) {
    console.log('Error: Specify a Facebook page_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify a Facebook verify_token in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.facebookbot({
    // debug: true,
    receive_via_postback: true,
    verify_token: process.env.verify_token,
    access_token: process.env.page_token,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Facebook to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Set up Facebook "thread settings" such as get started button, persistent menu
require(__dirname + '/components/thread_settings.js')(controller);


// Send an onboarding message when a user activates the bot
require(__dirname + '/components/onboarding.js')(controller);

// Enable Dashbot.io plugin
require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
require("fs").readdirSync(normalizedPath).forEach(function(file) {
  require("./skills/" + file)(controller);
});


// This captures and evaluates any message sent to the bot as a DM
// or sent to the bot in the form "@bot message" and passes it to
// Botkit Studio to evaluate for trigger words and patterns.
// If a trigger is matched, the conversation will automatically fire!
// You can tie into the execution of the script using the functions
// controller.studio.before, controller.studio.after and controller.studio.validate
if (process.env.studio_token) {
    controller.on('message_received', function(bot, message) {
        if (message.text) {
            controller.studio.runTrigger(bot, message.text, message.user, message.channel).then(function(convo) {
                if (!convo) {
                    // no trigger was matched
                    // If you want your bot to respond to every message,
                    // define a 'fallback' script in Botkit Studio
                    // and uncomment the line below.
                    controller.studio.run(bot, 'fallback', message.user, message.channel);
                } else {
                    // set variables here that are needed for EVERY script
                    // use controller.studio.before('script') to set variables specific to a script
                    convo.setVar('current_time', new Date());
                }
            }).catch(function(err) {
                if (err) {
                    bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err);
                    debug('Botkit Studio: ', err);
                }
            });
        }
    });
} else {
    console.log('~~~~~~~~~~');
    console.log('NOTE: Botkit Studio functionality has not been enabled');
    console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
}

function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('page_token=<MY PAGE TOKEN> verify_token=<MY VERIFY TOKEN> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Facebook token here: https://developers.facebook.com/docs/messenger-platform/implementation')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}

var request = require('request');
var debug = require('debug')('botkit:get_app_id');

module.exports = function(controller) {

    debug('Getting Facebook App ID...');
    request.get('https://graph.facebook.com/app/?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not get Facebook App ID! Check your page token.');
                throw new Error(err);
            } else {
              var json = null;
              try {
                  json = JSON.parse(body);
              } catch(err) {
                  debug('Error parsing JSON response from Facebook');
                  throw new Error(err);                
              }
              if (json.error) {
                throw new Error(json.error.message);
              } else {
                controller.config.app = json; 


                debug('Getting Facebook Page ID...');
                request.get('https://graph.facebook.com/me?access_token=' + controller.config.access_token,
                    function(err, res, body) {
                        if (err) {
                            debug('Could not get Facebook Page ID! Check your page token.');
                            throw new Error(err);
                        } else {
                          var json = null;
                          try {
                              json = JSON.parse(body);
                          } catch(err) {
                              debug('Error parsing JSON response from Facebook');
                              throw new Error(err);                
                          }
                          if (json.error) {
                            throw new Error(json.error.message);
                          } else {
                            controller.config.page = json; 
                          }
                        }
                    });
              
              
              }
            }
        });
};


module.exports = function(controller) {

    debug('Subscribing to Facebook events...');
    request.post('https://graph.facebook.com/me/subscribed_apps?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not subscribe to page messages!');
                throw new Error(err);
            } else {
                debug('Successfully subscribed to Facebook events:', body);
                controller.startTicking();
            }
        });

};

module.exports = function(controller) {

    debug('Configuring Facebook thread settings...');
    controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!');
    controller.api.thread_settings.get_started('sample_get_started_payload');
    controller.api.thread_settings.menu([
        {
            "type":"postback",
            "title":"Hello",
            "payload":"hello"
        },
        {
            "type":"postback",
            "title":"Help",
            "payload":"help"
        },
        {
          "type":"web_url",
          "title":"Botkit Docs",
          "url":"https://github.com/howdyai/botkit/blob/master/readme-facebook.md"
        },
    ]);

}

module.exports = function(controller, bot) {


    var webserver = express();
    webserver.use(bodyParser.json());
    webserver.use(bodyParser.urlencoded({ extended: true }));

    // import express middlewares that are present in /components/express_middleware
    var normalizedPath = require("path").join(__dirname, "express_middleware");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
        require("./express_middleware/" + file)(webserver, controller);
    });

    webserver.use(express.static('public'));


    webserver.listen(process.env.PORT || 3000, null, function() {

        debug('Express webserver configured and listening at http://localhost:' + process.env.PORT || 3000);

    });

    // import all the pre-defined routes that are present in /components/routes
    var normalizedPath = require("path").join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
      require("./routes/" + file)(webserver, controller);
    });

    controller.webserver = webserver;

    return webserver;

}

var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.page_token) {
    console.log('Error: Specify a Facebook page_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify a Facebook verify_token in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.facebookbot({
    // debug: true,
    receive_via_postback: true,
    verify_token: process.env.verify_token,
    access_token: process.env.page_token,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Facebook to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Set up Facebook "thread settings" such as get started button, persistent menu
require(__dirname + '/components/thread_settings.js')(controller);


// Send an onboarding message when a user activates the bot
require(__dirname + '/components/onboarding.js')(controller);

// Enable Dashbot.io plugin
require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
require("fs").readdirSync(normalizedPath).forEach(function(file) {
  require("./skills/" + file)(controller);
});


// This captures and evaluates any message sent to the bot as a DM
// or sent to the bot in the form "@bot message" and passes it to
// Botkit Studio to evaluate for trigger words and patterns.
// If a trigger is matched, the conversation will automatically fire!
// You can tie into the execution of the script using the functions
// controller.studio.before, controller.studio.after and controller.studio.validate
if (process.env.studio_token) {
    controller.on('message_received', function(bot, message) {
        if (message.text) {
            controller.studio.runTrigger(bot, message.text, message.user, message.channel).then(function(convo) {
                if (!convo) {
                    // no trigger was matched
                    // If you want your bot to respond to every message,
                    // define a 'fallback' script in Botkit Studio
                    // and uncomment the line below.
                    controller.studio.run(bot, 'fallback', message.user, message.channel);
                } else {
                    // set variables here that are needed for EVERY script
                    // use controller.studio.before('script') to set variables specific to a script
                    convo.setVar('current_time', new Date());
                }
            }).catch(function(err) {
                if (err) {
                    bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err);
                    debug('Botkit Studio: ', err);
                }
            });
        }
    });
} else {
    console.log('~~~~~~~~~~');
    console.log('NOTE: Botkit Studio functionality has not been enabled');
    console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
}

function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('page_token=<MY PAGE TOKEN> verify_token=<MY VERIFY TOKEN> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Facebook token here: https://developers.facebook.com/docs/messenger-platform/implementation')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}

var request = require('request');
var debug = require('debug')('botkit:get_app_id');

module.exports = function(controller) {

    debug('Getting Facebook App ID...');
    request.get('https://graph.facebook.com/app/?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not get Facebook App ID! Check your page token.');
                throw new Error(err);
            } else {
              var json = null;
              try {
                  json = JSON.parse(body);
              } catch(err) {
                  debug('Error parsing JSON response from Facebook');
                  throw new Error(err);                
              }
              if (json.error) {
                throw new Error(json.error.message);
              } else {
                controller.config.app = json; 


                debug('Getting Facebook Page ID...');
                request.get('https://graph.facebook.com/me?access_token=' + controller.config.access_token,
                    function(err, res, body) {
                        if (err) {
                            debug('Could not get Facebook Page ID! Check your page token.');
                            throw new Error(err);
                        } else {
                          var json = null;
                          try {
                              json = JSON.parse(body);
                          } catch(err) {
                              debug('Error parsing JSON response from Facebook');
                              throw new Error(err);                
                          }
                          if (json.error) {
                            throw new Error(json.error.message);
                          } else {
                            controller.config.page = json; 
                          }
                        }
                    });
              
              
              }
            }
        });
};


module.exports = function(controller) {

    debug('Subscribing to Facebook events...');
    request.post('https://graph.facebook.com/me/subscribed_apps?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not subscribe to page messages!');
                throw new Error(err);
            } else {
                debug('Successfully subscribed to Facebook events:', body);
                controller.startTicking();
            }
        });

};

module.exports = function(controller) {

    debug('Configuring Facebook thread settings...');
    controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!');
    controller.api.thread_settings.get_started('sample_get_started_payload');
    controller.api.thread_settings.menu([
        {
            "type":"postback",
            "title":"Hello",
            "payload":"hello"
        },
        {
            "type":"postback",
            "title":"Help",
            "payload":"help"
        },
        {
          "type":"web_url",
          "title":"Botkit Docs",
          "url":"https://github.com/howdyai/botkit/blob/master/readme-facebook.md"
        },
    ]);

}

module.exports = function(controller, bot) {


    var webserver = express();
    webserver.use(bodyParser.json());
    webserver.use(bodyParser.urlencoded({ extended: true }));

    // import express middlewares that are present in /components/express_middleware
    var normalizedPath = require("path").join(__dirname, "express_middleware");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
        require("./express_middleware/" + file)(webserver, controller);
    });

    webserver.use(express.static('public'));


    webserver.listen(process.env.PORT || 3000, null, function() {

        debug('Express webserver configured and listening at http://localhost:' + process.env.PORT || 3000);

    });

    // import all the pre-defined routes that are present in /components/routes
    var normalizedPath = require("path").join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
      require("./routes/" + file)(webserver, controller);
    });

    controller.webserver = webserver;

    return webserver;

}

var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.page_token) {
    console.log('Error: Specify a Facebook page_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify a Facebook verify_token in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.facebookbot({
    // debug: true,
    receive_via_postback: true,
    verify_token: process.env.verify_token,
    access_token: process.env.page_token,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Facebook to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Set up Facebook "thread settings" such as get started button, persistent menu
require(__dirname + '/components/thread_settings.js')(controller);


// Send an onboarding message when a user activates the bot
require(__dirname + '/components/onboarding.js')(controller);

// Enable Dashbot.io plugin
require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
require("fs").readdirSync(normalizedPath).forEach(function(file) {
  require("./skills/" + file)(controller);
});


// This captures and evaluates any message sent to the bot as a DM
// or sent to the bot in the form "@bot message" and passes it to
// Botkit Studio to evaluate for trigger words and patterns.
// If a trigger is matched, the conversation will automatically fire!
// You can tie into the execution of the script using the functions
// controller.studio.before, controller.studio.after and controller.studio.validate
if (process.env.studio_token) {
    controller.on('message_received', function(bot, message) {
        if (message.text) {
            controller.studio.runTrigger(bot, message.text, message.user, message.channel).then(function(convo) {
                if (!convo) {
                    // no trigger was matched
                    // If you want your bot to respond to every message,
                    // define a 'fallback' script in Botkit Studio
                    // and uncomment the line below.
                    controller.studio.run(bot, 'fallback', message.user, message.channel);
                } else {
                    // set variables here that are needed for EVERY script
                    // use controller.studio.before('script') to set variables specific to a script
                    convo.setVar('current_time', new Date());
                }
            }).catch(function(err) {
                if (err) {
                    bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err);
                    debug('Botkit Studio: ', err);
                }
            });
        }
    });
} else {
    console.log('~~~~~~~~~~');
    console.log('NOTE: Botkit Studio functionality has not been enabled');
    console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
}

function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('page_token=<MY PAGE TOKEN> verify_token=<MY VERIFY TOKEN> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Facebook token here: https://developers.facebook.com/docs/messenger-platform/implementation')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}

var request = require('request');
var debug = require('debug')('botkit:get_app_id');

module.exports = function(controller) {

    debug('Getting Facebook App ID...');
    request.get('https://graph.facebook.com/app/?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not get Facebook App ID! Check your page token.');
                throw new Error(err);
            } else {
              var json = null;
              try {
                  json = JSON.parse(body);
              } catch(err) {
                  debug('Error parsing JSON response from Facebook');
                  throw new Error(err);                
              }
              if (json.error) {
                throw new Error(json.error.message);
              } else {
                controller.config.app = json; 


                debug('Getting Facebook Page ID...');
                request.get('https://graph.facebook.com/me?access_token=' + controller.config.access_token,
                    function(err, res, body) {
                        if (err) {
                            debug('Could not get Facebook Page ID! Check your page token.');
                            throw new Error(err);
                        } else {
                          var json = null;
                          try {
                              json = JSON.parse(body);
                          } catch(err) {
                              debug('Error parsing JSON response from Facebook');
                              throw new Error(err);                
                          }
                          if (json.error) {
                            throw new Error(json.error.message);
                          } else {
                            controller.config.page = json; 
                          }
                        }
                    });
              
              
              }
            }
        });
};


module.exports = function(controller) {

    debug('Subscribing to Facebook events...');
    request.post('https://graph.facebook.com/me/subscribed_apps?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not subscribe to page messages!');
                throw new Error(err);
            } else {
                debug('Successfully subscribed to Facebook events:', body);
                controller.startTicking();
            }
        });

};

module.exports = function(controller) {

    debug('Configuring Facebook thread settings...');
    controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!');
    controller.api.thread_settings.get_started('sample_get_started_payload');
    controller.api.thread_settings.menu([
        {
            "type":"postback",
            "title":"Hello",
            "payload":"hello"
        },
        {
            "type":"postback",
            "title":"Help",
            "payload":"help"
        },
        {
          "type":"web_url",
          "title":"Botkit Docs",
          "url":"https://github.com/howdyai/botkit/blob/master/readme-facebook.md"
        },
    ]);

}

module.exports = function(controller, bot) {


    var webserver = express();
    webserver.use(bodyParser.json());
    webserver.use(bodyParser.urlencoded({ extended: true }));

    // import express middlewares that are present in /components/express_middleware
    var normalizedPath = require("path").join(__dirname, "express_middleware");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
        require("./express_middleware/" + file)(webserver, controller);
    });

    webserver.use(express.static('public'));


    webserver.listen(process.env.PORT || 3000, null, function() {

        debug('Express webserver configured and listening at http://localhost:' + process.env.PORT || 3000);

    });

    // import all the pre-defined routes that are present in /components/routes
    var normalizedPath = require("path").join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
      require("./routes/" + file)(webserver, controller);
    });

    controller.webserver = webserver;

    return webserver;

}

var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.page_token) {
    console.log('Error: Specify a Facebook page_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify a Facebook verify_token in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.facebookbot({
    // debug: true,
    receive_via_postback: true,
    verify_token: process.env.verify_token,
    access_token: process.env.page_token,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Facebook to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Set up Facebook "thread settings" such as get started button, persistent menu
require(__dirname + '/components/thread_settings.js')(controller);


// Send an onboarding message when a user activates the bot
require(__dirname + '/components/onboarding.js')(controller);

// Enable Dashbot.io plugin
require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
require("fs").readdirSync(normalizedPath).forEach(function(file) {
  require("./skills/" + file)(controller);
});


// This captures and evaluates any message sent to the bot as a DM
// or sent to the bot in the form "@bot message" and passes it to
// Botkit Studio to evaluate for trigger words and patterns.
// If a trigger is matched, the conversation will automatically fire!
// You can tie into the execution of the script using the functions
// controller.studio.before, controller.studio.after and controller.studio.validate
if (process.env.studio_token) {
    controller.on('message_received', function(bot, message) {
        if (message.text) {
            controller.studio.runTrigger(bot, message.text, message.user, message.channel).then(function(convo) {
                if (!convo) {
                    // no trigger was matched
                    // If you want your bot to respond to every message,
                    // define a 'fallback' script in Botkit Studio
                    // and uncomment the line below.
                    controller.studio.run(bot, 'fallback', message.user, message.channel);
                } else {
                    // set variables here that are needed for EVERY script
                    // use controller.studio.before('script') to set variables specific to a script
                    convo.setVar('current_time', new Date());
                }
            }).catch(function(err) {
                if (err) {
                    bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err);
                    debug('Botkit Studio: ', err);
                }
            });
        }
    });
} else {
    console.log('~~~~~~~~~~');
    console.log('NOTE: Botkit Studio functionality has not been enabled');
    console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
}

function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('page_token=<MY PAGE TOKEN> verify_token=<MY VERIFY TOKEN> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Facebook token here: https://developers.facebook.com/docs/messenger-platform/implementation')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}

var request = require('request');
var debug = require('debug')('botkit:get_app_id');

module.exports = function(controller) {

    debug('Getting Facebook App ID...');
    request.get('https://graph.facebook.com/app/?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not get Facebook App ID! Check your page token.');
                throw new Error(err);
            } else {
              var json = null;
              try {
                  json = JSON.parse(body);
              } catch(err) {
                  debug('Error parsing JSON response from Facebook');
                  throw new Error(err);                
              }
              if (json.error) {
                throw new Error(json.error.message);
              } else {
                controller.config.app = json; 


                debug('Getting Facebook Page ID...');
                request.get('https://graph.facebook.com/me?access_token=' + controller.config.access_token,
                    function(err, res, body) {
                        if (err) {
                            debug('Could not get Facebook Page ID! Check your page token.');
                            throw new Error(err);
                        } else {
                          var json = null;
                          try {
                              json = JSON.parse(body);
                          } catch(err) {
                              debug('Error parsing JSON response from Facebook');
                              throw new Error(err);                
                          }
                          if (json.error) {
                            throw new Error(json.error.message);
                          } else {
                            controller.config.page = json; 
                          }
                        }
                    });
              
              
              }
            }
        });
};


module.exports = function(controller) {

    debug('Subscribing to Facebook events...');
    request.post('https://graph.facebook.com/me/subscribed_apps?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not subscribe to page messages!');
                throw new Error(err);
            } else {
                debug('Successfully subscribed to Facebook events:', body);
                controller.startTicking();
            }
        });

};

module.exports = function(controller) {

    debug('Configuring Facebook thread settings...');
    controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!');
    controller.api.thread_settings.get_started('sample_get_started_payload');
    controller.api.thread_settings.menu([
        {
            "type":"postback",
            "title":"Hello",
            "payload":"hello"
        },
        {
            "type":"postback",
            "title":"Help",
            "payload":"help"
        },
        {
          "type":"web_url",
          "title":"Botkit Docs",
          "url":"https://github.com/howdyai/botkit/blob/master/readme-facebook.md"
        },
    ]);

}

module.exports = function(controller, bot) {


    var webserver = express();
    webserver.use(bodyParser.json());
    webserver.use(bodyParser.urlencoded({ extended: true }));

    // import express middlewares that are present in /components/express_middleware
    var normalizedPath = require("path").join(__dirname, "express_middleware");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
        require("./express_middleware/" + file)(webserver, controller);
    });

    webserver.use(express.static('public'));


    webserver.listen(process.env.PORT || 3000, null, function() {

        debug('Express webserver configured and listening at http://localhost:' + process.env.PORT || 3000);

    });

    // import all the pre-defined routes that are present in /components/routes
    var normalizedPath = require("path").join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
      require("./routes/" + file)(webserver, controller);
    });

    controller.webserver = webserver;

    return webserver;

}

var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.page_token) {
    console.log('Error: Specify a Facebook page_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify a Facebook verify_token in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.facebookbot({
    // debug: true,
    receive_via_postback: true,
    verify_token: process.env.verify_token,
    access_token: process.env.page_token,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Facebook to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Set up Facebook "thread settings" such as get started button, persistent menu
require(__dirname + '/components/thread_settings.js')(controller);


// Send an onboarding message when a user activates the bot
require(__dirname + '/components/onboarding.js')(controller);

// Enable Dashbot.io plugin
require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
require("fs").readdirSync(normalizedPath).forEach(function(file) {
  require("./skills/" + file)(controller);
});


// This captures and evaluates any message sent to the bot as a DM
// or sent to the bot in the form "@bot message" and passes it to
// Botkit Studio to evaluate for trigger words and patterns.
// If a trigger is matched, the conversation will automatically fire!
// You can tie into the execution of the script using the functions
// controller.studio.before, controller.studio.after and controller.studio.validate
if (process.env.studio_token) {
    controller.on('message_received', function(bot, message) {
        if (message.text) {
            controller.studio.runTrigger(bot, message.text, message.user, message.channel).then(function(convo) {
                if (!convo) {
                    // no trigger was matched
                    // If you want your bot to respond to every message,
                    // define a 'fallback' script in Botkit Studio
                    // and uncomment the line below.
                    controller.studio.run(bot, 'fallback', message.user, message.channel);
                } else {
                    // set variables here that are needed for EVERY script
                    // use controller.studio.before('script') to set variables specific to a script
                    convo.setVar('current_time', new Date());
                }
            }).catch(function(err) {
                if (err) {
                    bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err);
                    debug('Botkit Studio: ', err);
                }
            });
        }
    });
} else {
    console.log('~~~~~~~~~~');
    console.log('NOTE: Botkit Studio functionality has not been enabled');
    console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
}

function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('page_token=<MY PAGE TOKEN> verify_token=<MY VERIFY TOKEN> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Facebook token here: https://developers.facebook.com/docs/messenger-platform/implementation')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}

var request = require('request');
var debug = require('debug')('botkit:get_app_id');

module.exports = function(controller) {

    debug('Getting Facebook App ID...');
    request.get('https://graph.facebook.com/app/?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not get Facebook App ID! Check your page token.');
                throw new Error(err);
            } else {
              var json = null;
              try {
                  json = JSON.parse(body);
              } catch(err) {
                  debug('Error parsing JSON response from Facebook');
                  throw new Error(err);                
              }
              if (json.error) {
                throw new Error(json.error.message);
              } else {
                controller.config.app = json; 


                debug('Getting Facebook Page ID...');
                request.get('https://graph.facebook.com/me?access_token=' + controller.config.access_token,
                    function(err, res, body) {
                        if (err) {
                            debug('Could not get Facebook Page ID! Check your page token.');
                            throw new Error(err);
                        } else {
                          var json = null;
                          try {
                              json = JSON.parse(body);
                          } catch(err) {
                              debug('Error parsing JSON response from Facebook');
                              throw new Error(err);                
                          }
                          if (json.error) {
                            throw new Error(json.error.message);
                          } else {
                            controller.config.page = json; 
                          }
                        }
                    });
              
              
              }
            }
        });
};


module.exports = function(controller) {

    debug('Subscribing to Facebook events...');
    request.post('https://graph.facebook.com/me/subscribed_apps?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not subscribe to page messages!');
                throw new Error(err);
            } else {
                debug('Successfully subscribed to Facebook events:', body);
                controller.startTicking();
            }
        });

};

module.exports = function(controller) {

    debug('Configuring Facebook thread settings...');
    controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!');
    controller.api.thread_settings.get_started('sample_get_started_payload');
    controller.api.thread_settings.menu([
        {
            "type":"postback",
            "title":"Hello",
            "payload":"hello"
        },
        {
            "type":"postback",
            "title":"Help",
            "payload":"help"
        },
        {
          "type":"web_url",
          "title":"Botkit Docs",
          "url":"https://github.com/howdyai/botkit/blob/master/readme-facebook.md"
        },
    ]);

}

module.exports = function(controller, bot) {


    var webserver = express();
    webserver.use(bodyParser.json());
    webserver.use(bodyParser.urlencoded({ extended: true }));

    // import express middlewares that are present in /components/express_middleware
    var normalizedPath = require("path").join(__dirname, "express_middleware");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
        require("./express_middleware/" + file)(webserver, controller);
    });

    webserver.use(express.static('public'));


    webserver.listen(process.env.PORT || 3000, null, function() {

        debug('Express webserver configured and listening at http://localhost:' + process.env.PORT || 3000);

    });

    // import all the pre-defined routes that are present in /components/routes
    var normalizedPath = require("path").join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
      require("./routes/" + file)(webserver, controller);
    });

    controller.webserver = webserver;

    return webserver;

}

var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.page_token) {
    console.log('Error: Specify a Facebook page_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify a Facebook verify_token in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.facebookbot({
    // debug: true,
    receive_via_postback: true,
    verify_token: process.env.verify_token,
    access_token: process.env.page_token,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Facebook to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Set up Facebook "thread settings" such as get started button, persistent menu
require(__dirname + '/components/thread_settings.js')(controller);


// Send an onboarding message when a user activates the bot
require(__dirname + '/components/onboarding.js')(controller);

// Enable Dashbot.io plugin
require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
require("fs").readdirSync(normalizedPath).forEach(function(file) {
  require("./skills/" + file)(controller);
});


// This captures and evaluates any message sent to the bot as a DM
// or sent to the bot in the form "@bot message" and passes it to
// Botkit Studio to evaluate for trigger words and patterns.
// If a trigger is matched, the conversation will automatically fire!
// You can tie into the execution of the script using the functions
// controller.studio.before, controller.studio.after and controller.studio.validate
if (process.env.studio_token) {
    controller.on('message_received', function(bot, message) {
        if (message.text) {
            controller.studio.runTrigger(bot, message.text, message.user, message.channel).then(function(convo) {
                if (!convo) {
                    // no trigger was matched
                    // If you want your bot to respond to every message,
                    // define a 'fallback' script in Botkit Studio
                    // and uncomment the line below.
                    controller.studio.run(bot, 'fallback', message.user, message.channel);
                } else {
                    // set variables here that are needed for EVERY script
                    // use controller.studio.before('script') to set variables specific to a script
                    convo.setVar('current_time', new Date());
                }
            }).catch(function(err) {
                if (err) {
                    bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err);
                    debug('Botkit Studio: ', err);
                }
            });
        }
    });
} else {
    console.log('~~~~~~~~~~');
    console.log('NOTE: Botkit Studio functionality has not been enabled');
    console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
}

function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('page_token=<MY PAGE TOKEN> verify_token=<MY VERIFY TOKEN> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Facebook token here: https://developers.facebook.com/docs/messenger-platform/implementation')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}

var request = require('request');
var debug = require('debug')('botkit:get_app_id');

module.exports = function(controller) {

    debug('Getting Facebook App ID...');
    request.get('https://graph.facebook.com/app/?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not get Facebook App ID! Check your page token.');
                throw new Error(err);
            } else {
              var json = null;
              try {
                  json = JSON.parse(body);
              } catch(err) {
                  debug('Error parsing JSON response from Facebook');
                  throw new Error(err);                
              }
              if (json.error) {
                throw new Error(json.error.message);
              } else {
                controller.config.app = json; 


                debug('Getting Facebook Page ID...');
                request.get('https://graph.facebook.com/me?access_token=' + controller.config.access_token,
                    function(err, res, body) {
                        if (err) {
                            debug('Could not get Facebook Page ID! Check your page token.');
                            throw new Error(err);
                        } else {
                          var json = null;
                          try {
                              json = JSON.parse(body);
                          } catch(err) {
                              debug('Error parsing JSON response from Facebook');
                              throw new Error(err);                
                          }
                          if (json.error) {
                            throw new Error(json.error.message);
                          } else {
                            controller.config.page = json; 
                          }
                        }
                    });
              
              
              }
            }
        });
};


module.exports = function(controller) {

    debug('Subscribing to Facebook events...');
    request.post('https://graph.facebook.com/me/subscribed_apps?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not subscribe to page messages!');
                throw new Error(err);
            } else {
                debug('Successfully subscribed to Facebook events:', body);
                controller.startTicking();
            }
        });

};

module.exports = function(controller) {

    debug('Configuring Facebook thread settings...');
    controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!');
    controller.api.thread_settings.get_started('sample_get_started_payload');
    controller.api.thread_settings.menu([
        {
            "type":"postback",
            "title":"Hello",
            "payload":"hello"
        },
        {
            "type":"postback",
            "title":"Help",
            "payload":"help"
        },
        {
          "type":"web_url",
          "title":"Botkit Docs",
          "url":"https://github.com/howdyai/botkit/blob/master/readme-facebook.md"
        },
    ]);

}

module.exports = function(controller, bot) {


    var webserver = express();
    webserver.use(bodyParser.json());
    webserver.use(bodyParser.urlencoded({ extended: true }));

    // import express middlewares that are present in /components/express_middleware
    var normalizedPath = require("path").join(__dirname, "express_middleware");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
        require("./express_middleware/" + file)(webserver, controller);
    });

    webserver.use(express.static('public'));


    webserver.listen(process.env.PORT || 3000, null, function() {

        debug('Express webserver configured and listening at http://localhost:' + process.env.PORT || 3000);

    });

    // import all the pre-defined routes that are present in /components/routes
    var normalizedPath = require("path").join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
      require("./routes/" + file)(webserver, controller);
    });

    controller.webserver = webserver;

    return webserver;

}

var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.page_token) {
    console.log('Error: Specify a Facebook page_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify a Facebook verify_token in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.facebookbot({
    // debug: true,
    receive_via_postback: true,
    verify_token: process.env.verify_token,
    access_token: process.env.page_token,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Facebook to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Set up Facebook "thread settings" such as get started button, persistent menu
require(__dirname + '/components/thread_settings.js')(controller);


// Send an onboarding message when a user activates the bot
require(__dirname + '/components/onboarding.js')(controller);

// Enable Dashbot.io plugin
require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
require("fs").readdirSync(normalizedPath).forEach(function(file) {
  require("./skills/" + file)(controller);
});


// This captures and evaluates any message sent to the bot as a DM
// or sent to the bot in the form "@bot message" and passes it to
// Botkit Studio to evaluate for trigger words and patterns.
// If a trigger is matched, the conversation will automatically fire!
// You can tie into the execution of the script using the functions
// controller.studio.before, controller.studio.after and controller.studio.validate
if (process.env.studio_token) {
    controller.on('message_received', function(bot, message) {
        if (message.text) {
            controller.studio.runTrigger(bot, message.text, message.user, message.channel).then(function(convo) {
                if (!convo) {
                    // no trigger was matched
                    // If you want your bot to respond to every message,
                    // define a 'fallback' script in Botkit Studio
                    // and uncomment the line below.
                    controller.studio.run(bot, 'fallback', message.user, message.channel);
                } else {
                    // set variables here that are needed for EVERY script
                    // use controller.studio.before('script') to set variables specific to a script
                    convo.setVar('current_time', new Date());
                }
            }).catch(function(err) {
                if (err) {
                    bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err);
                    debug('Botkit Studio: ', err);
                }
            });
        }
    });
} else {
    console.log('~~~~~~~~~~');
    console.log('NOTE: Botkit Studio functionality has not been enabled');
    console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
}

function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('page_token=<MY PAGE TOKEN> verify_token=<MY VERIFY TOKEN> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Facebook token here: https://developers.facebook.com/docs/messenger-platform/implementation')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}

var request = require('request');
var debug = require('debug')('botkit:get_app_id');

module.exports = function(controller) {

    debug('Getting Facebook App ID...');
    request.get('https://graph.facebook.com/app/?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not get Facebook App ID! Check your page token.');
                throw new Error(err);
            } else {
              var json = null;
              try {
                  json = JSON.parse(body);
              } catch(err) {
                  debug('Error parsing JSON response from Facebook');
                  throw new Error(err);                
              }
              if (json.error) {
                throw new Error(json.error.message);
              } else {
                controller.config.app = json; 


                debug('Getting Facebook Page ID...');
                request.get('https://graph.facebook.com/me?access_token=' + controller.config.access_token,
                    function(err, res, body) {
                        if (err) {
                            debug('Could not get Facebook Page ID! Check your page token.');
                            throw new Error(err);
                        } else {
                          var json = null;
                          try {
                              json = JSON.parse(body);
                          } catch(err) {
                              debug('Error parsing JSON response from Facebook');
                              throw new Error(err);                
                          }
                          if (json.error) {
                            throw new Error(json.error.message);
                          } else {
                            controller.config.page = json; 
                          }
                        }
                    });
              
              
              }
            }
        });
};


module.exports = function(controller) {

    debug('Subscribing to Facebook events...');
    request.post('https://graph.facebook.com/me/subscribed_apps?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not subscribe to page messages!');
                throw new Error(err);
            } else {
                debug('Successfully subscribed to Facebook events:', body);
                controller.startTicking();
            }
        });

};

module.exports = function(controller) {

    debug('Configuring Facebook thread settings...');
    controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!');
    controller.api.thread_settings.get_started('sample_get_started_payload');
    controller.api.thread_settings.menu([
        {
            "type":"postback",
            "title":"Hello",
            "payload":"hello"
        },
        {
            "type":"postback",
            "title":"Help",
            "payload":"help"
        },
        {
          "type":"web_url",
          "title":"Botkit Docs",
          "url":"https://github.com/howdyai/botkit/blob/master/readme-facebook.md"
        },
    ]);

}

module.exports = function(controller, bot) {


    var webserver = express();
    webserver.use(bodyParser.json());
    webserver.use(bodyParser.urlencoded({ extended: true }));

    // import express middlewares that are present in /components/express_middleware
    var normalizedPath = require("path").join(__dirname, "express_middleware");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
        require("./express_middleware/" + file)(webserver, controller);
    });

    webserver.use(express.static('public'));


    webserver.listen(process.env.PORT || 3000, null, function() {

        debug('Express webserver configured and listening at http://localhost:' + process.env.PORT || 3000);

    });

    // import all the pre-defined routes that are present in /components/routes
    var normalizedPath = require("path").join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
      require("./routes/" + file)(webserver, controller);
    });

    controller.webserver = webserver;

    return webserver;

}

var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.page_token) {
    console.log('Error: Specify a Facebook page_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify a Facebook verify_token in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.facebookbot({
    // debug: true,
    receive_via_postback: true,
    verify_token: process.env.verify_token,
    access_token: process.env.page_token,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Facebook to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Set up Facebook "thread settings" such as get started button, persistent menu
require(__dirname + '/components/thread_settings.js')(controller);


// Send an onboarding message when a user activates the bot
require(__dirname + '/components/onboarding.js')(controller);

// Enable Dashbot.io plugin
require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
require("fs").readdirSync(normalizedPath).forEach(function(file) {
  require("./skills/" + file)(controller);
});


// This captures and evaluates any message sent to the bot as a DM
// or sent to the bot in the form "@bot message" and passes it to
// Botkit Studio to evaluate for trigger words and patterns.
// If a trigger is matched, the conversation will automatically fire!
// You can tie into the execution of the script using the functions
// controller.studio.before, controller.studio.after and controller.studio.validate
if (process.env.studio_token) {
    controller.on('message_received', function(bot, message) {
        if (message.text) {
            controller.studio.runTrigger(bot, message.text, message.user, message.channel).then(function(convo) {
                if (!convo) {
                    // no trigger was matched
                    // If you want your bot to respond to every message,
                    // define a 'fallback' script in Botkit Studio
                    // and uncomment the line below.
                    controller.studio.run(bot, 'fallback', message.user, message.channel);
                } else {
                    // set variables here that are needed for EVERY script
                    // use controller.studio.before('script') to set variables specific to a script
                    convo.setVar('current_time', new Date());
                }
            }).catch(function(err) {
                if (err) {
                    bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err);
                    debug('Botkit Studio: ', err);
                }
            });
        }
    });
} else {
    console.log('~~~~~~~~~~');
    console.log('NOTE: Botkit Studio functionality has not been enabled');
    console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
}

function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('page_token=<MY PAGE TOKEN> verify_token=<MY VERIFY TOKEN> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Facebook token here: https://developers.facebook.com/docs/messenger-platform/implementation')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}

var request = require('request');
var debug = require('debug')('botkit:get_app_id');

module.exports = function(controller) {

    debug('Getting Facebook App ID...');
    request.get('https://graph.facebook.com/app/?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not get Facebook App ID! Check your page token.');
                throw new Error(err);
            } else {
              var json = null;
              try {
                  json = JSON.parse(body);
              } catch(err) {
                  debug('Error parsing JSON response from Facebook');
                  throw new Error(err);                
              }
              if (json.error) {
                throw new Error(json.error.message);
              } else {
                controller.config.app = json; 


                debug('Getting Facebook Page ID...');
                request.get('https://graph.facebook.com/me?access_token=' + controller.config.access_token,
                    function(err, res, body) {
                        if (err) {
                            debug('Could not get Facebook Page ID! Check your page token.');
                            throw new Error(err);
                        } else {
                          var json = null;
                          try {
                              json = JSON.parse(body);
                          } catch(err) {
                              debug('Error parsing JSON response from Facebook');
                              throw new Error(err);                
                          }
                          if (json.error) {
                            throw new Error(json.error.message);
                          } else {
                            controller.config.page = json; 
                          }
                        }
                    });
              
              
              }
            }
        });
};


module.exports = function(controller) {

    debug('Subscribing to Facebook events...');
    request.post('https://graph.facebook.com/me/subscribed_apps?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not subscribe to page messages!');
                throw new Error(err);
            } else {
                debug('Successfully subscribed to Facebook events:', body);
                controller.startTicking();
            }
        });

};

module.exports = function(controller) {

    debug('Configuring Facebook thread settings...');
    controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!');
    controller.api.thread_settings.get_started('sample_get_started_payload');
    controller.api.thread_settings.menu([
        {
            "type":"postback",
            "title":"Hello",
            "payload":"hello"
        },
        {
            "type":"postback",
            "title":"Help",
            "payload":"help"
        },
        {
          "type":"web_url",
          "title":"Botkit Docs",
          "url":"https://github.com/howdyai/botkit/blob/master/readme-facebook.md"
        },
    ]);

}

module.exports = function(controller, bot) {


    var webserver = express();
    webserver.use(bodyParser.json());
    webserver.use(bodyParser.urlencoded({ extended: true }));

    // import express middlewares that are present in /components/express_middleware
    var normalizedPath = require("path").join(__dirname, "express_middleware");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
        require("./express_middleware/" + file)(webserver, controller);
    });

    webserver.use(express.static('public'));


    webserver.listen(process.env.PORT || 3000, null, function() {

        debug('Express webserver configured and listening at http://localhost:' + process.env.PORT || 3000);

    });

    // import all the pre-defined routes that are present in /components/routes
    var normalizedPath = require("path").join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
      require("./routes/" + file)(webserver, controller);
    });

    controller.webserver = webserver;

    return webserver;

}

var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.page_token) {
    console.log('Error: Specify a Facebook page_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify a Facebook verify_token in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.facebookbot({
    // debug: true,
    receive_via_postback: true,
    verify_token: process.env.verify_token,
    access_token: process.env.page_token,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Facebook to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Set up Facebook "thread settings" such as get started button, persistent menu
require(__dirname + '/components/thread_settings.js')(controller);


// Send an onboarding message when a user activates the bot
require(__dirname + '/components/onboarding.js')(controller);

// Enable Dashbot.io plugin
require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
require("fs").readdirSync(normalizedPath).forEach(function(file) {
  require("./skills/" + file)(controller);
});


// This captures and evaluates any message sent to the bot as a DM
// or sent to the bot in the form "@bot message" and passes it to
// Botkit Studio to evaluate for trigger words and patterns.
// If a trigger is matched, the conversation will automatically fire!
// You can tie into the execution of the script using the functions
// controller.studio.before, controller.studio.after and controller.studio.validate
if (process.env.studio_token) {
    controller.on('message_received', function(bot, message) {
        if (message.text) {
            controller.studio.runTrigger(bot, message.text, message.user, message.channel).then(function(convo) {
                if (!convo) {
                    // no trigger was matched
                    // If you want your bot to respond to every message,
                    // define a 'fallback' script in Botkit Studio
                    // and uncomment the line below.
                    controller.studio.run(bot, 'fallback', message.user, message.channel);
                } else {
                    // set variables here that are needed for EVERY script
                    // use controller.studio.before('script') to set variables specific to a script
                    convo.setVar('current_time', new Date());
                }
            }).catch(function(err) {
                if (err) {
                    bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err);
                    debug('Botkit Studio: ', err);
                }
            });
        }
    });
} else {
    console.log('~~~~~~~~~~');
    console.log('NOTE: Botkit Studio functionality has not been enabled');
    console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
}

function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('page_token=<MY PAGE TOKEN> verify_token=<MY VERIFY TOKEN> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Facebook token here: https://developers.facebook.com/docs/messenger-platform/implementation')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}

var request = require('request');
var debug = require('debug')('botkit:get_app_id');

module.exports = function(controller) {

    debug('Getting Facebook App ID...');
    request.get('https://graph.facebook.com/app/?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not get Facebook App ID! Check your page token.');
                throw new Error(err);
            } else {
              var json = null;
              try {
                  json = JSON.parse(body);
              } catch(err) {
                  debug('Error parsing JSON response from Facebook');
                  throw new Error(err);                
              }
              if (json.error) {
                throw new Error(json.error.message);
              } else {
                controller.config.app = json; 


                debug('Getting Facebook Page ID...');
                request.get('https://graph.facebook.com/me?access_token=' + controller.config.access_token,
                    function(err, res, body) {
                        if (err) {
                            debug('Could not get Facebook Page ID! Check your page token.');
                            throw new Error(err);
                        } else {
                          var json = null;
                          try {
                              json = JSON.parse(body);
                          } catch(err) {
                              debug('Error parsing JSON response from Facebook');
                              throw new Error(err);                
                          }
                          if (json.error) {
                            throw new Error(json.error.message);
                          } else {
                            controller.config.page = json; 
                          }
                        }
                    });
              
              
              }
            }
        });
};


module.exports = function(controller) {

    debug('Subscribing to Facebook events...');
    request.post('https://graph.facebook.com/me/subscribed_apps?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not subscribe to page messages!');
                throw new Error(err);
            } else {
                debug('Successfully subscribed to Facebook events:', body);
                controller.startTicking();
            }
        });

};

module.exports = function(controller) {

    debug('Configuring Facebook thread settings...');
    controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!');
    controller.api.thread_settings.get_started('sample_get_started_payload');
    controller.api.thread_settings.menu([
        {
            "type":"postback",
            "title":"Hello",
            "payload":"hello"
        },
        {
            "type":"postback",
            "title":"Help",
            "payload":"help"
        },
        {
          "type":"web_url",
          "title":"Botkit Docs",
          "url":"https://github.com/howdyai/botkit/blob/master/readme-facebook.md"
        },
    ]);

}

module.exports = function(controller, bot) {


    var webserver = express();
    webserver.use(bodyParser.json());
    webserver.use(bodyParser.urlencoded({ extended: true }));

    // import express middlewares that are present in /components/express_middleware
    var normalizedPath = require("path").join(__dirname, "express_middleware");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
        require("./express_middleware/" + file)(webserver, controller);
    });

    webserver.use(express.static('public'));


    webserver.listen(process.env.PORT || 3000, null, function() {

        debug('Express webserver configured and listening at http://localhost:' + process.env.PORT || 3000);

    });

    // import all the pre-defined routes that are present in /components/routes
    var normalizedPath = require("path").join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
      require("./routes/" + file)(webserver, controller);
    });

    controller.webserver = webserver;

    return webserver;

}

var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.page_token) {
    console.log('Error: Specify a Facebook page_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify a Facebook verify_token in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.facebookbot({
    // debug: true,
    receive_via_postback: true,
    verify_token: process.env.verify_token,
    access_token: process.env.page_token,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Facebook to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Set up Facebook "thread settings" such as get started button, persistent menu
require(__dirname + '/components/thread_settings.js')(controller);


// Send an onboarding message when a user activates the bot
require(__dirname + '/components/onboarding.js')(controller);

// Enable Dashbot.io plugin
require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
require("fs").readdirSync(normalizedPath).forEach(function(file) {
  require("./skills/" + file)(controller);
});


// This captures and evaluates any message sent to the bot as a DM
// or sent to the bot in the form "@bot message" and passes it to
// Botkit Studio to evaluate for trigger words and patterns.
// If a trigger is matched, the conversation will automatically fire!
// You can tie into the execution of the script using the functions
// controller.studio.before, controller.studio.after and controller.studio.validate
if (process.env.studio_token) {
    controller.on('message_received', function(bot, message) {
        if (message.text) {
            controller.studio.runTrigger(bot, message.text, message.user, message.channel).then(function(convo) {
                if (!convo) {
                    // no trigger was matched
                    // If you want your bot to respond to every message,
                    // define a 'fallback' script in Botkit Studio
                    // and uncomment the line below.
                    controller.studio.run(bot, 'fallback', message.user, message.channel);
                } else {
                    // set variables here that are needed for EVERY script
                    // use controller.studio.before('script') to set variables specific to a script
                    convo.setVar('current_time', new Date());
                }
            }).catch(function(err) {
                if (err) {
                    bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err);
                    debug('Botkit Studio: ', err);
                }
            });
        }
    });
} else {
    console.log('~~~~~~~~~~');
    console.log('NOTE: Botkit Studio functionality has not been enabled');
    console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
}

function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('page_token=<MY PAGE TOKEN> verify_token=<MY VERIFY TOKEN> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Facebook token here: https://developers.facebook.com/docs/messenger-platform/implementation')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}

var request = require('request');
var debug = require('debug')('botkit:get_app_id');

module.exports = function(controller) {

    debug('Getting Facebook App ID...');
    request.get('https://graph.facebook.com/app/?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not get Facebook App ID! Check your page token.');
                throw new Error(err);
            } else {
              var json = null;
              try {
                  json = JSON.parse(body);
              } catch(err) {
                  debug('Error parsing JSON response from Facebook');
                  throw new Error(err);                
              }
              if (json.error) {
                throw new Error(json.error.message);
              } else {
                controller.config.app = json; 


                debug('Getting Facebook Page ID...');
                request.get('https://graph.facebook.com/me?access_token=' + controller.config.access_token,
                    function(err, res, body) {
                        if (err) {
                            debug('Could not get Facebook Page ID! Check your page token.');
                            throw new Error(err);
                        } else {
                          var json = null;
                          try {
                              json = JSON.parse(body);
                          } catch(err) {
                              debug('Error parsing JSON response from Facebook');
                              throw new Error(err);                
                          }
                          if (json.error) {
                            throw new Error(json.error.message);
                          } else {
                            controller.config.page = json; 
                          }
                        }
                    });
              
              
              }
            }
        });
};


module.exports = function(controller) {

    debug('Subscribing to Facebook events...');
    request.post('https://graph.facebook.com/me/subscribed_apps?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not subscribe to page messages!');
                throw new Error(err);
            } else {
                debug('Successfully subscribed to Facebook events:', body);
                controller.startTicking();
            }
        });

};

module.exports = function(controller) {

    debug('Configuring Facebook thread settings...');
    controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!');
    controller.api.thread_settings.get_started('sample_get_started_payload');
    controller.api.thread_settings.menu([
        {
            "type":"postback",
            "title":"Hello",
            "payload":"hello"
        },
        {
            "type":"postback",
            "title":"Help",
            "payload":"help"
        },
        {
          "type":"web_url",
          "title":"Botkit Docs",
          "url":"https://github.com/howdyai/botkit/blob/master/readme-facebook.md"
        },
    ]);

}

module.exports = function(controller, bot) {


    var webserver = express();
    webserver.use(bodyParser.json());
    webserver.use(bodyParser.urlencoded({ extended: true }));

    // import express middlewares that are present in /components/express_middleware
    var normalizedPath = require("path").join(__dirname, "express_middleware");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
        require("./express_middleware/" + file)(webserver, controller);
    });

    webserver.use(express.static('public'));


    webserver.listen(process.env.PORT || 3000, null, function() {

        debug('Express webserver configured and listening at http://localhost:' + process.env.PORT || 3000);

    });

    // import all the pre-defined routes that are present in /components/routes
    var normalizedPath = require("path").join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
      require("./routes/" + file)(webserver, controller);
    });

    controller.webserver = webserver;

    return webserver;

}

var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.page_token) {
    console.log('Error: Specify a Facebook page_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify a Facebook verify_token in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.facebookbot({
    // debug: true,
    receive_via_postback: true,
    verify_token: process.env.verify_token,
    access_token: process.env.page_token,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Facebook to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Set up Facebook "thread settings" such as get started button, persistent menu
require(__dirname + '/components/thread_settings.js')(controller);


// Send an onboarding message when a user activates the bot
require(__dirname + '/components/onboarding.js')(controller);

// Enable Dashbot.io plugin
require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
require("fs").readdirSync(normalizedPath).forEach(function(file) {
  require("./skills/" + file)(controller);
});


// This captures and evaluates any message sent to the bot as a DM
// or sent to the bot in the form "@bot message" and passes it to
// Botkit Studio to evaluate for trigger words and patterns.
// If a trigger is matched, the conversation will automatically fire!
// You can tie into the execution of the script using the functions
// controller.studio.before, controller.studio.after and controller.studio.validate
if (process.env.studio_token) {
    controller.on('message_received', function(bot, message) {
        if (message.text) {
            controller.studio.runTrigger(bot, message.text, message.user, message.channel).then(function(convo) {
                if (!convo) {
                    // no trigger was matched
                    // If you want your bot to respond to every message,
                    // define a 'fallback' script in Botkit Studio
                    // and uncomment the line below.
                    controller.studio.run(bot, 'fallback', message.user, message.channel);
                } else {
                    // set variables here that are needed for EVERY script
                    // use controller.studio.before('script') to set variables specific to a script
                    convo.setVar('current_time', new Date());
                }
            }).catch(function(err) {
                if (err) {
                    bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err);
                    debug('Botkit Studio: ', err);
                }
            });
        }
    });
} else {
    console.log('~~~~~~~~~~');
    console.log('NOTE: Botkit Studio functionality has not been enabled');
    console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
}

function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('page_token=<MY PAGE TOKEN> verify_token=<MY VERIFY TOKEN> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Facebook token here: https://developers.facebook.com/docs/messenger-platform/implementation')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}

var request = require('request');
var debug = require('debug')('botkit:get_app_id');

module.exports = function(controller) {

    debug('Getting Facebook App ID...');
    request.get('https://graph.facebook.com/app/?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not get Facebook App ID! Check your page token.');
                throw new Error(err);
            } else {
              var json = null;
              try {
                  json = JSON.parse(body);
              } catch(err) {
                  debug('Error parsing JSON response from Facebook');
                  throw new Error(err);                
              }
              if (json.error) {
                throw new Error(json.error.message);
              } else {
                controller.config.app = json; 


                debug('Getting Facebook Page ID...');
                request.get('https://graph.facebook.com/me?access_token=' + controller.config.access_token,
                    function(err, res, body) {
                        if (err) {
                            debug('Could not get Facebook Page ID! Check your page token.');
                            throw new Error(err);
                        } else {
                          var json = null;
                          try {
                              json = JSON.parse(body);
                          } catch(err) {
                              debug('Error parsing JSON response from Facebook');
                              throw new Error(err);                
                          }
                          if (json.error) {
                            throw new Error(json.error.message);
                          } else {
                            controller.config.page = json; 
                          }
                        }
                    });
              
              
              }
            }
        });
};


module.exports = function(controller) {

    debug('Subscribing to Facebook events...');
    request.post('https://graph.facebook.com/me/subscribed_apps?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not subscribe to page messages!');
                throw new Error(err);
            } else {
                debug('Successfully subscribed to Facebook events:', body);
                controller.startTicking();
            }
        });

};

module.exports = function(controller) {

    debug('Configuring Facebook thread settings...');
    controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!');
    controller.api.thread_settings.get_started('sample_get_started_payload');
    controller.api.thread_settings.menu([
        {
            "type":"postback",
            "title":"Hello",
            "payload":"hello"
        },
        {
            "type":"postback",
            "title":"Help",
            "payload":"help"
        },
        {
          "type":"web_url",
          "title":"Botkit Docs",
          "url":"https://github.com/howdyai/botkit/blob/master/readme-facebook.md"
        },
    ]);

}

module.exports = function(controller, bot) {


    var webserver = express();
    webserver.use(bodyParser.json());
    webserver.use(bodyParser.urlencoded({ extended: true }));

    // import express middlewares that are present in /components/express_middleware
    var normalizedPath = require("path").join(__dirname, "express_middleware");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
        require("./express_middleware/" + file)(webserver, controller);
    });

    webserver.use(express.static('public'));


    webserver.listen(process.env.PORT || 3000, null, function() {

        debug('Express webserver configured and listening at http://localhost:' + process.env.PORT || 3000);

    });

    // import all the pre-defined routes that are present in /components/routes
    var normalizedPath = require("path").join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
      require("./routes/" + file)(webserver, controller);
    });

    controller.webserver = webserver;

    return webserver;

}

var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.page_token) {
    console.log('Error: Specify a Facebook page_token in environment.');
    usage_tip();
    process.exit(1);
}

if (!process.env.verify_token) {
    console.log('Error: Specify a Facebook verify_token in environment.');
    usage_tip();
    process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.facebookbot({
    // debug: true,
    receive_via_postback: true,
    verify_token: process.env.verify_token,
    access_token: process.env.page_token,
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri,
});

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

// Tell Facebook to start sending events to this application
require(__dirname + '/components/subscribe_events.js')(controller);

// Set up Facebook "thread settings" such as get started button, persistent menu
require(__dirname + '/components/thread_settings.js')(controller);


// Send an onboarding message when a user activates the bot
require(__dirname + '/components/onboarding.js')(controller);

// Enable Dashbot.io plugin
require(__dirname + '/components/plugin_dashbot.js')(controller);

var normalizedPath = require("path").join(__dirname, "skills");
require("fs").readdirSync(normalizedPath).forEach(function(file) {
  require("./skills/" + file)(controller);
});


// This captures and evaluates any message sent to the bot as a DM
// or sent to the bot in the form "@bot message" and passes it to
// Botkit Studio to evaluate for trigger words and patterns.
// If a trigger is matched, the conversation will automatically fire!
// You can tie into the execution of the script using the functions
// controller.studio.before, controller.studio.after and controller.studio.validate
if (process.env.studio_token) {
    controller.on('message_received', function(bot, message) {
        if (message.text) {
            controller.studio.runTrigger(bot, message.text, message.user, message.channel).then(function(convo) {
                if (!convo) {
                    // no trigger was matched
                    // If you want your bot to respond to every message,
                    // define a 'fallback' script in Botkit Studio
                    // and uncomment the line below.
                    controller.studio.run(bot, 'fallback', message.user, message.channel);
                } else {
                    // set variables here that are needed for EVERY script
                    // use controller.studio.before('script') to set variables specific to a script
                    convo.setVar('current_time', new Date());
                }
            }).catch(function(err) {
                if (err) {
                    bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err);
                    debug('Botkit Studio: ', err);
                }
            });
        }
    });
} else {
    console.log('~~~~~~~~~~');
    console.log('NOTE: Botkit Studio functionality has not been enabled');
    console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
}

function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Studio Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('page_token=<MY PAGE TOKEN> verify_token=<MY VERIFY TOKEN> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Facebook token here: https://developers.facebook.com/docs/messenger-platform/implementation')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}

var request = require('request');
var debug = require('debug')('botkit:get_app_id');

module.exports = function(controller) {

    debug('Getting Facebook App ID...');
    request.get('https://graph.facebook.com/app/?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not get Facebook App ID! Check your page token.');
                throw new Error(err);
            } else {
              var json = null;
              try {
                  json = JSON.parse(body);
              } catch(err) {
                  debug('Error parsing JSON response from Facebook');
                  throw new Error(err);                
              }
              if (json.error) {
                throw new Error(json.error.message);
              } else {
                controller.config.app = json; 


                debug('Getting Facebook Page ID...');
                request.get('https://graph.facebook.com/me?access_token=' + controller.config.access_token,
                    function(err, res, body) {
                        if (err) {
                            debug('Could not get Facebook Page ID! Check your page token.');
                            throw new Error(err);
                        } else {
                          var json = null;
                          try {
                              json = JSON.parse(body);
                          } catch(err) {
                              debug('Error parsing JSON response from Facebook');
                              throw new Error(err);                
                          }
                          if (json.error) {
                            throw new Error(json.error.message);
                          } else {
                            controller.config.page = json; 
                          }
                        }
                    });
              
              
              }
            }
        });
};


module.exports = function(controller) {

    debug('Subscribing to Facebook events...');
    request.post('https://graph.facebook.com/me/subscribed_apps?access_token=' + controller.config.access_token,
        function(err, res, body) {
            if (err) {
                debug('Could not subscribe to page messages!');
                throw new Error(err);
            } else {
                debug('Successfully subscribed to Facebook events:', body);
                controller.startTicking();
            }
        });

};

module.exports = function(controller) {

    debug('Configuring Facebook thread settings...');
    controller.api.thread_settings.greeting('Hello! I\'m a Botkit bot!');
    controller.api.thread_settings.get_started('sample_get_started_payload');
    controller.api.thread_settings.menu([
        {
            "type":"postback",
            "title":"Hello",
            "payload":"hello"
        },
        {
            "type":"postback",
            "title":"Help",
            "payload":"help"
        },
        {
          "type":"web_url",
          "title":"Botkit Docs",
          "url":"https://github.com/howdyai/botkit/blob/master/readme-facebook.md"
        },
    ]);

}

module.exports = function(controller, bot) {


    var webserver = express();
    webserver.use(bodyParser.json());
    webserver.use(bodyParser.urlencoded({ extended: true }));

    // import express middlewares that are present in /components/express_middleware
    var normalizedPath = require("path").join(__dirname, "express_middleware");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
        require("./express_middleware/" + file)(webserver, controller);
    });

    webserver.use(express.static('public'));


    webserver.listen(process.env.PORT || 3000, null, function() {

        debug('Express webserver configured and listening at http://localhost:' + process.env.PORT || 3000);

    });

    // import all the pre-defined routes that are present in /components/routes
    var normalizedPath = require("path").join(__dirname, "routes");
    require("fs").readdirSync(normalizedPath).forEach(function(file) {
      require("./routes/" + file)(webserver, controller);
    });

    controller.webserver = webserver;

    return webserver;

}
