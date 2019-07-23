// [650789883, 82262321];
const { collections } = require("../maps/collections");

module.exports.Admin = class {
    constructor(telegramID, isSuper) {
        Object.assign(this, { telegramID, isSuper, collection: collections.admins })
    }
}
