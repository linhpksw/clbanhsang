import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';
import * as Tools from './tool.js';

export const cashRequest = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const classColl = db.collection('classUsers');

        const { accessToken, refreshToken } = await MongoDB.readTokenFromDB(tokenColl);

        const webhook = req.body;

        console.log(webhook);
        res.send('Success');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

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

        await MongoDB.insertOneUser(classColl, newDoc);

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
        const studentInfoColl = db.collection('studentInfo');

        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

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

        const zaloParentIdArr = await Tools.findZaloIdFromStudentId(zaloColl, studentId, 'Phụ huynh');
        const zaloStudentIdArr = await Tools.findZaloIdFromStudentId(zaloColl, studentId, 'Học sinh');

        // Doi tag hoc sinh tu Nghi hoc >>> Dang hoc tren Zalo OA Chat (Truong hop them lai HS)
        // Dung vong lap de thay doi het tag cua PH lien ket voi studentId
        if (zaloParentIdArr.length > 0) {
            for (let i = 0; i < zaloParentIdArr.length; i++) {
                const [zaloId, zaloClass] = zaloParentIdArr[i];

                if (zaloClass.includes('N')) {
                    await ZaloAPI.removeFollowerFromTag(accessToken, zaloId, zaloClass);
                    await ZaloAPI.tagFollower(accessToken, zaloId, zaloClass.slice(-6));

                    // set trang thai phu huynh di hoc lai trong Zalo Coll
                    await MongoDB.updateOneUser(
                        zaloColl,
                        { zaloUserId: zaloId, 'students.zaloStudentId': parseInt(studentId) },
                        { $set: { 'students.$.zaloClassId': `${zaloClass.slice(-6)}` } }
                    );
                }
            }
        }

        // Dung vong lap de thay doi het tag cua HS lien ket voi studentId
        if (zaloStudentIdArr.length > 0) {
            for (let i = 0; i < zaloIdArr.length; i++) {
                const [zaloId, zaloClass] = zaloStudentIdArr[i];

                if (zaloClass.includes('N')) {
                    await ZaloAPI.removeFollowerFromTag(accessToken, zaloId, zaloClass);
                    await ZaloAPI.tagFollower(accessToken, zaloId, zaloClass.slice(-6));

                    // set trang thai hoc sinh di hoc trong Zalo Coll
                    await MongoDB.updateOneUser(
                        zaloColl,
                        { zaloUserId: zaloId, 'students.zaloStudentId': parseInt(studentId) },
                        { $set: { 'students.$.zaloClassId': `${zaloClass}` } }
                    );
                }
            }
        }

        // set trang thai di hoc lai trong Student Info Coll
        await MongoDB.updateOneUser(
            studentInfoColl,
            { studentId: parseInt(studentId) },
            { $set: { classId: classId } }
        );

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

        await MongoDB.updateOneUser(classColl, { studentId: parseInt(studentId) }, { $set: updateDoc });

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

        const studentInfoColl = db.collection('studentInfo');

        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

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

        // Doi tag hoc sinh tu Dang hoc >>> Nghi hoc tren Zalo OA Chat
        const zaloParentIdArr = await Tools.findZaloIdFromStudentId(zaloColl, studentId, 'Phụ huynh');
        const zaloStudentIdArr = await Tools.findZaloIdFromStudentId(zaloColl, studentId, 'Học sinh');

        // Dung vong lap de thay doi het tag cua PH lien ket voi studentId
        if (zaloParentIdArr.length > 0) {
            for (let i = 0; i < zaloParentIdArr.length; i++) {
                const [zaloId, zaloClass] = zaloParentIdArr[i];

                await ZaloAPI.removeFollowerFromTag(accessToken, zaloId, zaloClass);
                await ZaloAPI.tagFollower(accessToken, zaloId, `N${zaloClass}`);

                // set trang thai nghi phu huynh trong Zalo Coll
                await MongoDB.updateOneUser(
                    zaloColl,
                    { zaloUserId: zaloId, 'students.zaloStudentId': parseInt(studentId) },
                    { $set: { 'students.$.zaloClassId': `N${zaloClass}` } }
                );
            }
        }

        // Dung vong lap de thay doi het tag cua HS lien ket voi studentId
        if (zaloStudentIdArr.length > 0) {
            for (let i = 0; i < zaloStudentIdArr.length; i++) {
                const [zaloId, zaloClass] = zaloStudentIdArr[i];

                await ZaloAPI.removeFollowerFromTag(accessToken, zaloId, zaloClass);
                await ZaloAPI.tagFollower(accessToken, zaloId, `N${zaloClass}`);

                // set trang thai nghi hoc sinh trong Zalo Coll
                await MongoDB.updateOneUser(
                    zaloColl,
                    { zaloUserId: zaloId, 'students.zaloStudentId': parseInt(studentId) },
                    { $set: { 'students.$.zaloClassId': `N${zaloClass}` } }
                );
            }
        }

        // set trang thai nghi trong Class Coll
        const updateClassDoc = {
            studentId: parseInt(studentId),
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
        await MongoDB.updateOneUser(classColl, { studentId: parseInt(studentId) }, { $set: updateClassDoc });

        // Set trang thai nghi tren StudentInfoColl
        const updateStudentInfoDoc = { classId: `N${classId.slice(-6)}` };

        await MongoDB.updateOneUser(
            studentInfoColl,
            { studentId: parseInt(studentId) },
            { $set: updateStudentInfoDoc }
        );

        res.send('Success');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const updateClassRequest = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const classInfoColl = db.collection('classInfo');

        const webhook = req.body;

        for (const property in webhook) {
            if (webhook[property] == '') {
                webhook[property] = null;
            }
        }

        const {
            classId,
            className,
            room,
            description,
            status,
            currentTerm,
            totalDate,
            tuition,
            startTerm,
            endTerm,
            absentSubject1,
            absentSubject2,
            subjects,
        } = webhook;

        const totalSubject = subjects.split(' ,'); // loi format tu appsheet

        const shortNameSubject2Full = {
            HH: 'Hình học',
            ĐS: 'Đại số',
            SH: 'Số học',
            GT: 'Giải tích',
        };

        const [subjectAbsentDay1, absentDates1] = absentSubject1.split('-');
        const [subjectAbsentDay2, absentDates2] = absentSubject2.split('-');

        const absentDay = {
            [subjectAbsentDay1]: absentDates1 === '' ? null : absentDates1.split(', '),
            [subjectAbsentDay2]: absentDates2 === '' ? null : absentDates2.split(', '),
        };

        const newSubjects = totalSubject.map((subject) => {
            const [subjectName, subjectTeacher, subjectDay, subjectStart, subjectEnd] = subject.split('-');

            const subjectAbsent = absentDay[subjectDay];

            return {
                name: shortNameSubject2Full[subjectName],
                teacher: subjectTeacher,
                day: subjectDay,
                start: subjectStart,
                end: subjectEnd,
                absent: subjectAbsent,
            };
        });

        const term = parseInt(currentTerm.split('D')[1]);

        const newDoc = {
            className: className,
            room: parseInt(room),
            description: description,
            status: status,
            currentTerm: term,
            totalDate: parseInt(totalDate),
            tuition: tuition,
            startTerm: startTerm,
            endTerm: endTerm,
            subjects: newSubjects,
        };

        await MongoDB.updateOneUser(classInfoColl, { classId: classId }, { $set: newDoc });

        res.send('Success');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
