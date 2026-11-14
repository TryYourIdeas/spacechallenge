export const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ level, time: new Date().toISOString(), msg, ...extra }))
