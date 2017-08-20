const Conversation = require('../lib/conversation');

module.exports = function(controller) {

    // look for sticker, image and audio attachments
    // capture them, and fire special events
    controller.on('message_received', function(bot, message) {

        console.log (message);

        // return bot.reply(message, message.text)

        if (!message.text) {
            if (message.sticker_id) {
                controller.trigger('sticker_received', [bot, message]);
                return false;
            } else if (message.attachments && message.attachments[0]) {
                controller.trigger(message.attachments[0].type + '_received', [bot, message]);
                return false;
            }
        }

        return Conversation.converse(controller.storage, bot, message);

    });

};
