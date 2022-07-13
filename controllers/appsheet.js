import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import { readTokenFromDB, client, insertOneUser } from './mongo.js';

export const appsheetRequest = async (req, res) => {
    try {
        await client.connect();
        const db = client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const zaloColl = db.collection('zaloUsers');
        const classColl = db.collection('classUsers');

        const { accessToken, refreshToken } = await readTokenFromDB(tokenColl);

        const webhook = req.body;

        for (const property in webhook) {
            if (webhook[property] == '') {
                webhook[property] = null;
            }
        }

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

        const fullName = `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();

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
            school: school,
            studentEmail: studentEmail,
            firstParentName: firstParentName,
            firstParentPhone: firstParentPhone,
            secondParentName: secondParentName,
            secondParentPhone: secondParentPhone,
        };

        await insertOneUser(classColl, newDoc);

        const successContent = `✅ Thêm mới thành công vào cơ sở dữ liệu!\n\nTên học sinh: ${fullName}\nMã lớp: ${classId}\nID HS: ${studentId}`;
        const result = await ZaloAPI.sendMessage(
            accessToken,
            '4966494673333610309',
            successContent
        );

        console.log(result);
        res.send('Success');
        return;
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const updateStudentRequest = async (req, res) => {
    try {
        await client.connect();
        const db = client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const zaloColl = db.collection('zaloUsers');
        const classColl = db.collection('classUsers');

        const { accessToken, refreshToken } = await readTokenFromDB(tokenColl);

        const webhook = req.body;
        const { studentId } = req.params;

        console.log(studentId);
        console.log(webhook);

        res.send('Success');
        return;
    } catch (err) {
        console.error(err);
    } finally {
    }
};
