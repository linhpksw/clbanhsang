import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import { readTokenFromDB, client, insertOneUser, updateTokenInDB, updateOneUser } from './mongo.js';

export const createStudentRequest = async (req, res) => {
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

        const fullName = `${firstName} ${lastName}`;

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

        insertOneUser(classColl, newDoc);

        const successContent = `✅ Thêm mới thành công!\n\nTên học sinh: ${fullName}\nMã lớp: ${classId}\nID HS: ${studentId}`;

        ZaloAPI.sendMessage(accessToken, '4966494673333610309', successContent);

        updateTokenInDB(tokenColl, refreshToken);

        res.send('Success');
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
            leaveDate,
            studentPhone,
            school,
            studentEmail,
            firstParentName,
            firstParentPhone,
            secondParentName,
            secondParentPhone,
        } = webhook;

        const fullName = `${firstName} ${lastName}`;
        let status;
        leaveDate !== null ? (status = 'Nghỉ') : (status = 'Học');

        const updateDoc = {
            studentId: studentId,
            classId: classId,
            enrollDate: enrollDate,
            status: status,
            birthYear: birthYear,
            fullName: fullName,
            subject: subject,
            leaveDate: leaveDate,
            studentPhone: studentPhone,
            school: school,
            studentEmail: studentEmail,
            firstParentName: firstParentName,
            firstParentPhone: firstParentPhone,
            secondParentName: secondParentName,
            secondParentPhone: secondParentPhone,
        };

        updateOneUser(classColl, { studentId: `${studentId}` }, updateDoc);

        const successContent = `✅ Cập nhật thành công!\n\nTên học sinh: ${fullName}\nMã lớp: ${classId}\nID HS: ${studentId}`;

        ZaloAPI.sendMessage(accessToken, '4966494673333610309', successContent);

        updateTokenInDB(tokenColl, refreshToken);

        res.send('Success');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
