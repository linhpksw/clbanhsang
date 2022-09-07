import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';
import { google } from 'googleapis';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as dotenv from 'dotenv';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const CLIENT_EMAIL = process.env.CLIENT_EMAIL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCOPE = process.env.SCOPE;
const client = new google.auth.JWT(CLIENT_EMAIL, null, PRIVATE_KEY, [SCOPE]);

export const cashRequest = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const studentInfoColl = db.collection('studentInfo');
        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

        const data = req.body;

        const { studentId, classId, paymentMethod, amount, date, time, invoice, name } = data;

        const [day, month, year] = date.split('/');
        const [hour, minute, second] = time.split(' ')[0].split(':');

        const when = `${year}-${month}-${day} ${hour}:${minute}:${second}`;
        const formatAmount = parseInt(amount.replace(/\D/g, ''));

        // Check thong tin hoc phi cua HS dot hien tai
        const pipeline = [
            {
                $match: {
                    studentId: parseInt(studentId),
                },
            },
            {
                $project: {
                    studentId: 1,
                    studentName: 1,
                    classId: 1,
                    terms: {
                        $filter: {
                            input: '$terms',
                            as: 'item',
                            cond: {
                                $eq: [
                                    '$$item.term',
                                    {
                                        $max: '$terms.term',
                                    },
                                ],
                            },
                        },
                    },
                },
            },
        ];

        const aggCursor = studentInfoColl.aggregate(pipeline);
        const result = await aggCursor.toArray();

        const { terms } = result[0];

        const {
            index, // vi tri hoc sinh
            term, // dot hien tai
            start, // bat dau dot
            end, // ket thuc dot
            total, // so buoi trong dot
            study, // so buoi hoc
            absent, // so buoi nghi
            subject, // mon hoc
            remainderBefore, // du dot truoc
            billing, // phai nop
            payment, // da nop
            type, // hinh thuc nop
            paidDate, // ngay nop
            remainder, // con thua
            attendances,
            absences,
        } = terms[0];

        let tuitionStatus;

        if (formatAmount === billing) {
            tuitionStatus = 'nộp đủ ✅';
        } else if (formatAmount > billing) {
            const diff = formatAmount - billing;
            tuitionStatus = `thừa ${Tools.formatCurrency(diff)}🔔`;
        } else {
            const diff = billing - formatAmount;
            tuitionStatus = `thiếu ${Tools.formatCurrency(diff)}❌`;
        }

        const formatWhenDateTime = new Date(when).toLocaleString('vi-VN', {
            hour: 'numeric',
            minute: 'numeric',
            day: 'numeric',
            month: 'numeric',
            year: 'numeric',
        });

        const confirmTuition = `Trung tâm Toán Ánh Sáng xác nhận phụ huynh ${name} ${studentId} đã nộp thành công học phí đợt ${term} với thông tin và biên lai như sau:
-----------------------------------
- Thời gian: ${formatWhenDateTime}
- Hình thức: tiền mặt
-----------------------------------
- Học phí: ${Tools.formatCurrency(billing)}
- Đã nộp: ${Tools.formatCurrency(formatAmount)}
- Trạng thái: ${tuitionStatus}
-----------------------------------
Nếu thông tin trên chưa chính xác, phụ huynh vui lòng nhắn tin lại cho OA để trung tâm kịp thời xử lý. Cảm ơn quý phụ huynh!`;

        // Gui tin nhan xac nhan den phu huynh
        await ZaloAPI.sendMessage(accessToken, '4966494673333610309', confirmTuition);

        // Gui hinh anh bien lai den phu huynh
        const invoiceMessage = `Biên lai thu học phí đợt ${term} của học sinh ${name}`;
        await ZaloAPI.sendImageByUrl(accessToken, '4966494673333610309', invoiceMessage, invoice);

        //  Chia ve moi lop
        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                processInGoogleSheetsForAppSheet(client, classId, term, index, when, formatAmount);
            }
        });

        // Day giao dich vao Transactions Coll
        const doc = {
            when: new Date(when),
            id: null,
            tid: null,
            type: 'TM',
            description: `${name} ${studentId} HPD${term} đóng tại lớp`,
            amount: parseInt(amount),
            cuSumBalance: null,
            extractId: parseInt(studentId),
        };
        MongoDB.insertOneUser(transactionsColl, doc);

        res.send('Success');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

async function processInGoogleSheetsForAppSheet(client, classId, term, index, when, formatAmount) {
    const sheets = google.sheets({ version: 'v4', auth: client });
    // chiaVeMoiLop(client, classId, term, index, when, formatAmount)
    const ssId = {
        '2004A1': '1tjS890ZbldMlX6yKbn0EksroCU5Yrpi--6OQ5ll1On4',
        '2005A0': '1BBzudjOkjJT6uf9_Ma0kWSXgzEkRRfXnjibqKoeNciA',
        '2005A1': '19brbUkN4ixYaTP-2D7GNr3WC-U7z7F2Wh60L1SelBM4',
        '2006A0': '1ilhObfLr7qUtbSikDvsewTAAlGyjoXYQT8H10l2vpUg',
        '2006A1': '1CLzrEd-cN6av7Vw7xr64hqqpo_kuZA3Vky7aa6iOfPI',
        '2007A0': '16QAf6B7CLhOGbEHtghtMEq5dE_qn4TcShXEIAwA6t40',
        '2007A1': '1XDIOvL8C7NOWutlCJODnPxpCAlhPfHdSiRaC104EMLI',
        '2008A0': '1Pq4bKmVGSsRqOE2peG-RcoNxKwPFBUGsO4tfYl4w8bE',
        '2008A1': '1zRkYE6rgcQUrbbsgeZcc69SjU1LFCk_i6COYhVCZJV4',
        '2008A2': '1wzEFLknH7bsvSpXVQuGwnhmixBRYdvb38SOUW7IREBg',
        '2009A0': '1a5TOzG08Jpl4XkTHppQMFIHQ7jV4jpfWZeT2psZNmYQ',
        '2009A1': '1mlKSeO-1aSIhTwzXofOO2RwoZ64zx-aTBOIVJ-puU4M',
    };

    const grade = {
        '2004A1': 12,
        '2005A0': 12,
        '2005A1': 12,
        '2006A0': 11,
        '2006A1': 11,
        '2007A0': 10,
        '2007A1': 10,
        '2008A0': 9,
        '2008A1': 9,
        '2008A2': 9,
        '2009A0': 8,
        '2009A1': 8,
    };

    const formatWhenDate = new Date(when).toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });

    const updateRequest = {
        spreadsheetId: ssId[classId],
        range: `Hocphi_L${grade[classId]}_D${term}!C${index}:E${index}`,
        valueInputOption: 'USER_ENTERED',
        responseDateTimeRenderOption: 'FORMATTED_STRING',
        resource: {
            majorDimension: 'ROWS',
            range: `Hocphi_L${grade[classId]}_D${term}!C${index}:E${index}`,
            values: [[formatAmount, 'TM', formatWhenDate]],
        },
    };

    // Cho cap nhat giao dich len sheet tro giang truoc khi trigger
    await sheets.spreadsheets.values.update(updateRequest);

    const formUrl = {
        '2004A1': 'https://docs.google.com/forms/d/1HnasP-K1tkx7ihhOuf2-0JOm36EdKuOgTbdolUYm5ac/formResponse',
        '2005A0': 'https://docs.google.com/forms/d/1QXrydf4tnstORVYKi9apuEf2cFZi5GKaMEViJ27Kz0M/formResponse',
        '2005A1': 'https://docs.google.com/forms/d/1nOESXV1E89UlejetrUd5LUDEKKWWh8VYhRp_4QezEzc/formResponse',
        '2006A0': 'https://docs.google.com/forms/d/1ZgntyY1vLEVpi1AZtnLG6x1fFjH3LsMWPaeU0mSLZ-s/formResponse',
        '2006A1': 'https://docs.google.com/forms/d/1rAdDc_KU3RfJgANSzSPogYtE6R25NrUxCunaigEZuXM/formResponse',
        '2007A0': 'https://docs.google.com/forms/d/1SonkiEyV3ceJsxRVXg7QZK0vLo29ih50GgvnRm7t83E/formResponse',
        '2007A1': 'https://docs.google.com/forms/d/1-QnECtC9BoRn3TTSsLusuFz6K1IGB9aAkY0tu8-AMmI/formResponse',
        '2008A0': 'https://docs.google.com/forms/d/1vAf8s6lNXJWvhhiRj0AkfuRk0KGBr4Xq0aHp-aHsY4M/formResponse',
        '2008A1': 'https://docs.google.com/forms/d/1vA_LqZXNYHMt7XYy1lICPFslldYLymOEglNkq4aI-E0/formResponse',
        '2008A2': 'https://docs.google.com/forms/d/1otWyCk9MYRuu9rDF2Zz3vc8-PXtuBhbkgpj7kuObj3U/formResponse',
        '2009A0': 'https://docs.google.com/forms/d/1xZknFWSUIAgNLbKn9hbXJlGWOFklgJGaeXTa-LRISmo/formResponse',
        '2009A1': 'https://docs.google.com/forms/d/1ok6rZ52nm0SW6QYCns6_PDQpA0yYcj9rwOkP96WNwD0/formResponse',
    };

    const URL = `${formUrl[classId]}`;

    await fetch(URL, { method: 'post' });
}

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

        const pipeline = [
            {
                $match: {
                    'students.zaloStudentId': parseInt(studentId),
                },
            },
            {
                $project: {
                    zaloUserId: 1,
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

        // Doi tag hoc sinh tu Nghi hoc >>> Dang hoc tren Zalo OA Chat (Truong hop them lai HS)
        // Dung vong lap de thay doi het tag  lien ket voi studentId
        if (result.length !== 0) {
            for (let i = 0; i < result.length; i++) {
                const { zaloUserId, students } = result[i];
                // Khong can vong lap students vi query ra dung hoc sinh roi
                const { zaloClassId } = students[0];

                if (zaloClassId.includes('N')) {
                    await ZaloAPI.removeFollowerFromTag(accessToken, zaloUserId, zaloClassId);
                    await ZaloAPI.tagFollower(accessToken, zaloUserId, zaloClassId.slice(-6));

                    // set trang thai di hoc lai trong Zalo Coll
                    await MongoDB.updateOneUser(
                        zaloColl,
                        { zaloUserId: zaloUserId, 'students.zaloStudentId': parseInt(studentId) },
                        { $set: { 'students.$.zaloClassId': `${zaloClassId.slice(-6)}` } }
                    );
                }
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

        const pipeline = [
            {
                $match: {
                    'students.zaloStudentId': parseInt(studentId),
                },
            },
            {
                $project: {
                    zaloUserId: 1,
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
