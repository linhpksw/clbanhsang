import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';

export const createStudentRequest = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const classColl = db.collection('classUsers');

        const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

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

        const successContent = `✅ Thêm mới thành công!\n\nID Lớp: ${classId}\nID HS: ${studentId}\nTên HS: ${fullName}`;
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

        MongoDB.insertOneUser(classColl, newDoc);

        MongoDB.updateTokenInDB(tokenColl, refreshToken);

        res.send('Success');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const updateStudentRequest = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const classColl = db.collection('classUsers');

        const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

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

        const successContent = `🔄 Cập nhật thành công!\n\nID Lớp: ${classId}\nID HS: ${studentId}\nTên HS: ${fullName}`;
        await ZaloAPI.sendMessage(accessToken, '4966494673333610309', successContent);

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

        MongoDB.updateOneUser(classColl, { studentId: parseInt(studentId) }, { $set: updateDoc });

        MongoDB.updateTokenInDB(tokenColl, refreshToken);

        res.send('Success');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const deleteStudentRequest = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const classColl = db.collection('classUsers');
        const zaloColl = db.collection('zaloUsers');

        const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

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
        const successContent = `🗑️ Xoá thành công!\n\nID Lớp: ${classId}\nID HS: ${studentId}\nTên HS: ${fullName}`;

        await ZaloAPI.sendMessage(accessToken, '4966494673333610309', successContent);

        // Doi tag hoc sinh tu Dang hoc >>> Nghi hoc tren Zalo OA Chat
        // const isStudentIdExistInZaloColl = zaloColl.find({
        //     students: { zaloStudentId: studentId },
        // });
        const isStudentIdExistInZaloColl = zaloColl.find({
            'students.zaloStudentId': studentId,
        });

        console.log('----------------------------------');
        console.log(isStudentIdExistInZaloColl);
        console.log('----------------------------------');
        // console.log(isStudentIdExistInZaloColl);
        // console.log('----------------------------------');
        // console.log(await isStudentIdExistInZaloColl.toArray());
        // console.log('----------------------------------');

        // if (isStudentIdExistInZaloColl !== null) {
        //     await ZaloAPI.removeFollowerFromTag(accessToken, '4966494673333610309', classId);
        //     await ZaloAPI.tagFollower(accessToken, '4966494673333610309', `N${classId}`);

        //     // set trang thai nghi trong Zalo Coll
        //     MongoDB.updateOneUser(
        //         zaloColl,
        //         { 'students.zaloStudentId': parseInt(studentId) },
        //         { $set: { 'students.$.zaloClassId': `N${classId}` } }
        //     );
        // }

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
        MongoDB.updateOneUser(
            classColl,
            { studentId: parseInt(studentId) },
            { $set: updateClassDoc }
        );

        MongoDB.updateTokenInDB(tokenColl, refreshToken);

        res.send('Success');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
