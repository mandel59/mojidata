"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tokenizeIdsList = tokenizeIdsList;
const idsdb_utils_1 = require("@mandel59/idsdb-utils");
function tokenizeIdsList(idslist) {
    const idslistTokenized = idslist.map(idsdb_utils_1.tokenizeIDS).map(idsdb_utils_1.expandOverlaid);
    /** ids list without variable constraints. variables are replaced into placeholder token ？ */
    const idslistWithoutVC = idslistTokenized.map((x) => x.map((y) => y.map((z) => (/^[a-zａ-ｚ]$/.test(z) ? "？" : z))));
    return {
        forQuery: idslistWithoutVC,
        forAudit: idslistTokenized,
    };
}
