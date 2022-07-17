import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';
import * as Tools from './tool.js';

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

        // const successContent = `✅ Thêm mới thành công học sinh ${fullName} ${studentId} mã lớp ${classId}.`;
        // await ZaloAPI.sendMessage(accessToken, '4966494673333610309', successContent);

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
        const zaloColl = db.collection('zaloUsers');
        const managerColl = db.collection('managers');

        const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

        const webhook = req.body;

        for (const property in webhook) {
            if (webhook[property] == '') {
                webhook[property] = null;
            }
        }

        const {
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

        // const successContent = `🔄 Cập nhật thành công học sinh ${fullName} (${studentId}) mã lớp ${classId}.`;

        // await Tools.sendMessage2Assistant(
        //     accessToken,
        //     refreshToken,
        //     tokenColl,
        //     managerColl,
        //     classId,
        //     successContent
        // );

        const zaloIdArr = await Tools.findZaloIdFromStudentId(zaloColl, studentId);
        // Doi tag hoc sinh tu Nghi hoc >>> Dang hoc tren Zalo OA Chat (Truong hop them lai HS)
        // Dung vong lap de thay doi het tag cua PH & HS lien ket voi studentId
        if (zaloIdArr.length > 0) {
            for (let i = 0; i < zaloIdArr.length; i++) {
                const [zaloId, classId] = zaloIdArr[i];

                if (classId.includes('N')) {
                    await ZaloAPI.removeFollowerFromTag(accessToken, zaloId, `N${classId}`);
                    await ZaloAPI.tagFollower(accessToken, zaloId, classId);

                    // set trang thai di hoc lai trong Zalo Coll
                    MongoDB.updateOneUser(
                        zaloColl,
                        { zaloUserId: zaloId, 'students.zaloStudentId': parseInt(studentId) },
                        { $set: { 'students.$.zaloClassId': `${classId}` } }
                    );
                }
            }
        }

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
        const managerColl = db.collection('managers');

        const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

        const webhook = req.body;

        for (const property in webhook) {
            if (webhook[property] == '') {
                webhook[property] = null;
            }
        }

        const {
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

        // // Gui tin nhan ket qua den Zalo tro giang
        // const successContent = `🗑️ Xoá thành công học sinh ${fullName} (${studentId}) mã lớp ${classId}.`;

        // await Tools.sendMessage2Assistant(
        //     accessToken,
        //     refreshToken,
        //     tokenColl,
        //     managerColl,
        //     classId.slice(-6),
        //     successContent
        // );

        // Doi tag hoc sinh tu Dang hoc >>> Nghi hoc tren Zalo OA Chat

        const zaloIdArr = await Tools.findZaloIdFromStudentId(zaloColl, studentId);
        // Dung vong lap de thay doi het tag cua PH & HS lien ket voi studentId
        if (zaloIdArr.length > 0) {
            for (let i = 0; i < zaloIdArr.length; i++) {
                const [zaloId, classId] = zaloIdArr[i];

                await ZaloAPI.removeFollowerFromTag(accessToken, zaloId, classId);
                await ZaloAPI.tagFollower(accessToken, zaloId, `N${classId}`);

                // set trang thai nghi trong Zalo Coll
                MongoDB.updateOneUser(
                    zaloColl,
                    { zaloUserId: zaloId, 'students.zaloStudentId': parseInt(studentId) },
                    { $set: { 'students.$.zaloClassId': `N${classId}` } }
                );
            }
        }

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
        MongoDB.updateOneUser(classColl, { studentId: parseInt(studentId) }, { $set: updateClassDoc });

        res.send('Success');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
