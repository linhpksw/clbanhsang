import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import { readTokenFromDB, client, insertOneUser } from './mongo.js';

export const appsheetRequest = async (req, res) => {
    const webhook = req.body;

    for (const property in webhook) {
        if (webhook[property] == '') {
            webhook[property] = null;
        }
    }

    console.log(webhook);

    res.send('Success');
    return;

    const fullName = `${firstName} ${lastName}`.trim();
    studentPhone == '' ? (studentPhone = null) : (studentPhone = studentPhone);
    school == '' ? (school = null) : (school = school);
    studentEmail == '' ? (studentEmail = null) : (studentEmail = studentEmail);
    firstParentName == '' ? (firstParentName = null) : (firstParentName = firstParentName);
    firstParentPhone == '' ? (firstParentPhone = null) : (firstParentPhone = firstParentPhone);
    secondParentName == '' ? (secondParentName = null) : (secondParentName = secondParentName);
    secondParentPhone == '' ? (secondParentPhone = null) : (secondParentPhone = secondParentPhone);

    const newDoc = {
        studentId: studentId,
        classId: classId,
        enrollDate: enrollDate,
        status: 'Học',
        birthYear: birthYear,
        fullName: fullName,
        subject: subject,
        leaveDate: null,
        studentPhone: studentPhone,
    };

    insertOneUser(classColl);

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
