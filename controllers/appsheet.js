import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const createStudentRequest = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const classColl = db.collection('classUsers');

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

        const pipeline = [
            {
                $match: {
                    'students.zaloStudentId': parseInt(studentId),
                },
            },
            {
                $project: {
                    _id: 0,
                    zaloUserId: 1,
                    displayName: 1,
                    userPhone: 1,
                    students: {
                        $filter: {
                            input: '$students',
                            as: 'item',
                            cond: {
                                $eq: ['$$item.zaloStudentId', parseInt(studentId)],
                            },
                        },
                    },
                },
            },
        ];

        const aggCursor = zaloColl.aggregate(pipeline);
        const result = await aggCursor.toArray();

        // Doi tag hoc sinh tu Nghi hoc >>> Dang hoc tren Zalo OA Chat (Truong hop them lai HS)
        // Dung vong lap de thay doi het tag lien ket voi studentId
        if (result.length !== 0) {
            const { zaloUserId, students } = result[0];
            // Khong can vong lap students vi query ra dung hoc sinh roi
            const { zaloClassId } = students[0];

            if (zaloClassId.includes('N')) {
                await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, zaloClassId);
                await ZaloAPI.tagFollower(accessToken, zaloUserId, classId);

                // set trang thai di hoc lai trong Zalo Coll
                await MongoDB.updateOneUser(
                    zaloColl,
                    { zaloUserId: zaloUserId, 'students.zaloStudentId': parseInt(studentId) },
                    { $set: { 'students.$.zaloClassId': classId } }
                );
            }

            // truong hop chuyen sang ID lop khac cung khoi
            else {
                await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, zaloClassId);
                await ZaloAPI.tagFollower(accessToken, zaloUserId, classId);

                // set ma lop hoc moi trong Zalo Coll
                await MongoDB.updateOneUser(
                    zaloColl,
                    { zaloUserId: zaloUserId, 'students.zaloStudentId': parseInt(studentId) },
                    { $set: { 'students.$.zaloClassId': classId } }
                );
            }
        }

        // set trang thai di hoc lai trong StudentInfo Coll
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

        await classColl.updateOne({ studentId: parseInt(studentId) }, { $set: updateDoc }, { upsert: true });

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

        const pipeline = [
            {
                $match: {
                    'students.zaloStudentId': parseInt(studentId),
                },
            },
            {
                $project: {
                    zaloUserId: 1,
                    displayName: 1,
                    userPhone: 1,
                    _id: 0,
                    students: {
                        $filter: {
                            input: '$students',
                            as: 'item',
                            cond: {
                                $eq: ['$$item.zaloStudentId', parseInt(studentId)],
                            },
                        },
                    },
                },
            },
        ];

        const aggCursor = zaloColl.aggregate(pipeline);
        const result = await aggCursor.toArray();

        // Doi tag hoc sinh tu Dang hoc >>> Nghi hoc tren Zalo OA Chat
        // Dung vong lap de thay doi het tag lien ket voi studentId
        if (result.length !== 0) {
            for (let i = 0; i < result.length; i++) {
                const { zaloUserId, students } = result[i];
                // Khong can vong lap students vi query ra dung hoc sinh roi
                const { zaloClassId } = students[0];

                await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, zaloClassId);
                await ZaloAPI.tagFollower(accessToken, zaloUserId, `N${zaloClassId}`);

                // set trang thai nghi trong Zalo Coll
                await MongoDB.updateOneUser(
                    zaloColl,
                    { zaloUserId: zaloUserId, 'students.zaloStudentId': parseInt(studentId) },
                    { $set: { 'students.$.zaloClassId': `N${zaloClassId}` } }
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
            status,
            currentTerm,
            totalDate,
            tuition,
            startTerm,
            endTerm,
            absentSubject1,
            absentSubject2,
            subjects,
            username,
            password,
            code,
        } = webhook;

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

        const newSubjects = subjects.map((subject) => {
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
            status: status,
            currentTerm: term,
            totalDate: parseInt(totalDate),
            tuition: tuition,
            startTerm: startTerm,
            endTerm: endTerm,
            subjects: newSubjects,
            username: username,
            password: password,
            code: code,
        };

        await classInfoColl.updateOne({ classId: classId }, { $set: newDoc }, { upsert: true });

        res.send('Success');
    } catch (err) {
        console.error(err);
    } finally {
    }
};
