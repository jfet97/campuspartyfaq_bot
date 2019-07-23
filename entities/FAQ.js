const { collections } = require("../maps/collections");

module.exports.FAQ = class {
    constructor(question, answer) {
        Object.assign(this, { question, answer, collection: collections.faqs })
    }
}