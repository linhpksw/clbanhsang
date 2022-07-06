// import { google } from 'googleapis';
import fetch from 'node-fetch';

import path from 'path';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

let requests = [];

export const userRequest = async (req, res) => {
    const webhook = req.body;
    const eventName = webhook.event_name;
    // const unixTimestamp = parseInt(webhook.timestamp);
    // const timeStamp = new Date(unixTimestamp);
    // const localeTimeStamp = timeStamp.toLocaleString('vi-VN');

    // const userId = webhook.sender.id;
    // const syntax = webhook.message.text;

    // sendMessage(userId, 'Thành công.');

    // if (eventName === 'user_send_text') {
    //     const createNewToken = await getAccessToken();
    //     console.log(createNewToken);
    //     return res.send('Success');
    // } else {
    //     return res.send('Err');
    // }

    // const client = new google.auth.JWT(
    //     process.env.CLIENT_EMAIL,
    //     null,
    //     process.env.PRIVATE_KEY,
    //     [process.env.SCOPE]
    // );

    // client.authorize((err, token) => {
    //     if (err) {
    //         console.log(err);
    //         return;
    //     } else {
    //         console.log('Connect to Google Sheets success!');
    //         getAccessToken(client);
    //     }
    // });

    // async function getAccessToken(client) {
    //     const sheets = google.sheets({ version: 'v4', auth: client });
    //     const request = {
    //         spreadsheetId: process.env.SPREADSHEET_ID,
    //         range: 'Key!A1:B2',
    //     };

    //     try {
    //         const response = (await sheets.spreadsheets.values.get(request))
    //             .data;
    //         res.send(response);
    //     } catch (err) {
    //         console.error(err);
    //     }
    // }
};

export const getUserRequest = (req, res) => {
    res.send(requests);
};

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
