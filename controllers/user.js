import { google } from 'googleapis';
import fetch from 'node-fetch';
import { readFile, writeFile } from 'fs';

import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

let requests = [];

export const userRequest = (req, res) => {
    const webhook = req.body;
    const eventName = webhook.event_name;
    const unixTimestamp = parseInt(webhook.timestamp);
    const timeStamp = new Date(unixTimestamp);
    const localeTimeStamp = timeStamp.toLocaleString('vi-VN');

    const userId = webhook.sender.id;
    const syntax = webhook.message.text;

    if (eventName !== 'user_send_text')
        return sendMessage(userId, 'Cú pháp không đúng.');

    if (eventName === 'anonymous_send_text') {
        res.send(
            `PH/HS cần nhấn nút 'Quan tâm' để có thể thực hiện các lệnh tra cứu. `
        );
        return;
    }

    const client = new google.auth.JWT(
        process.env.CLIENT_EMAIL,
        null,
        process.env.PRIVATE_KEY,
        [process.env.SCOPE]
    );

    client.authorize((err, token) => {
        if (err) {
            console.log(err);
            return;
        } else {
            console.log('Connect to Google Sheets success!');
            getAccessToken(client);
        }
    });

    async function getAccessToken(client) {
        const sheets = google.sheets({ version: 'v4', auth: client });
        const request = {
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: 'Key!A1:B2',
        };

        try {
            const response = (await sheets.spreadsheets.values.get(request))
                .data;
            res.send(response);
        } catch (err) {
            console.error(err);
        }
    }
};

export const getUserRequest = (req, res) => {
    res.send(requests);
};

function storeNewToken(newRT, newAT) {
    readFile('../.env', (err, data) => {
        if (err) throw err;
        const contents = data.toString();
        const oldRefeshToken = contents.split('\r\n')[1];
        const oldAccessToken = contents.split('\r\n')[2];

        const oldToken = `${oldRefeshToken}\r\n${oldAccessToken}`;

        const newRefreshToken = `REFRESH_TOKEN="${newRT}"`;
        const newAccessToken = `ACCESS_TOKEN="${newAT}"`;

        const newToken = `${newRefreshToken}\r\n${newAccessToken}`;

        const replaced = contents.replace(oldToken, newToken);

        writeFile('../.env', replaced, (err) => {
            if (err) throw err;
        });
    });
}

async function getAccessToken() {
    const refreshToken = process.env.REFRESH_TOKEN;
    const SECRET_KEY = process.env.SECRET_KEY;
    const APP_ID = process.env.APP_ID;

    const URL = `https://oauth.zaloapp.com/v4/oa/access_token?refresh_token=${refreshToken}&app_id=${APP_ID}&grant_type=refresh_token`;

    const headers = {
        secret_key: SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
    };

    const response = await fetch(URL, {
        method: 'post',
        headers: headers,
    });
    const { access_token, refresh_token } = await response.json();

    storeNewToken(refresh_token, access_token);
}

async function sendMessage(userId, message) {
    const accessToken = process.env.ACCESS_TOKEN;
    const headers = {
        access_token: accessToken,
        'Content-Type': 'application/json',
    };

    const URL = `https://openapi.zalo.me/v2.0/oa/message?`;

    const content = {
        recipient: { user_id: `${userId}` },
        message: { text: `${message}` },
    };

    const response = await fetch(URL, {
        method: 'post',
        headers: headers,
        body: JSON.stringify(content),
    });

    // const jsonResponse = await response.json();
    // console.log(jsonResponse);
    getAccessToken();
}
