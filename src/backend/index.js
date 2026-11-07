// Elige la implementación: real en Windows, demostración en el resto
// (o si se arranca con la variable TOOLBOX_MOCK=1).
const useMock = process.platform !== "win32" || process.env.TOOLBOX_MOCK === "1";
module.exports = useMock ? require("./mock") : require("./windows");
module.exports.isMock = useMock;
