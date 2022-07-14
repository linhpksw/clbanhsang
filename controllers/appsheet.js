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
            studentId: parseInt(studentId),
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

        const successContent = `🔃 Cập nhật thành công!\n\nID Lớp: ${classId}\n\nID HS: ${studentId}\n\nTên HS: ${fullName}`;
        await ZaloAPI.sendMessage(accessToken, '4966494673333610309', successContent);

        // Chieu nguoc lai neu them HS nghi hoc vao lai lop (lam sau)
        // await ZaloAPI.removeFollowerFromTag(accessToken, '4966494673333610309', `N${classId}`);
        // await ZaloAPI.tagFollower(accessToken, '4966494673333610309', classId);

        const updateDoc = {
            studentId: parseInt(studentId),
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

        updateOneUser(classColl, { studentId: parseInt(studentId) }, { $set: updateDoc });

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

        classId = classId.slice(-6);

        const fullName = `${firstName} ${lastName}`;

        // Gui tin nhan ket qua den Zalo tro giang
        const successContent = `💥 Xoá thành công!\n\nID Lớp: ${classId}\n\nID HS: ${studentId}\n\nTên HS: ${fullName}`;

        await ZaloAPI.sendMessage(accessToken, '4966494673333610309', successContent);

        // Doi tag hoc sinh tu Dang hoc >>> Nghi hoc tren Zalo OA Chat
        await ZaloAPI.removeFollowerFromTag(accessToken, '4966494673333610309', classId);
        await ZaloAPI.tagFollower(accessToken, '4966494673333610309', `N${classId}`);
        // set trang thai nghi trong Class Coll
        const updateClassDoc = {
            studentId: parseInt(studentId),
            classId: `N${classId}`,
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
        updateOneUser(classColl, { studentId: parseInt(studentId) }, { $set: updateClassDoc });

        // set trang thai nghi trong Zalo Coll
        updateOneUser(
            zaloColl,
            { 'students.zaloStudentId': parseInt(studentId) },
            { $set: { 'students.$.zaloClassId': `N${classId}` } }
        );

        updateTokenInDB(tokenColl, refreshToken);

        res.send('Success');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
