const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

const TIMEZONE = "Europe/Madrid";

function buildAuthorizationHeader(accessToken) {
  return { authorization: `Bearer ${accessToken}` };
}

function getTodayDate() {
  return dayjs().tz(TIMEZONE).format("YYYY-MM-DD");
}

function getMillisUntil(hour, minutes) {
  const now = dayjs();
  const todayMadrid = now.tz(TIMEZONE).format("YYYY-MM-DD");
  const target = dayjs.tz(
    `${todayMadrid}T${padLeft(hour)}:${padLeft(minutes)}:00`,
    TIMEZONE
  );
  return target.valueOf() - now.valueOf();
}

function padLeft(value) {
  if (value >= 10) {
    return value.toString();
  }

  return `0${value}`;
}

function getSlotHour(slot, minutes) {
  const todayDate = getTodayDate();
  const mins = padLeft(minutes);

  switch (slot) {
    case 1: {
      return `${todayDate}T${padLeft(process.env.START_HOUR)}:${mins}:00+01:00`;
    }
    case 2: {
      return `${todayDate}T${padLeft(process.env.BREAK_START_HOUR)}:${mins}:00+01:00`;
    }
    case 3: {
      return `${todayDate}T${padLeft(process.env.BREAK_END_HOUR)}:${mins}:00+01:00`;
    }
    case 4: {
      return `${todayDate}T${padLeft(process.env.END_HOUR)}:${mins}:00+01:00`;
    }
  }
}

function buildSign(userId, slot, minutes) {
  const date = getSlotHour(slot, minutes);

  return {
    DeviceId: "WebApp",
    EndDate: date,
    StartDate: date,
    TimezoneOffset: -60,
    UserId: userId,
  };
}

module.exports = {
  buildAuthorizationHeader,
  getTodayDate,
  getMillisUntil,
  padLeft,
  buildSign,
};
