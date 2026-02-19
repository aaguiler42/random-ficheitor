const dotenv = require("dotenv");
const axios = require("axios").default;
const qs = require("qs");
const cron = require("node-cron");
const express = require("express");
const fs = require("fs");
const path = require("path");

const utils = require("./utils");

if (process.env.NODE_ENV === "development") {
  dotenv.config();
}

const STATE_FILE = path.join(__dirname, "..", "state.json");

let dailyState = null;

function loadOrCreateDailyState() {
  const today = utils.getTodayDate();

  if (fs.existsSync(STATE_FILE)) {
    try {
      const stored = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (stored.date === today) {
        dailyState = stored;
        console.log(
          `Loaded today's state: workMinutes=${dailyState.workMinutes}, breakMinutes=${dailyState.breakMinutes}`
        );
        return dailyState;
      }
    } catch (_) {
      // corrupt file, regenerate
    }
  }

  dailyState = {
    date: today,
    workMinutes: Math.floor(Math.random() * 31),
    breakMinutes: Math.floor(Math.random() * 31),
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(dailyState, null, 2));
  console.log(
    `Generated new daily state: workMinutes=${dailyState.workMinutes}, breakMinutes=${dailyState.breakMinutes}`
  );
  return dailyState;
}

function getMillisUntil(hour, minutes) {
  const now = new Date();
  const target = new Date();
  target.setHours(parseInt(hour, 10), minutes, 0, 0);
  return target.getTime() - now.getTime();
}

function scheduleSlots(state) {
  const slots = [
    { slot: 1, hour: process.env.START_HOUR, minutes: state.workMinutes },
    { slot: 2, hour: process.env.BREAK_START_HOUR, minutes: state.breakMinutes },
    { slot: 3, hour: process.env.BREAK_END_HOUR, minutes: state.breakMinutes },
    { slot: 4, hour: process.env.END_HOUR, minutes: state.workMinutes },
  ];

  for (const { slot, hour, minutes } of slots) {
    const delay = getMillisUntil(hour, minutes);
    if (delay > 0) {
      setTimeout(main, delay);
      console.log(`Slot ${slot} scheduled at ${utils.padLeft(hour)}:${utils.padLeft(minutes)}`);
    } else {
      console.log(`Slot ${slot} (${utils.padLeft(hour)}:${utils.padLeft(minutes)}) already passed, skipping`);
    }
  }
}

async function login(username, password) {
  const body = { grant_type: "password", username, password };

  return axios
    .post(process.env.AUTH_URL, qs.stringify(body))
    .then((res) => res.data.access_token);
}

async function getUserId(accessToken) {
  const headers = utils.buildAuthorizationHeader(accessToken);

  return axios
    .get(`${process.env.API_URL}/users`, { headers })
    .then((res) => res.data.UserId);
}

async function getWorkingDay(userId, accessToken) {
  const todayDate = utils.getTodayDate();
  const headers = utils.buildAuthorizationHeader(accessToken);
  const params = {
    fromDate: todayDate,
    toDate: todayDate,
    pageIndex: 0,
    pageSize: 1,
  };

  return await axios
    .get(`${process.env.API_URL}/users/${userId}/diaries/presence`, { params, headers })
    .then((res) => res.data.Diaries[0]);
}

async function getSigns(accessToken) {
  const headers = utils.buildAuthorizationHeader(accessToken);

  return await axios
    .get(`${process.env.API_URL}/signs`, { headers })
    .then((res) => res.data);
}

async function postSign(userId, accessToken, slot, minutes) {
  const headers = utils.buildAuthorizationHeader(accessToken);
  const body = utils.buildSign(userId, slot, minutes);

  return await axios.post(`${process.env.API_URL}/svc/signs/signs`, body, { headers });
}

async function main() {
  const accessToken = await login(process.env.USERNAME, process.env.PASSWORD);
  const userId = await getUserId(accessToken);
  const workingDay = await getWorkingDay(userId, accessToken);

  if (workingDay.IsHoliday) {
    console.log("Holi... day! You don't need to clock in/out today :)");
    return;
  }

  const signs = await getSigns(accessToken);

  if (signs.length === 4) {
    console.log("You have already clocked in/out for all of the today slots :D");
    return;
  }

  const nextSlot = signs.length + 1;
  const slotMinutes =
    nextSlot === 1 || nextSlot === 4 ? dailyState.workMinutes : dailyState.breakMinutes;
  const signResponse = await postSign(userId, accessToken, nextSlot, slotMinutes);

  if (signResponse.status !== 201) {
    console.log(`There was an error clocking in/out for slot number: ${nextSlot}`);
    return;
  }

  console.log(`Clocked in/out successfully for slot number: ${nextSlot}`);
}

(async () => {
  try {
    const timezone = "Europe/Madrid";
    const app = express();

    // At midnight each weekday, generate new daily minutes and schedule that day's slots
    cron.schedule(
      "0 0 * * 1-5",
      () => {
        const state = loadOrCreateDailyState();
        scheduleSlots(state);
      },
      { timezone }
    );

    // Schedule today's slots on startup
    const state = loadOrCreateDailyState();
    scheduleSlots(state);

    app.get("/", (_, res) => {
      res.send("ficheitor is running");
    });

    app.listen(process.env.PORT, () => {
      console.log(`App listening on port ${process.env.PORT}`);
    });
  } catch (err) {
    console.error(err);
  }
})();
