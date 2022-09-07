import * as Tools from './tool.js';
import * as ZaloAPI from './zalo.js';
import * as MongoDB from './mongo.js';
import { google } from 'googleapis';
import fetch from 'node-fetch';
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

export const syncTuition = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const classColl = db.collection('classUsers');
        const transactionsColl = db.collection('transactions');
        const studentInfoColl = db.collection('studentInfo');
        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

        const { data } = req.body;

        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                processTransaction(
                    client,
                    data,
                    transactionsColl,
                    classColl,
                    studentInfoColl,
                    accessToken,
                    false
                );
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const cassoRequest = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const classColl = db.collection('classUsers');
        const transactionsColl = db.collection('transactions');
        const studentInfoColl = db.collection('studentInfo');
        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

        const { data } = req.body;

        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                processTransaction(
                    client,
                    data,
                    transactionsColl,
                    classColl,
                    studentInfoColl,
                    accessToken,
                    false
                );
            }
        });

        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

export const unsendTransaction = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const transactionsColl = db.collection('transactions');
        const studentInfoColl = db.collection('studentInfo');

        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                processUnsendTransaction(client, transactionsColl, studentInfoColl);
            }
        });
        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

async function processUnsendTransaction(client, transactionsColl, studentInfoColl) {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const ssIdCoPhuTrach = '1-8aVO7j4Pu9vJ9h9ewha18UHA9z6BJy2909g8I1RrPM';

    const getRequest = {
        spreadsheetId: ssIdCoPhuTrach,
        range: 'Giao dịch',
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
    };

    const getResponse = (await sheets.spreadsheets.values.get(getRequest)).data;

    const { values } = getResponse;

    for (let i = 0; i < values.length; i++) {
        const [when, id, tid, description, amount, cuSumBalance, extractId, status] = values[i];
        const studentId = parseInt(extractId);

        if (status === 'Thu hồi') {
            // Xoa giao dich trong Transaction Coll
            MongoDB.deleteOneUser(transactionsColl, { tid: tid });

            // Xoa giao dich tren sheet Tro giang
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

            const { terms, classId } = result[0];

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

            const clearRequest = {
                spreadsheetId: ssId[classId],
                range: `Hocphi_L${grade[classId]}_D${term}!C${index}:E${index}`,
            };
            // Cho xoa tren sheet Tro giang xong moi trigger script
            await sheets.spreadsheets.values.clear(clearRequest);

            // (Khong can cap nhat trong StudentInfo Coll vi trigger script tren sheet Tro giang roi)
            const formUrl = {
                '2004A1':
                    'https://docs.google.com/forms/d/1HnasP-K1tkx7ihhOuf2-0JOm36EdKuOgTbdolUYm5ac/formResponse',
                '2005A0':
                    'https://docs.google.com/forms/d/1QXrydf4tnstORVYKi9apuEf2cFZi5GKaMEViJ27Kz0M/formResponse',
                '2005A1':
                    'https://docs.google.com/forms/d/1nOESXV1E89UlejetrUd5LUDEKKWWh8VYhRp_4QezEzc/formResponse',
                '2006A0':
                    'https://docs.google.com/forms/d/1ZgntyY1vLEVpi1AZtnLG6x1fFjH3LsMWPaeU0mSLZ-s/formResponse',
                '2006A1':
                    'https://docs.google.com/forms/d/1rAdDc_KU3RfJgANSzSPogYtE6R25NrUxCunaigEZuXM/formResponse',
                '2007A0':
                    'https://docs.google.com/forms/d/1SonkiEyV3ceJsxRVXg7QZK0vLo29ih50GgvnRm7t83E/formResponse',
                '2007A1':
                    'https://docs.google.com/forms/d/1-QnECtC9BoRn3TTSsLusuFz6K1IGB9aAkY0tu8-AMmI/formResponse',
                '2008A0':
                    'https://docs.google.com/forms/d/1vAf8s6lNXJWvhhiRj0AkfuRk0KGBr4Xq0aHp-aHsY4M/formResponse',
                '2008A1':
                    'https://docs.google.com/forms/d/1vA_LqZXNYHMt7XYy1lICPFslldYLymOEglNkq4aI-E0/formResponse',
                '2008A2':
                    'https://docs.google.com/forms/d/1otWyCk9MYRuu9rDF2Zz3vc8-PXtuBhbkgpj7kuObj3U/formResponse',
                '2009A0':
                    'https://docs.google.com/forms/d/1xZknFWSUIAgNLbKn9hbXJlGWOFklgJGaeXTa-LRISmo/formResponse',
                '2009A1':
                    'https://docs.google.com/forms/d/1ok6rZ52nm0SW6QYCns6_PDQpA0yYcj9rwOkP96WNwD0/formResponse',
            };
            const URL = `${formUrl[classId]}`;

            await fetch(URL, { method: 'post' });

            const unsendIndex = i + 1;

            // Cap nhat trang thai "Da thu hoi" tren sheet Giao dich
            const updateRequest = {
                spreadsheetId: ssIdCoPhuTrach,
                range: `Giao dịch!H${unsendIndex}`,
                valueInputOption: 'USER_ENTERED',
                responseDateTimeRenderOption: 'FORMATTED_STRING',
                resource: {
                    majorDimension: 'ROWS',
                    range: `Giao dịch!H${unsendIndex}`,
                    values: [['Đã thu hồi']],
                },
            };

            sheets.spreadsheets.values.update(updateRequest);

            // Cap nhat lai hoc phi trong StudentInfo Coll

            // const gradeTuition = {
            //     '2004A1': 100000,
            //     '2005A0': 100000,
            //     '2005A1': 100000,
            //     '2006A0': 100000,
            //     '2006A1': 100000,
            //     '2007A0': 100000,
            //     '2007A1': 100000,
            //     '2008A0': 120000,
            //     '2008A1': 120000,
            //     '2008A2': 100000,
            //     '2009A0': 120000,
            //     '2009A1': 120000,
            // };

            // const updateDoc = {
            //     'terms.$.payment': null,
            //     'terms.$.type': null,
            //     'terms.$.paidDate': null,
            //     'terms.$.remainder': -study * gradeTuition[classId] + remainderBefore,
            // };

            // MongoDB.updateOneUser(
            //     studentInfoColl,
            //     { studentId: parseInt(studentId), 'terms.term': parseInt(term) },
            //     { $set: updateDoc }
            // );
        }
    }
}

export const failExtract = async (req, res) => {
    try {
        await MongoDB.client.connect();
        const db = MongoDB.client.db('zalo_servers');
        const tokenColl = db.collection('tokens');
        const classColl = db.collection('classUsers');
        const transactionsColl = db.collection('transactions');
        const studentInfoColl = db.collection('studentInfo');
        const { accessToken } = await MongoDB.readTokenFromDB(tokenColl);

        client.authorize((err) => {
            if (err) {
                console.error(err);
                return;
            } else {
                processIdManually(client, transactionsColl, classColl, studentInfoColl, accessToken);
            }
        });
        res.send('Done!');
    } catch (err) {
        console.error(err);
    } finally {
    }
};

async function processIdManually(client, transactionsColl, classColl, studentInfoColl, accessToken) {
    const sheets = google.sheets({ version: 'v4', auth: client });
    const ssIdCoPhuTrach = '1-8aVO7j4Pu9vJ9h9ewha18UHA9z6BJy2909g8I1RrPM';

    const getRequest = {
        spreadsheetId: ssIdCoPhuTrach,
        range: 'Giao dịch',
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
    };

    const getResponse = (await sheets.spreadsheets.values.get(getRequest)).data;

    const { values } = getResponse;

    let data = [];
    let clearStatusIndex = [];
    let clearOldTransactionIndex = [];

    for (let i = 0; i < values.length; i++) {
        const [when, id, tid, description, amount, cuSumBalance, extractId, extractStatus] = values[i];

        if (typeof extractId === 'number' && extractStatus === 'Lỗi') {
            const [date, time] = when.split('_');
            const [day, month, year] = date.split('/');
            const [hour, minute] = time.split(':');

            const formatWhen = `${year}-${month}-${day} ${hour}:${minute}:00`;

            data.push({
                id: id,
                tid: tid,
                description: description + ' ' + extractId,
                amount: amount,
                cusum_balance: cuSumBalance,
                when: formatWhen,
            });
            clearOldTransactionIndex.push(i + 1);
        } else if (extractId === 'x' && extractStatus === 'Lỗi') {
            clearStatusIndex.push(i + 1);
        }
    }

    // Clear status
    const clearStatusRange = clearStatusIndex.map((v) => `Giao dịch!H${v}`);
    const clearOldTransactionRange = clearOldTransactionIndex.map((v) => `Giao dịch!A${v}:H${v}`);

    const clearRange = [...clearStatusRange, ...clearOldTransactionRange];

    const clearRequest = {
        spreadsheetId: ssIdCoPhuTrach,
        resource: {
            ranges: clearRange,
        },
    };

    await sheets.spreadsheets.values.batchClear(clearRequest);

    // Gui cac giao dich da them Id den server nhu Casso lam
    processTransaction(client, data, transactionsColl, classColl, studentInfoColl, accessToken, true);
}

async function processTransaction(
    client,
    data,
    transactionsColl,
    classColl,
    studentInfoColl,
    accessToken,
    isManual
) {
    for (let i = 0; i < data.length; i++) {
        const { id, tid, description, amount, cusum_balance, when } = data[i];
        // kiem tra giao dich da ton tai trong CSDL chua (Bang ma Casso id)
        const isExist = await MongoDB.findOneUser(transactionsColl, { id: id }, { projection: { _id: 0 } });

        // Neu ton tai thi bo qua
        if (isExist !== null) continue;

        // Tach ID tu noi dung chuyen khoan
        const extractId = await extractStudentId(description, classColl);

        let extractStatus = '';
        if (extractId === 'N/A') extractStatus = 'Lỗi';

        const uploadTransasction = [
            [when, id, tid, description, amount, cusum_balance, extractId, extractStatus],
        ];

        // Neu tach khong thanh cong
        if (extractId === 'N/A') {
            // do something
            processFail2ExtractId(client, uploadTransasction, accessToken);
            continue;
        }

        // Neu tach thanh cong
        // Day du lieu vao Transactions Coll
        const doc = {
            when: new Date(when),
            id: id,
            tid: parseInt(tid),
            description: description,
            amount: parseInt(amount),
            cuSumBalance: parseInt(cusum_balance),
            extractId: parseInt(extractId),
        };
        MongoDB.insertOneUser(transactionsColl, doc);

        // Check thong tin hoc phi cua HS dot hien tai
        const pipeline = [
            {
                $match: {
                    studentId: parseInt(extractId),
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

        const { terms, classId, studentId, studentName } = result[0];

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

        let paid = 0;
        if (payment !== null) paid = payment;

        let tuitionStatus;

        // Neu chua dong hoc lan nao trong dot
        if (payment === null) {
            if (amount === billing) {
                tuitionStatus = 'nộp đủ ✅';
            } else if (amount > billing) {
                const diff = amount - billing;
                tuitionStatus = `thừa ${Tools.formatCurrency(diff)}🔔`;
            } else {
                const diff = billing - amount;
                tuitionStatus = `thiếu ${Tools.formatCurrency(diff)}❌`;
            }
        }

        // Neu dong them tien hoc trong dot
        // TH1: billing: 1.000.000/payment: 1.000.000
        // TH2: billing: 1.000.000/payment: 800.000
        // Th3: billing: 1.000.000/payment: 1.200.000
        else {
            // Truong hop hoc phi bang so tien da nop
            if (billing === payment) {
                tuitionStatus = `thừa ${Tools.formatCurrency(amount)}🔔`;
            }
            // Truong hop hoc phi > so tien da nop
            else if (billing > payment) {
                const diff = billing - payment; // 200.000
                if (amount > diff) {
                    tuitionStatus = `thừa ${Tools.formatCurrency(amount - diff)}🔔`;
                } else if (amount < diff) {
                    tuitionStatus = `thiếu ${Tools.formatCurrency(diff - amount)}❌`;
                } else {
                    tuitionStatus = 'nộp đủ✅';
                }
            }
            // Truong hop hoc phi < so tien da nop
            else {
                const diff = payment - billing;
                tuitionStatus = `thừa ${Tools.formatCurrency(amount + diff)}🔔`;
            }
        }

        const formatWhenDateTime = new Date(when).toLocaleString('vi-VN', {
            hour: 'numeric',
            minute: 'numeric',
            day: 'numeric',
            month: 'numeric',
            year: 'numeric',
        });

        const confirmTuition = `Trung tâm Toán Ánh Sáng xác nhận phụ huynh ${studentName} ${studentId} đã nộp thành công học phí đợt ${term} với thông tin như sau:
-----------------------------------
- Thời gian: ${formatWhenDateTime}
- Hình thức: chuyển khoản
-----------------------------------
- Học phí: ${Tools.formatCurrency(billing)}
- Đã nộp: ${Tools.formatCurrency(amount + paid)}
- Trạng thái: ${tuitionStatus}
-----------------------------------
Nếu thông tin trên chưa chính xác, phụ huynh vui lòng nhắn tin lại cho OA để trung tâm kịp thời xử lý. Cảm ơn quý phụ huynh!`;

        // Gui tin nhan xac nhan den phu huynh
        await ZaloAPI.sendMessage(accessToken, '4966494673333610309', confirmTuition);

        // Chia ve moi lop
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

        const gradeIndex = {
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

        const formatWhenDate = new Date(when).toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });

        const updateRequest = {
            spreadsheetId: ssId[classId],
            range: `Hocphi_L${gradeIndex[classId]}_D${term}!C${index}:E${index}`,
            valueInputOption: 'USER_ENTERED',
            responseDateTimeRenderOption: 'FORMATTED_STRING',
            resource: {
                majorDimension: 'ROWS',
                range: `Hocphi_L${gradeIndex[classId]}_D${term}!C${index}:E${index}`,
                values: [[amount + paid, 'CK', formatWhenDate]],
            },
        };

        // Cho cap nhat len sheet xong moi trigger script
        await sheets.spreadsheets.values.update(updateRequest);

        const formUrl = {
            '2004A1':
                'https://docs.google.com/forms/d/1HnasP-K1tkx7ihhOuf2-0JOm36EdKuOgTbdolUYm5ac/formResponse',
            '2005A0':
                'https://docs.google.com/forms/d/1QXrydf4tnstORVYKi9apuEf2cFZi5GKaMEViJ27Kz0M/formResponse',
            '2005A1':
                'https://docs.google.com/forms/d/1nOESXV1E89UlejetrUd5LUDEKKWWh8VYhRp_4QezEzc/formResponse',
            '2006A0':
                'https://docs.google.com/forms/d/1ZgntyY1vLEVpi1AZtnLG6x1fFjH3LsMWPaeU0mSLZ-s/formResponse',
            '2006A1':
                'https://docs.google.com/forms/d/1rAdDc_KU3RfJgANSzSPogYtE6R25NrUxCunaigEZuXM/formResponse',
            '2007A0':
                'https://docs.google.com/forms/d/1SonkiEyV3ceJsxRVXg7QZK0vLo29ih50GgvnRm7t83E/formResponse',
            '2007A1':
                'https://docs.google.com/forms/d/1-QnECtC9BoRn3TTSsLusuFz6K1IGB9aAkY0tu8-AMmI/formResponse',
            '2008A0':
                'https://docs.google.com/forms/d/1vAf8s6lNXJWvhhiRj0AkfuRk0KGBr4Xq0aHp-aHsY4M/formResponse',
            '2008A1':
                'https://docs.google.com/forms/d/1vA_LqZXNYHMt7XYy1lICPFslldYLymOEglNkq4aI-E0/formResponse',
            '2008A2':
                'https://docs.google.com/forms/d/1otWyCk9MYRuu9rDF2Zz3vc8-PXtuBhbkgpj7kuObj3U/formResponse',
            '2009A0':
                'https://docs.google.com/forms/d/1xZknFWSUIAgNLbKn9hbXJlGWOFklgJGaeXTa-LRISmo/formResponse',
            '2009A1':
                'https://docs.google.com/forms/d/1ok6rZ52nm0SW6QYCns6_PDQpA0yYcj9rwOkP96WNwD0/formResponse',
        };
        const URL = `${formUrl[classId]}`;

        await fetch(URL, { method: 'post' });

        // Day len Co Phu Trach (sheet Giao dịch)
        const sheets = google.sheets({ version: 'v4', auth: client });
        const ssIdCoPhuTrach = '1-8aVO7j4Pu9vJ9h9ewha18UHA9z6BJy2909g8I1RrPM';

        const appendRequest = {
            spreadsheetId: ssIdCoPhuTrach,
            range: 'Giao dịch',
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            responseDateTimeRenderOption: 'FORMATTED_STRING',
            resource: {
                majorDimension: 'ROWS',
                values: uploadTransasction,
            },
        };

        sheets.spreadsheets.values.append(appendRequest);

        // Kiem tra Quota
        // Neu tu dong thi moi check Quota
        if (!isManual) {
            const getRequest = {
                spreadsheetId: ssIdCoPhuTrach,
                range: 'Quota',
            };

            const getResponse = (await sheets.spreadsheets.values.get(getRequest)).data;

            const { values } = getResponse;

            let currentAcc = [];

            for (let i = 0; i < values.length; i++) {
                const [no, account, quota, dayLeft, status, warning] = values[i];
                if (status === 'Đang dùng') {
                    const quotaLeft = quota - 1;
                    if (quotaLeft < 10) {
                        // Gui canh bao qua Zalo toi Admin va Co giao
                        const warningMessage = `Hạn mức còn lại là ${quotaLeft}. Cần thực hiện thay đổi ngay!`;
                        await ZaloAPI.sendMessage(accessToken, '4966494673333610309', warningMessage);

                        currentAcc.push(
                            no,
                            account,
                            quotaLeft,
                            dayLeft,
                            status,
                            'Chuyển sang tài khoản bên dưới!'
                        );
                    } else {
                        currentAcc.push(no, account, quotaLeft, dayLeft, status, warning);
                    }
                }
            }

            const [no, account, quotaLeft, dayLeft, status, warning] = currentAcc;
            const iQuota = parseInt(no, 10);
            const updateQuotaRequest = {
                spreadsheetId: ssIdCoPhuTrach,
                range: `Quota!A${iQuota + 1}:F${iQuota + 1}`,
                valueInputOption: 'USER_ENTERED',
                responseDateTimeRenderOption: 'FORMATTED_STRING',
                resource: {
                    majorDimension: 'ROWS',
                    range: `Quota!A${iQuota + 1}:F${iQuota + 1}`,
                    values: [[no, account, quotaLeft, dayLeft, status, warning]],
                },
            };

            sheets.spreadsheets.values.update(updateQuotaRequest);
        }

        // (Khong can cap nhat trong StudentInfo Coll vi trigger script tren sheet Tro giang roi)
        // Cap nhat hoc phi trong StudentInfoColl
        // const gradeTuition = {
        //     '2004A1': 100000,
        //     '2005A0': 100000,
        //     '2005A1': 100000,
        //     '2006A0': 100000,
        //     '2006A1': 100000,
        //     '2007A0': 100000,
        //     '2007A1': 100000,
        //     '2008A0': 120000,
        //     '2008A1': 120000,
        //     '2008A2': 100000,
        //     '2009A0': 120000,
        //     '2009A1': 120000,
        // };

        // const updateDoc = {
        //     'terms.$.payment': amount + paid,
        //     'terms.$.type': 'CK',
        //     'terms.$.paidDate': formatWhenDate,
        //     'terms.$.remainder': amount + paid - study * gradeTuition[classId] + remainderBefore,
        // };

        // MongoDB.updateOneUser(
        //     studentInfoColl,
        //     { studentId: parseInt(studentId), 'terms.term': parseInt(term) },
        //     { $set: updateDoc }
        // );
    }
}

async function processFail2ExtractId(client, uploadTransasction, accessToken) {
    // upload2CoPhuTrach(client, values)
    const sheets = google.sheets({ version: 'v4', auth: client });
    const ssIdCoPhuTrach = '1-8aVO7j4Pu9vJ9h9ewha18UHA9z6BJy2909g8I1RrPM';

    const appendRequest = {
        spreadsheetId: ssIdCoPhuTrach,
        range: 'Giao dịch',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        responseDateTimeRenderOption: 'FORMATTED_STRING',
        resource: {
            majorDimension: 'ROWS',
            values: uploadTransasction,
        },
    };

    sheets.spreadsheets.values.append(appendRequest);

    // Kiem tra Quota
    const getRequest = {
        spreadsheetId: ssIdCoPhuTrach,
        range: 'Quota',
    };

    const getResponse = (await sheets.spreadsheets.values.get(getRequest)).data;

    const { values } = getResponse;

    let currentAcc = [];

    for (let i = 0; i < values.length; i++) {
        const [no, account, quota, dayLeft, status, warning] = values[i];
        if (status === 'Đang dùng') {
            const quotaLeft = quota - 1;
            if (quotaLeft < 10) {
                // Gui canh bao qua Zalo toi Admin va Co giao
                const warningMessage = `Hạn mức còn lại là ${quotaLeft}. Cần thực hiện thay đổi ngay!`;
                await ZaloAPI.sendMessage(accessToken, '4966494673333610309', warningMessage);

                currentAcc.push(no, account, quotaLeft, dayLeft, status, 'Chuyển sang tài khoản bên dưới!');
            } else {
                currentAcc.push(no, account, quotaLeft, dayLeft, status, warning);
            }
        }
    }

    const [no, account, quotaLeft, dayLeft, status, warning] = currentAcc;
    const iQuota = parseInt(no);
    const updateQuotaRequest = {
        spreadsheetId: ssIdCoPhuTrach,
        range: `Quota!A${iQuota + 1}:F${iQuota + 1}`,
        valueInputOption: 'USER_ENTERED',
        responseDateTimeRenderOption: 'FORMATTED_STRING',
        resource: {
            majorDimension: 'ROWS',
            range: `Quota!A${iQuota + 1}:F${iQuota + 1}`,
            values: [[no, account, quotaLeft, dayLeft, status, warning]],
        },
    };

    sheets.spreadsheets.values.update(updateQuotaRequest);
}

async function extractStudentId(str, classColl) {
    let id = 'N/A';

    const extractNum = str.replace(/\D/g, '');
    const extractId = extractNum.match(/200[4,5,6,7,8,9]\d{3}/g);

    // Id tach tu noi dung CK phai dung 7 so va chi duoc 1 id
    if (extractId !== null && extractId.length === 1) {
        for (let i = 0; i < extractId.length; i++) {
            const formatId = parseInt(extractId[i], 10);

            const existId = await MongoDB.findOneUser(
                classColl,
                { studentId: formatId },
                { projection: { _id: 0 } }
            );

            if (existId !== null) id = formatId;
        }
    }
    return id;
}
