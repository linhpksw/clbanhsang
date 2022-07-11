import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import { readTokenFromDB, client, insertManyToDB } from './mongo.js';

export const appsheetRequest = async (req, res) => {
    const webhook = req.body;

    let {
        studentId,
        classId,
        enrollDate,
        birthYear,
        firstName,
        lastName,
        subject,
        studentPhone,
        school,
        studentEmail,
        firstParentName,
        firstParentPhone,
        secondParentName,
        secondParentPhone,
    } = webhook;

    console.log(
        studentId,
        classId,
        enrollDate,
        birthYear,
        firstName,
        lastName,
        subject,
        studentPhone,
        school,
        studentEmail,
        firstParentName,
        firstParentPhone,
        secondParentName,
        secondParentPhone
    );

    res.send('Success');
    return;

    const fullName = `${firstName} ${lastName}`;

    try {
        await client.connect();
        const db = client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const zaloColl = db.collection('zaloUsers');
        const classColl = db.collection('classUsers');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
