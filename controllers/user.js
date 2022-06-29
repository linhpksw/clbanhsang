import { google } from 'googleapis';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
let requests = [];

export const userRequest = (req, res) => {
    // const request = req.body;
    // requests.push(request);
    // res.send(request);

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
            gsrun(client);
        }
    });

    async function gsrun(client) {
        const sheets = google.sheets({ version: 'v4', auth: client });
        const request = {
            spreadsheetId: process.env.SPREADSHEET_ID,
            range: 'Command!A1:B3',
        };

        try {
            const response = (await sheets.spreadsheets.values.get(request))
                .data;
            // console.log(response);
            res.send(response);
        } catch (err) {
            console.error(err);
        }
    }
};

export const getUserRequest = (req, res) => {
    res.send(requests);
};
