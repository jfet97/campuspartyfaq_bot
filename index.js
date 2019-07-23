const BotConstructor = require("node-telegram-bot-api");
const { TelegramFlowFactory } = require("ntfm");
const { InlineKeyboard } = require("node-telegram-keyboard-wrapper");
const Datastore = require('nedb-promises');
const { FAQ } = require('./entities/FAQ');
const { Admin } = require('./entities/Admin');
const { collections } = require('./maps/collections');


const datastore = Datastore.create('./datastore.db');
let FAQS;
let admins;
let welcomeMessage;

// function to update local data after nedb changes
async function updateData() {
	FAQS = await datastore.find({ collection: collections.faqs });
	admins = await datastore.find({ collection: collections.admins });
	welcomeMessage = (await datastore.find({ _id: "welcomeMessage" }))[0].message;
}

async function addAdmin(admin) {
	await datastore.insert(admin);
	await updateData();
}

async function removeAdmin(id) {
	await datastore.remove({ telegramID: id });
	await updateData();
}

async function addFAQ(faq) {
	await datastore.insert(faq);
	await updateData();
}

async function removeFAQ(id) {
	await datastore.remove({ _id: id });
	await updateData();
}

async function updateWelcomeMessage(msg) {
	await datastore.update({ _id: "welcomeMessage" }, { message: msg });
	await updateData();
}



(async function main() {

	const bot = new BotConstructor(process.env.TOKEN, {
		polling: true
	});

	bot.on("polling_error", (msg) => console.log("polling_error: ", msg));

	// init data
	await updateData();


	// admin managment flows
	const adminsAddFlow = TelegramFlowFactory();
	const adminsRemoveFlow = TelegramFlowFactory();
	// FAQS managment flow
	const faqsAddFlow = TelegramFlowFactory();
	const faqsRemoveFlow = TelegramFlowFactory();

	function isAFlowActive(id) {
		return adminsAddFlow.hasInQueue(id) || adminsRemoveFlow.hasInQueue(id) || faqsAddFlow.hasInQueue(id) || faqsRemoveFlow.hasInQueue(id);
	}

	// flows runner
	bot.on("message", msg => {

		// if the message is a bot_command or if there are no actions in queue
		// adminsAddFlow() won't be called
		if (!hasEntity("bot_command", msg.entities) && adminsAddFlow.hasInQueue(msg.from.id)) {
			// data sent with each execute call is the msg object
			// so each action will have all the information it might need
			adminsAddFlow.execute(msg.from.id, msg);
		}

		// if the message is a bot_command or if there are no actions in queue
		// adminsRemoveFlow() won't be called
		if (!hasEntity("bot_command", msg.entities) && adminsRemoveFlow.hasInQueue(msg.from.id)) {
			// data sent with each execute call is the msg object
			// so each action will have all the information it might need
			adminsRemoveFlow.execute(msg.from.id, msg);
		}

		// if the message is a bot_command or if there are no actions in queue
		// faqsAddFlow() won't be called
		if (!hasEntity("bot_command", msg.entities) && faqsAddFlow.hasInQueue(msg.from.id)) {
			// data sent with each execute call is the msg object
			// so each action will have all the information it might need
			faqsAddFlow.execute(msg.from.id, msg);
		}

		// if the message is a bot_command or if there are no actions in queue
		// faqsRemoveFlow() won't be called
		if (!hasEntity("bot_command", msg.entities) && faqsRemoveFlow.hasInQueue(msg.from.id)) {
			// data sent with each execute call is the msg object
			// so each action will have all the information it might need
			faqsRemoveFlow.execute(msg.from.id, msg);
		}

		function hasEntity(entity, entities) {
			if (!entities || !entities.length) {
				return false;
			}
			return entities.some(e => e.type === entity);
		}
	});

	// clear flows
	bot.onText(/\/clear/, msg => {

		const userId = msg.from.id;

		// is an admin? if not the user cannot use this command
		const user = admins.find(admin => admin.telegramID === userId);

		if (!user) {
			bot.sendMessage(msg.from.id, 'Non sei autorizzato ad eseguire questa operazione!');
			return;
		}

		let messageToBeSent = "";

		adminsAddFlow.clear(userId);
		adminsRemoveFlow.clear(userId);
		faqsAddFlow.clear(userId);
		faqsRemoveFlow.clear(userId);
		messageToBeSent += "You have successfully aborted all the operations.";

		bot.sendMessage(userId, messageToBeSent);
	});

	// start the adminsAddFlow flow
	bot.onText(/\/addadmin/, msg => {

		const userId = msg.from.id;

		// is a super admin? if not the user cannot use this command
		const user = admins.find(admin => admin.telegramID === userId);

		if (!user || !user.isSuper) {
			bot.sendMessage(msg.from.id, 'Non sei autorizzato ad eseguire questa operazione!');
			return;
		}

		if (!isAFlowActive(userId)) {

			bot.sendMessage(userId, `Inviami l'id dell'utente telegram che vuoi rendere admin`);

			adminsAddFlow.register(userId,
				data => {
					const futureID = Number(data.executeCallData.text);

					if (admins.map(admin => admin.telegramID).includes(futureID)) {
						bot.sendMessage(userId, `Questo utente è già admin, ritenta o digita /clear`);
						return { repeat: true };
					} else {
						bot.sendMessage(userId, `Questo admin sarà un superAdmin? Digita Y oppure n`);
						return { telegramID: futureID };
					}
				},
				async data => {
					const isSuper = (data.executeCallData.text === 'Y' || data.executeCallData.text === 'y');

					try {
						await addAdmin((new Admin(data.previousResult.telegramID, isSuper)));
					} catch {
						bot.sendMessage(userId, `Something went wrong. Operation was aborted`);
						adminsAddFlow.clear(userId);
						return;
					}

					bot.sendMessage(userId, `Hai inserito l'utente ${data.previousResult.telegramID} come ${isSuper ? 'super' : ''}Admin con successo!`);
				},

			);

		} else {
			bot.sendMessage(userId, "Unable to execute this command. First complete the previous operation or type /clear.");
		}
	});

	// start the adminsRemoveFlow flow
	bot.onText(/\/removeadmin/, msg => {

		const userId = msg.from.id;

		// is a super admin? if not the user cannot use this command
		const user = admins.find(admin => admin.telegramID === userId);

		if (!user || !user.isSuper) {
			bot.sendMessage(msg.from.id, 'Non sei autorizzato ad eseguire questa operazione!');
			return;
		}

		if (!isAFlowActive(userId)) {

			bot.sendMessage(userId, `Inviami l'id dell'utente telegram che vuoi togliere da admin`);

			adminsRemoveFlow.register(userId,
				async data => {
					const ID = Number(data.executeCallData.text);

					if (!admins.map(admin => admin.telegramID).includes(ID)) {
						bot.sendMessage(userId, `Questo utente non è admin, ritenta o digita /clear`);
						return { repeat: true };
					} else {
						bot.sendMessage(userId, `Rimozione in corso...`);
						try {
							await removeAdmin(ID)
							bot.sendMessage(userId, `Hai rimosso l'utente ${ID} dall'incarico di Admin con successo!`);

						} catch {
							bot.sendMessage(userId, `Something went wrong. Operation was aborted`);
							adminsRemoveFlow.clear(userId);
						}
					}
				},

			);

		} else {
			bot.sendMessage(userId, "Unable to execute this command. First complete the previous operation or type /clear.");
		}
	});

	// start the faqsAddFlow flow
	bot.onText(/\/addfaq/, msg => {

		const userId = msg.from.id;

		// is an admin? if not the user cannot use this command
		const user = admins.find(admin => admin.telegramID === userId);

		if (!user) {
			bot.sendMessage(msg.from.id, 'Non sei autorizzato ad eseguire questa operazione!');
			return;
		}

		if (!isAFlowActive(userId)) {

			bot.sendMessage(userId, `Inviami il testo della domanda della nuova FAQ`);

			faqsAddFlow.register(userId,
				data => {
					const newQuestion = data.executeCallData.text;


					if (newQuestion.length > 60) {
						bot.sendMessage(userId, `Il limite di caratteri per una domanda è 60. Riarrangiala o digita /clear`);
						return { repeat: true };
					}

					if (FAQS.map(faq => faq.question).includes(newQuestion)) {
						bot.sendMessage(userId, `Questa FAQ è già presente, ritenta o digita /clear`);
						return { repeat: true };
					} else {
						bot.sendMessage(userId, `Ottimo, ora inviami la risposta`);
						return { question: newQuestion };
					}
				},
				async data => {
					const { question } = data.previousResult;
					const newAnswer = data.executeCallData.text;

					try {
						await addFAQ((new FAQ(question, newAnswer)));
					} catch {
						bot.sendMessage(userId, `Something went wrong. Operation was aborted`);
						faqsAddFlow.clear(userId);
						return;
					}

					bot.sendMessage(userId, `Hai inserito la FAQ "${question}" con risposta "${newAnswer}" con successo!`);
				},

			);

		} else {
			bot.sendMessage(userId, "Unable to execute this command. First complete the previous operation or type /clear.");
		}
	});

	// start the faqsRemoveFlow flow
	bot.onText(/\/removefaq/, async msg => {

		const userId = msg.from.id;

		// is an admin? if not the user cannot use this command
		const user = admins.find(admin => admin.telegramID === userId);

		if (!user) {
			bot.sendMessage(msg.from.id, 'Non sei autorizzato ad eseguire questa operazione!');
			return;
		}

		if (!isAFlowActive(userId)) {

			let ik = new InlineKeyboard();

			const questions = FAQS.map(faq => faq.question);
			questions.forEach(question => ik.addRow({ text: question, callback_data: question }));

			let res = await bot.sendMessage(userId, `Scegli quale FAQ eliminare`, ik.build());

			faqsRemoveFlow.register(userId,
				async data => {


					const chosenQuestion = data.executeCallData.data;
					const queryId = data.executeCallData.id;

					if (!chosenQuestion && !queryId) {
						// if those data are missing, it means that the current action was wrongly triggered
						// by a normal message instead of a callback_query

						bot.deleteMessage(res.chat.id, res.message_id)


						ik = new InlineKeyboard();
						questions.forEach(question => ik.addRow({ text: question, callback_data: question }));


						res = await bot.sendMessage(userId, `Scegli quale FAQ eliminare`, ik.build());
						return { repeat: true };
					}

					bot.editMessageText("Thanks!", {
						message_id: data.executeCallData.message.message_id,
						chat_id: data.executeCallData.message.chat.id,
					});


					bot.answerCallbackQuery(queryId, { text: `La FAQ selezionata sta per essere rimossa` });

					try {
						await removeFAQ(FAQS.find(faq => faq.question === chosenQuestion)._id);
					} catch {
						bot.sendMessage(userId, `Something went wrong. Operation was aborted`);
						faqsRemoveFlow.clear(userId);
						return;
					}

					bot.sendMessage(userId, `Hai eliminato la FAQ "${chosenQuestion}" con successo!`);

				},

			);

		} else {
			bot.sendMessage(userId, "Unable to execute this command. First complete the previous operation or type /clear.");
		}
	});


	// telegram events callbacks
	bot.onText(/\/start/, msg => {

		const userId = msg.from.id;

		bot.sendMessage(userId, welcomeMessage);

	});

	// show the faq list to an user
	bot.onText(/\/showfaqlist/, async msg => {

		if (msg.text.match(/\/setwelcomemessage/)) {
			return;
		}

		const userId = msg.from.id;

		const ik = new InlineKeyboard();

		const questions = FAQS.map(faq => faq.question);

		questions.forEach(question => ik.addRow({ text: question, callback_data: question }));

		try {
			bot.sendMessage(userId, `Scegli una domanda per la quale vuoi una risposta`, ik.build());
		} catch (e) {
			console.log(e)
		}
	});

	// allow to change the welcome Message
	bot.onText(/\/setwelcomemessage/, async msg => {

		const userId = msg.from.id;

		// is an admin? if not the user cannot use this command
		const user = admins.find(admin => admin.telegramID === userId);

		if (!user) {
			bot.sendMessage(msg.from.id, 'Non sei autorizzato ad eseguire questa operazione!');
			return;
		}

		const res = msg.text.replace(/\/setwelcomemessage/, "").trim();

		if (res) {
			try {
				await updateWelcomeMessage(res);
			} catch {
				bot.sendMessage(userId, `Something went wrong. Operation was aborted`);
			}
		}

	});

	bot.on("callback_query", msg => {

		// if there are no actions in queue
		// adminsAddFlow.execute() won't be called
		if (adminsAddFlow.hasInQueue(msg.from.id)) {
			// data sent with each execute call is the msg object
			// so each action will have all the information it might need
			adminsAddFlow.execute(msg.from.id, msg);
			return;
		}

		// if there are no actions in queue
		// adminsRemoveFlow.execute() won't be called
		if (adminsRemoveFlow.hasInQueue(msg.from.id)) {
			// data sent with each execute call is the msg object
			// so each action will have all the information it might need
			adminsRemoveFlow.execute(msg.from.id, msg);
			return;
		}

		// if there are no actions in queue
		// faqsAddFlow.execute() won't be called
		if (faqsAddFlow.hasInQueue(msg.from.id)) {
			// data sent with each execute call is the msg object
			// so each action will have all the information it might need
			faqsAddFlow.execute(msg.from.id, msg);
			return;
		}

		// if there are no actions in queue
		// faqsRemoveFlow.execute() won't be called
		if (faqsRemoveFlow.hasInQueue(msg.from.id)) {
			// data sent with each execute call is the msg object
			// so each action will have all the information it might need
			faqsRemoveFlow.execute(msg.from.id, msg);
			return;
		}

		const userId = msg.from.id;
		const chosenQuestion = msg.data;
		const queryId = msg.id;

		const chosenFAQ = FAQS.find(faq => faq.question === chosenQuestion);
		const { question = "", answer = "" } = chosenFAQ || {};

		bot.answerCallbackQuery(queryId)
		bot.sendMessage(userId, `
		<b>Q: ${question}</b>\nA: ${answer}
		`, { parse_mode: "html" });

	});


})();





