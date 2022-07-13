import * as ZaloAPI from './zalo.js';
import { readTokenFromDB, client, insertOneUser, updateTokenInDB, updateOneUser } from './mongo.js';

export const createStudentRequest = async (req, res) => {
    try {
        await client.connect();
        const db = client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
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

        const successContent = `✅ Thêm mới thành công!\n\nID Lớp: ${classId}\n\nID HS: ${studentId}\n\nTên HS: ${fullName}`;
        await ZaloAPI.sendMessage(accessToken, '4966494673333610309', successContent);

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

        const successContent = `✅ Cập nhật thành công!\n\nID Lớp: ${classId}\n\nID HS: ${studentId}\n\nTên HS: ${fullName}`;
        await ZaloAPI.sendMessage(accessToken, '4966494673333610309', successContent);

        const updateDoc = {
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

        updateOneUser(classColl, { studentId: `${studentId}` }, { $set: updateDoc });

        updateTokenInDB(tokenColl, refreshToken);

        res.send('Success');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const deleteStudentRequest = async (req, res) => {
    try {
        await client.connect();
        const db = client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const classColl = db.collection('classUsers');
        const zaloColl = db.collection('zaloUsers');

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

        const successContent = `✅ Xoá thành công!\n\nID Lớp: ${classId}\n\nID HS: ${studentId}\n\nTên HS: ${fullName}`;

        ZaloAPI.sendMessage(accessToken, '4966494673333610309', successContent);

        // set trang thai nghi trong Class Coll
        const updateClassDoc = {
            studentId: studentId,
            classId: `N${classId.slice(-6)}`,
            enrollDate: enrollDate,
            status: 'Nghỉ',
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
        updateOneUser(classColl, { studentId: `${studentId}` }, { $set: updateClassDoc });

        // set trang thai nghi trong Zalo Coll
        const updateZaloDoc = {};
        updateOneUser(zaloColl, { zaloStudentId: `${studentId}` }, { $set: updateZaloDoc });

        updateTokenInDB(tokenColl, refreshToken);

        res.send('Success');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
